import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  Client,
  DUE_DATE_TYPE_LABELS,
  ENGAGEMENT_STATUS_LABELS,
  Engagement,
  EngagementStatus,
  FORM_TYPE_LABELS,
  FormType,
  US_STATES,
  engagementLabel,
  User,
} from "../lib/types";
import { useDialog } from "../context/DialogContext";
import { useToast } from "../context/ToastContext";
import { Loading } from "../components/ui";

const FORM_TYPES: FormType[] = ["FORM_1040", "FORM_1065", "FORM_1120S", "FORM_1120", "FORM_990"];
const STATUSES: EngagementStatus[] = [
  "NOT_STARTED",
  "INFORMATION_RECEIVED",
  "IN_PREP",
  "IN_REVIEW",
  "READY_FOR_DELIVERY",
  "COMPLETED",
];

function yearOptions() {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current + 1; y >= current - 5; y--) years.push(y);
  return years;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function currency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function loggedStats(eng: Engagement) {
  const hours = eng.timeEntries?.reduce((s, t) => s + t.hours, 0) ?? 0;
  const value = eng.timeEntries?.reduce((s, t) => s + t.hours * (t.rate ?? t.user?.billableRate ?? 0), 0) ?? 0;
  return { hours, value };
}

// Finds the same return one tax year earlier (same form type and jurisdiction)
// and carries forward what was billed and the hours logged, for year-over-year
// comparison. Falls back to the manually-entered "Prior Amount Billed" /
// "Prior Year Hours" if there's no prior return on file.
function priorYear(eng: Engagement, all: Engagement[]): { billed: number | null; hours: number | null } {
  const prior = all.find(
    (e) =>
      e.taxYear === eng.taxYear - 1 &&
      e.formType === eng.formType &&
      (e.jurisdiction ?? "Federal") === (eng.jurisdiction ?? "Federal")
  );
  return {
    billed: prior?.billedAmount ?? eng.priorBilled ?? null,
    hours: prior ? loggedStats(prior).hours : eng.priorYearHours ?? null,
  };
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { prompt } = useDialog();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<FormType>("FORM_1040");
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [addFederal, setAddFederal] = useState(true);
  const [addState, setAddState] = useState(false);
  const [state, setState] = useState(US_STATES[0]);
  const [addCity, setAddCity] = useState(false);
  const [city, setCity] = useState("");

  const { data: client } = useQuery<Client>({
    queryKey: ["client", id],
    queryFn: async () => (await api.get(`/clients/${id}`)).data,
    enabled: !!id,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/auth/users")).data,
  });

  const createEngagement = useMutation({
    mutationFn: async (jurisdictions: string[]) => {
      // Create one return per selected jurisdiction (Federal / State / City).
      for (const jurisdiction of jurisdictions) {
        await api.post("/engagements", {
          clientId: id,
          formType,
          jurisdiction,
          taxYear,
          fiscalYearEndMonth: client?.fiscalYearEndMonth ?? 12,
          fiscalYearEndDay: client?.fiscalYearEndDay ?? 31,
        });
      }
      return jurisdictions.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["client", id] });
      setShowForm(false);
      setAddState(false);
      setAddCity(false);
      setCity("");
      toast(`${count} return${count === 1 ? "" : "s"} added with due dates.`);
    },
  });

  const updateEngagement = useMutation({
    mutationFn: async ({ engagementId, data }: { engagementId: string; data: Partial<Engagement> }) =>
      (await api.put(`/engagements/${engagementId}`, data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client", id] }),
  });

  const toggleDueDate = useMutation({
    mutationFn: async ({ dueDateId, completed }: { dueDateId: string; completed: boolean }) =>
      (await api.put(`/due-dates/${dueDateId}`, { completed })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client", id] }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const jurisdictions: string[] = [];
    if (addFederal) jurisdictions.push("Federal");
    if (addState) jurisdictions.push(state);
    if (addCity && city.trim()) jurisdictions.push(city.trim());
    if (jurisdictions.length === 0) {
      toast("Select at least one jurisdiction (Federal, State, or City).", "error");
      return;
    }
    createEngagement.mutate(jurisdictions);
  }

  if (!client) return <Loading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">{client.name}</h1>
        <p className="text-sm text-gray-500">
          {client.clientCode && <>Code: {client.clientCode} &middot; </>}
          {client.contactName && <>{client.contactName} &middot; </>}
          {client.contactEmail && <>{client.contactEmail} &middot; </>}
          {client.contactPhone && <>{client.contactPhone} &middot; </>}
          FYE: {client.fiscalYearEndMonth}/{client.fiscalYearEndDay}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Engagements</h2>
        <button
          className="bg-brand-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-brand-700"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancel" : "Add Return"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Form Type</label>
            <select className="border border-gray-300 rounded px-3 py-2 text-sm" value={formType} onChange={(e) => setFormType(e.target.value as FormType)}>
              {FORM_TYPES.map((ft) => (
                <option key={ft} value={ft}>{FORM_TYPE_LABELS[ft]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax Year</label>
            <select className="border border-gray-300 rounded px-3 py-2 text-sm" value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
              {yearOptions().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">Jurisdictions to create</label>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={addFederal} onChange={(e) => setAddFederal(e.target.checked)} />
                Federal
              </label>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={addState} onChange={(e) => setAddState(e.target.checked)} />
                  State
                </label>
                <select
                  className="border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={!addState}
                >
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={addCity} onChange={(e) => setAddCity(e.target.checked)} />
                  City
                </label>
                <input
                  className="border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-50"
                  placeholder="City name"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={!addCity}
                />
              </div>
            </div>
          </div>

          <button type="submit" disabled={createEngagement.isPending} className="bg-brand-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-brand-700 disabled:opacity-50">
            {createEngagement.isPending ? "Creating…" : "Create & Generate Due Dates"}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {client.engagements && client.engagements.length > 0 ? (
          client.engagements.map((eng) => (
            <div key={eng.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-semibold text-gray-800">
                  {FORM_TYPE_LABELS[eng.formType]} &mdash; Tax Year {eng.taxYear}
                  <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded ${eng.jurisdiction && eng.jurisdiction !== "Federal" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>
                    {eng.jurisdiction && eng.jurisdiction !== "Federal" ? eng.jurisdiction : "Federal"}
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                    value={eng.status}
                    onChange={(e) => updateEngagement.mutate({ engagementId: eng.id, data: { status: e.target.value as EngagementStatus } })}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{ENGAGEMENT_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <select
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                    value={eng.assignedToId ?? ""}
                    onChange={(e) => updateEngagement.mutate({ engagementId: eng.id, data: { assignedToId: e.target.value || null } })}
                  >
                    <option value="">Unassigned</option>
                    {users?.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={eng.extensionFiled}
                      onChange={(e) => updateEngagement.mutate({ engagementId: eng.id, data: { extensionFiled: e.target.checked } })}
                    />
                    Extension filed
                  </label>
                </div>
              </div>

              {(() => {
                const { hours, value } = loggedStats(eng);
                const realization = eng.billedAmount && value > 0 ? eng.billedAmount / value : null;
                const realizationColor =
                  realization == null ? "text-gray-500" : realization >= 1 ? "text-green-700" : realization >= 0.85 ? "text-amber-600" : "text-red-600";
                const py = priorYear(eng, client.engagements ?? []);
                const billingChange =
                  py.billed != null && py.billed > 0 && eng.billedAmount != null
                    ? (eng.billedAmount - py.billed) / py.billed
                    : null;
                const hoursChange =
                  py.hours != null && py.hours > 0 ? (hours - py.hours) / py.hours : null;
                return (
                  <div className="bg-gray-50 rounded p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Projected Fee (EL)</label>
                      <input
                        type="number" step="0.01" min="0"
                        className="w-full border border-gray-300 rounded px-2 py-1"
                        defaultValue={eng.projectedFee ?? ""}
                        placeholder="0.00"
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== (eng.projectedFee ?? null)) updateEngagement.mutate({ engagementId: eng.id, data: { projectedFee: v } });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Prior Year Fee</label>
                      <input
                        type="number" step="0.01" min="0"
                        className="w-full border border-gray-300 rounded px-2 py-1"
                        defaultValue={eng.priorYearFee ?? ""}
                        placeholder="0.00"
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== (eng.priorYearFee ?? null)) updateEngagement.mutate({ engagementId: eng.id, data: { priorYearFee: v } });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Prior Year Hours</label>
                      <input
                        type="number" step="0.1" min="0"
                        className="w-full border border-gray-300 rounded px-2 py-1"
                        defaultValue={eng.priorYearHours ?? ""}
                        placeholder="0.0"
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== (eng.priorYearHours ?? null)) updateEngagement.mutate({ engagementId: eng.id, data: { priorYearHours: v } });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Prior Amount Billed</label>
                      <input
                        type="number" step="0.01" min="0"
                        className="w-full border border-gray-300 rounded px-2 py-1"
                        defaultValue={eng.priorBilled ?? ""}
                        placeholder="0.00"
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== (eng.priorBilled ?? null)) updateEngagement.mutate({ engagementId: eng.id, data: { priorBilled: v } });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Billed Amount</label>
                      <input
                        type="number" step="0.01" min="0"
                        className="w-full border border-gray-300 rounded px-2 py-1"
                        defaultValue={eng.billedAmount ?? ""}
                        placeholder="0.00"
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== (eng.billedAmount ?? null)) updateEngagement.mutate({ engagementId: eng.id, data: { billedAmount: v } });
                        }}
                      />
                    </div>

                    <div className="col-span-2 md:col-span-4 flex flex-wrap items-center gap-x-6 gap-y-1 pt-1 border-t border-gray-200 mt-1">
                      <label className="flex items-center gap-2 text-gray-700">
                        <input
                          type="checkbox"
                          checked={eng.billed ?? false}
                          onChange={async (e) => {
                            if (e.target.checked) {
                              const input = await prompt({
                                title: "Mark as billed",
                                message: "Amount actually billed for this return (may differ from WIP):",
                                defaultValue: String(eng.billedAmount ?? value.toFixed(2)),
                                confirmLabel: "Save",
                                numeric: true,
                              });
                              if (input === null) return; // cancelled — leave unbilled
                              const amt = Number(input);
                              if (Number.isNaN(amt)) return;
                              updateEngagement.mutate({ engagementId: eng.id, data: { billed: true, billedAmount: amt } });
                              toast("Marked billed.");
                            } else {
                              updateEngagement.mutate({ engagementId: eng.id, data: { billed: false } });
                            }
                          }}
                        />
                        Billed
                      </label>
                      {eng.billedDate && <span className="text-gray-500">on {formatDate(eng.billedDate)}</span>}
                      <span className="text-gray-500">Logged: {hours.toFixed(1)} hrs &middot; {currency(value)} std value</span>
                      {eng.projectedFee != null && (
                        <span className="text-gray-500">Projected: {currency(eng.projectedFee)}</span>
                      )}
                      {py.billed != null && (
                        <span className="text-gray-500">
                          Prior yr billed: {currency(py.billed)}
                          {billingChange != null && (
                            <span className={billingChange >= 0 ? "text-green-700 ml-1" : "text-red-600 ml-1"}>
                              ({billingChange >= 0 ? "▲" : "▼"} {Math.abs(billingChange * 100).toFixed(0)}%)
                            </span>
                          )}
                        </span>
                      )}
                      {py.hours != null && (
                        <span className="text-gray-500">
                          Prior yr hours: {py.hours.toFixed(1)}
                          {hoursChange != null && (
                            <span className={hoursChange <= 0 ? "text-green-700 ml-1" : "text-red-600 ml-1"}>
                              ({hoursChange >= 0 ? "▲" : "▼"} {Math.abs(hoursChange * 100).toFixed(0)}%)
                            </span>
                          )}
                        </span>
                      )}
                      <span className={realizationColor}>
                        Realization: {realization != null ? `${(realization * 100).toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-1 pr-4">Due Date</th>
                    <th className="py-1 pr-4">Type</th>
                    <th className="py-1 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {eng.dueDates
                    .filter((dd) => eng.extensionFiled || dd.type !== "EXTENDED_FILING")
                    .filter((dd) => !eng.extensionFiled || dd.type !== "ORIGINAL_FILING")
                    .map((dd) => (
                      <tr key={dd.id} className="border-b last:border-0">
                        <td className="py-1 pr-4 whitespace-nowrap">{formatDate(dd.dueDate)}</td>
                        <td className="py-1 pr-4">{DUE_DATE_TYPE_LABELS[dd.type]}</td>
                        <td className="py-1 pr-4">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={dd.completed}
                              onChange={(e) => toggleDueDate.mutate({ dueDateId: dd.id, completed: e.target.checked })}
                            />
                            {dd.completed ? "Done" : "Pending"}
                          </label>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500">No returns set up for this client yet.</p>
        )}
      </div>
    </div>
  );
}
