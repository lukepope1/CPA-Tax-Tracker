import { FormEvent, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { api } from "../lib/api";
import { Client, CLIENT_TYPES, ClientType } from "../lib/types";
import { formatPhone } from "../lib/format";
import { useToast } from "../context/ToastContext";
import { useDialog } from "../context/DialogContext";
import { Loading, EmptyState, useSort, SortTh } from "../components/ui";

interface ImportRow {
  name?: string;
  clientType?: ClientType;
  firstName?: string;
  lastName?: string;
  spouseName?: string;
  clientCode?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  fiscalYearEndMonth?: number;
  fiscalYearEndDay?: number;
  notes?: string;
}

const IMPORT_HEADER_MAP: Record<string, keyof ImportRow> = {
  name: "name",
  "client name": "name",
  "client type": "clientType",
  type: "clientType",
  "first name": "firstName",
  "last name": "lastName",
  "spouse name": "spouseName",
  spouse: "spouseName",
  "client code": "clientCode",
  code: "clientCode",
  "contact name": "contactName",
  "contact email": "contactEmail",
  email: "contactEmail",
  "contact phone": "contactPhone",
  phone: "contactPhone",
  "fiscal year end month": "fiscalYearEndMonth",
  "fye month": "fiscalYearEndMonth",
  "fiscal year end day": "fiscalYearEndDay",
  "fye day": "fiscalYearEndDay",
  notes: "notes",
};

// Accepts common spellings/abbreviations for client type and normalizes them
// to one of the canonical CLIENT_TYPES (case-insensitive).
const CLIENT_TYPE_ALIASES: Record<string, ClientType> = {
  corporation: "Corporation",
  "c corp": "Corporation",
  "c corporation": "Corporation",
  individual: "Individual",
  "1040": "Individual",
  "sch e": "Sch. E",
  "sch. e": "Sch. E",
  "schedule e": "Sch. E",
  estate: "Estate",
  trust: "Trust",
  partnership: "Partnership",
  "s corporation": "S Corporation",
  "s corp": "S Corporation",
  "non-profit": "Non-Profit",
  "non profit": "Non-Profit",
  nonprofit: "Non-Profit",
};

function normalizeClientType(raw: string): ClientType | undefined {
  return CLIENT_TYPE_ALIASES[raw.trim().toLowerCase().replace(/\s+/g, " ")];
}

function parseWorkbook(buffer: ArrayBuffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return raw
    .map((row) => {
      const mapped: ImportRow = {};
      for (const [key, value] of Object.entries(row)) {
        const field = IMPORT_HEADER_MAP[key.trim().toLowerCase()];
        if (!field) continue;
        if (field === "fiscalYearEndMonth" || field === "fiscalYearEndDay") {
          const num = Number(value);
          if (!Number.isNaN(num) && num > 0) mapped[field] = num;
        } else if (field === "clientType") {
          const t = normalizeClientType(String(value));
          if (t) mapped.clientType = t;
        } else if (typeof value === "string") {
          if (value.trim()) mapped[field] = value.trim();
        } else if (value != null) {
          mapped[field] = String(value);
        }
      }
      return mapped;
    })
    .filter((row) => !!row.name);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function Clients() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useDialog();
  const [showForm, setShowForm] = useState(false);
  const [clientType, setClientType] = useState<ClientType>("Corporation");
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [spouseName, setSpouseName] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [parentId, setParentId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [fyeMonth, setFyeMonth] = useState(12);
  const [fyeDay, setFyeDay] = useState(31);
  const [search, setSearch] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; updated: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["clients", search],
    queryFn: async () => (await api.get("/clients", { params: search ? { q: search } : undefined })).data,
  });

  const isIndividual = clientType === "Individual" || clientType === "Sch. E";
  const composedName = isIndividual ? `${lastName}, ${firstName}`.trim().replace(/^,\s*/, "") : name;

  const createClient = useMutation({
    mutationFn: async () =>
      (
        await api.post("/clients", {
          name: composedName,
          clientType,
          firstName: isIndividual ? firstName || undefined : undefined,
          lastName: isIndividual ? lastName || undefined : undefined,
          spouseName: isIndividual ? spouseName || undefined : undefined,
          clientCode: clientCode || undefined,
          parentId: parentId || undefined,
          contactName: contactName || undefined,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
          fiscalYearEndMonth: fyeMonth,
          fiscalYearEndDay: fyeDay,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast("Client added.");
      setShowForm(false);
      setClientType("Corporation");
      setName("");
      setFirstName("");
      setLastName("");
      setSpouseName("");
      setClientCode("");
      setParentId("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setFyeMonth(12);
      setFyeDay(31);
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createClient.mutate();
  }

  const deleteClient = useMutation({
    mutationFn: async (clientId: string) => api.delete(`/clients/${clientId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-trash"] });
      toast("Client moved to Trash.");
    },
  });

  const [edit, setEdit] = useState<Client | null>(null);

  const updateClient = useMutation({
    mutationFn: async (c: Client) => {
      const isInd = c.clientType === "Individual" || c.clientType === "Sch. E";
      const name = isInd
        ? `${c.lastName ?? ""}, ${c.firstName ?? ""}`.trim().replace(/^,\s*/, "").replace(/,\s*$/, "") || c.name
        : c.name;
      return (await api.put(`/clients/${c.id}`, { ...c, name })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      setEdit(null);
      toast("Client updated.");
    },
    onError: (err: any) => toast(err.response?.data?.error || "Could not update client.", "error"),
  });

  async function handleDelete(c: Client) {
    const ok = await confirm({
      title: `Delete "${c.name}"?`,
      message: "The client will be moved to the Trash and can be restored for 90 days.",
      confirmLabel: "Move to Trash",
      tone: "danger",
    });
    if (ok) deleteClient.mutate(c.id);
  }

  const importClients = useMutation({
    mutationFn: async (rows: ImportRow[]) => (await api.post("/clients/import", rows)).data as { created: number; updated: number },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setImportResult(data);
      setImportError(null);
      toast(`Import complete: ${data.created} added, ${data.updated} updated.`);
    },
    onError: (err: any) => {
      setImportError(err.response?.data?.error?.formErrors?.[0] || err.response?.data?.error || "Import failed");
      setImportResult(null);
    },
  });

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseWorkbook(buffer);
      if (rows.length === 0) {
        setImportError("No rows with a Name column found in that file.");
      } else {
        importClients.mutate(rows);
      }
    } catch {
      setImportError("Could not read that file. Make sure it's a valid .xlsx or .csv file.");
    } finally {
      e.target.value = "";
    }
  }

  const clientRows = (clients ?? []).map((c) => ({
    client: c,
    id: c.id,
    name: c.name,
    type: c.clientType ?? "",
    code: c.clientCode ?? "",
    parent: c.parent?.name ?? "",
    email: c.contactEmail ?? "",
    fye: c.fiscalYearEndMonth * 100 + c.fiscalYearEndDay,
    engagements: c._count?.engagements ?? 0,
  }));
  const sort = useSort(clientRows, "name");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Clients</h1>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileSelected}
          />
          <button
            className="bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => fileInputRef.current?.click()}
            disabled={importClients.isPending}
          >
            {importClients.isPending ? "Importing..." : "Import from Excel"}
          </button>
          <button
            className="bg-brand-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-brand-700"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "Cancel" : "Add Client"}
          </button>
        </div>
      </div>

      {importError && (
        <p className="text-sm text-red-600">{importError}</p>
      )}
      {importResult && (
        <p className="text-sm text-green-700">
          Import complete: {importResult.created} client{importResult.created === 1 ? "" : "s"} added, {importResult.updated} updated.
        </p>
      )}
      <p className="text-xs text-gray-400">
        Expected columns: Name (required), Client Type (Corporation, Individual, Sch. E, Estate, Trust, Partnership, S Corporation, Non-Profit),
        First Name, Last Name, Spouse Name, Client Code, Contact Name, Contact Email, Contact Phone, Fiscal Year End Month, Fiscal Year End Day, Notes.
        Rows matching an existing Client Code (or Name) are updated; others are added.
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Type</label>
            <select
              className="w-full md:w-64 border border-gray-300 rounded px-3 py-2 text-sm"
              value={clientType}
              onChange={(e) => setClientType(e.target.value as ClientType)}
            >
              {CLIENT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {isIndividual ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Spouse Name (optional)</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={spouseName} onChange={(e) => setSpouseName(e.target.value)} />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client Code (optional)</label>
            <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={clientCode} onChange={(e) => setClientCode(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Client (optional)</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">None</option>
              {clients?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name (optional)</label>
            <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email (optional)</label>
            <input type="email" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone (optional)</label>
            <input type="tel" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={contactPhone} onChange={(e) => setContactPhone(formatPhone(e.target.value))} placeholder="(555) 123-4567" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year End Month</label>
              <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={fyeMonth} onChange={(e) => setFyeMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
              <input type="number" min={1} max={31} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={fyeDay} onChange={(e) => setFyeDay(Number(e.target.value))} />
            </div>
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={createClient.isPending} className="bg-brand-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-brand-700 disabled:opacity-50">
              Save Client
            </button>
          </div>
        </form>
      )}

      <input
        className="w-full md:w-80 border border-gray-300 rounded px-3 py-2 text-sm"
        placeholder="Search clients..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <SortTh field="name" label="Name" sort={sort} />
              <SortTh field="type" label="Type" sort={sort} className="whitespace-nowrap" />
              <SortTh field="code" label="Code" sort={sort} />
              <SortTh field="parent" label="Parent" sort={sort} className="whitespace-nowrap" />
              <SortTh field="email" label="Contact Email" sort={sort} />
              <SortTh field="fye" label="FYE" sort={sort} className="whitespace-nowrap" />
              <SortTh field="engagements" label="Returns" sort={sort} align="right" />
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8}><Loading /></td></tr>
            )}
            {sort.sorted.map((r) => {
              const c = r.client;
              return (
                <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-4">
                    <Link to={`/clients/${c.id}`} className="text-brand-600 hover:underline font-medium">{c.name}</Link>
                  </td>
                  <td className="py-2 px-4 text-gray-600 whitespace-nowrap">{c.clientType ?? "-"}</td>
                  <td className="py-2 px-4 text-gray-600">{c.clientCode ?? "-"}</td>
                  <td className="py-2 px-4 text-gray-600 whitespace-nowrap">{c.parent?.name ?? "-"}</td>
                  <td className="py-2 px-4 text-gray-600">{c.contactEmail ?? "-"}</td>
                  <td className="py-2 px-4 text-gray-600 whitespace-nowrap">{MONTHS[c.fiscalYearEndMonth - 1].slice(0, 3)} {c.fiscalYearEndDay}</td>
                  <td className="py-2 px-4 text-right text-gray-600">{c._count?.engagements ?? 0}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap">
                    <button className="text-brand-600 hover:underline mr-3" onClick={() => setEdit(c)}>
                      Edit
                    </button>
                    <button className="text-red-600 hover:underline" onClick={() => handleDelete(c)}>
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
            {clients && clients.length === 0 && (
              <tr><td colSpan={8}><EmptyState title="No clients yet" hint="Add a client or import from Excel to get started." /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={() => setEdit(null)}>
          <form
            className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl animate-[fadeIn_0.12s_ease-out] grid grid-cols-1 md:grid-cols-2 gap-4"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); updateClient.mutate(edit); }}
          >
            <div className="md:col-span-2 flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold text-gray-800">Edit Client</h3>
              <button type="button" className="text-gray-400 hover:text-gray-700" onClick={() => setEdit(null)}>✕</button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Type</label>
              <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.clientType ?? "Corporation"} onChange={(e) => setEdit({ ...edit, clientType: e.target.value as ClientType })}>
                {CLIENT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </div>

            {edit.clientType === "Individual" || edit.clientType === "Sch. E" ? (
              <>
                <div className="hidden md:block" />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.firstName ?? ""} onChange={(e) => setEdit({ ...edit, firstName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.lastName ?? ""} onChange={(e) => setEdit({ ...edit, lastName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Spouse Name</label>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.spouseName ?? ""} onChange={(e) => setEdit({ ...edit, spouseName: e.target.value })} />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Client Name</label>
                <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client Code</label>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.clientCode ?? ""} onChange={(e) => setEdit({ ...edit, clientCode: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Parent Client</label>
              <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.parentId ?? ""} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}>
                <option value="">None</option>
                {clients?.filter((c) => c.id !== edit.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.contactName ?? ""} onChange={(e) => setEdit({ ...edit, contactName: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <input type="email" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.contactEmail ?? ""} onChange={(e) => setEdit({ ...edit, contactEmail: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
              <input type="tel" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.contactPhone ?? ""} onChange={(e) => setEdit({ ...edit, contactPhone: formatPhone(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">FYE Month</label>
                <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.fiscalYearEndMonth} onChange={(e) => setEdit({ ...edit, fiscalYearEndMonth: Number(e.target.value) })}>
                  {MONTHS.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                <input type="number" min={1} max={31} className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={edit.fiscalYearEndDay} onChange={(e) => setEdit({ ...edit, fiscalYearEndDay: Number(e.target.value) })} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea className="w-full border border-gray-300 rounded px-3 py-2 text-sm" rows={2} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            </div>

            <div className="md:col-span-2 flex justify-end gap-2">
              <button type="button" className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50" onClick={() => setEdit(null)}>Cancel</button>
              <button type="submit" disabled={updateClient.isPending} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
                {updateClient.isPending ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
