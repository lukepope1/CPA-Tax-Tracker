import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { useDialog } from "../context/DialogContext";
import { Loading, EmptyState, useSort, SortTh } from "../components/ui";
import { FormType, engagementLabel } from "../lib/types";

interface WipRow {
  clientId: string;
  clientName: string;
  clientType: string | null;
  wipHours: number;
  wipValue: number;
  billedTotal: number;
  openEngagements: number;
}

interface WipByEngagement {
  engagementId: string | null;
  general: boolean;
  formType: FormType;
  taxYear: number;
  jurisdiction: string | null;
  description: string | null;
  hours: number;
  value: number;
  entries: { date: string; staff: string; hours: number; value: number; description: string }[];
}

interface WipResponse {
  rows: WipRow[];
  totals: { wipHours: number; wipValue: number; billedTotal: number };
}

interface BillRow {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  billedDate: string;
  note: string;
  returns: number;
  hours: number;
  stdValue: number;
  realization: number | null;
}

function realizationColor(r: number | null) {
  if (r == null) return "text-gray-400";
  if (r >= 1) return "text-green-700";
  if (r >= 0.85) return "text-amber-600";
  return "text-red-600";
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function currency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function Billing() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { prompt, confirm } = useDialog();
  const [view, setView] = useState<"outstanding" | "billed">("outstanding");
  const [detail, setDetail] = useState<WipRow | null>(null);
  const { data, isLoading } = useQuery<WipResponse>({
    queryKey: ["billing-wip"],
    queryFn: async () => (await api.get("/billing/wip")).data,
  });

  const { data: history, isLoading: historyLoading } = useQuery<BillRow[]>({
    queryKey: ["billing-history"],
    queryFn: async () => (await api.get("/billing/history")).data,
    enabled: view === "billed",
  });

  const editBill = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) =>
      (await api.put(`/billing/bill/${id}`, { amount })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-wip"] });
      queryClient.invalidateQueries({ queryKey: ["firm-summary"] });
      toast("Bill updated.");
    },
  });

  const reverseBill = useMutation({
    mutationFn: async (id: string) => api.delete(`/billing/bill/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-wip"] });
      queryClient.invalidateQueries({ queryKey: ["firm-summary"] });
      toast("Bill reversed — returns sent back to WIP.");
    },
  });

  async function handleEditBill(b: BillRow) {
    const input = await prompt({
      title: `Edit bill — ${b.clientName}`,
      message: `Billed ${formatDate(b.billedDate)} across ${b.returns} return(s). Enter the corrected amount:`,
      defaultValue: b.amount.toFixed(2),
      confirmLabel: "Save",
      numeric: true,
    });
    if (input === null) return;
    const amount = Number(input);
    if (Number.isNaN(amount) || amount < 0) return toast("Enter a valid amount.", "error");
    editBill.mutate({ id: b.id, amount });
  }

  async function handleReverseBill(b: BillRow) {
    const ok = await confirm({
      title: `Reverse this bill?`,
      message: `${b.clientName} — ${currency(b.amount)} on ${formatDate(b.billedDate)}. Its ${b.returns} return(s) go back to outstanding WIP. This deletes the bill record.`,
      confirmLabel: "Reverse bill",
      tone: "danger",
    });
    if (ok) reverseBill.mutate(b.id);
  }

  const { data: byEng, isLoading: byEngLoading } = useQuery<WipByEngagement[]>({
    queryKey: ["billing-wip-by-engagement", detail?.clientId],
    queryFn: async () => (await api.get(`/billing/wip/${detail!.clientId}/by-engagement`)).data,
    enabled: !!detail,
  });

  const bill = useMutation({
    mutationFn: async ({ clientId, amount }: { clientId: string; amount: number; clientName: string }) =>
      (await api.post("/billing/bill", { clientId, amount })).data,
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ["billing-wip"] });
      queryClient.invalidateQueries({ queryKey: ["billing-history"] });
      queryClient.invalidateQueries({ queryKey: ["firm-summary"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      toast(`Billed ${vars.clientName} ${currency(vars.amount)}.`);
    },
    onError: (err: any) => toast(err.response?.data?.error || "Could not bill this client.", "error"),
  });

  const billGroup = useMutation({
    mutationFn: async (v: { clientId: string; engagementId: string | null; amount: number }) =>
      (await api.post("/billing/bill-engagement", v)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-wip"] });
      queryClient.invalidateQueries({ queryKey: ["billing-wip-by-engagement"] });
      queryClient.invalidateQueries({ queryKey: ["billing-history"] });
      queryClient.invalidateQueries({ queryKey: ["firm-summary"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      toast("Billed.");
    },
    onError: (err: any) => toast(err.response?.data?.error || "Could not bill.", "error"),
  });

  async function handleBillGroup(g: WipByEngagement) {
    if (!detail) return;
    const label = g.general ? "General / none" : engagementLabel(g);
    const input = await prompt({
      title: `Bill ${label}`,
      message: `${detail.clientName} — WIP is ${currency(g.value)} (${g.hours.toFixed(1)} hrs). Enter the amount actually billed:`,
      defaultValue: g.value.toFixed(2),
      confirmLabel: "Bill",
      numeric: true,
    });
    if (input === null) return;
    const amount = Number(input);
    if (Number.isNaN(amount) || amount < 0) return toast("Enter a valid amount.", "error");
    billGroup.mutate({ clientId: detail.clientId, engagementId: g.engagementId, amount });
  }

  async function handleBill(r: WipRow) {
    const input = await prompt({
      title: `Bill ${r.clientName}`,
      message: `Outstanding WIP is ${currency(r.wipValue)} across ${r.openEngagements} return(s). Enter the amount actually billed:`,
      defaultValue: r.wipValue.toFixed(2),
      confirmLabel: "Bill",
      numeric: true,
    });
    if (input === null) return;
    const amount = Number(input);
    if (Number.isNaN(amount) || amount < 0) {
      toast("Please enter a valid amount.", "error");
      return;
    }
    bill.mutate({ clientId: r.clientId, amount, clientName: r.clientName });
  }

  const sort = useSort<WipRow>(data?.rows ?? [], "wipValue", "desc");

  function exportExcel() {
    if (!data) return;
    const rows = data.rows.map((r) => ({
      Client: r.clientName,
      Type: r.clientType ?? "",
      "Open Returns": r.openEngagements,
      "Unbilled Hours": Number(r.wipHours.toFixed(1)),
      "Outstanding WIP": Number(r.wipValue.toFixed(2)),
      "Billed to Date": Number(r.billedTotal.toFixed(2)),
    }));
    rows.push({
      Client: "TOTAL",
      Type: "",
      "Open Returns": data.rows.reduce((s, r) => s + r.openEngagements, 0),
      "Unbilled Hours": Number(data.totals.wipHours.toFixed(1)),
      "Outstanding WIP": Number(data.totals.wipValue.toFixed(2)),
      "Billed to Date": Number(data.totals.billedTotal.toFixed(2)),
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WIP");
    XLSX.writeFile(wb, `billing-wip-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("Exported billing-wip.xlsx");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Billing</h1>
          <p className="text-sm text-gray-500">
            {view === "outstanding"
              ? "Outstanding WIP (work in progress) — the standard value of logged time not yet billed, by client."
              : "Billing history — every recorded bill. Edit an amount or reverse a bill back to WIP."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
            <button
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${view === "outstanding" ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              onClick={() => setView("outstanding")}
            >
              Outstanding
            </button>
            <button
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${view === "billed" ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
              onClick={() => setView("billed")}
            >
              Billed
            </button>
          </div>
          {view === "outstanding" && (
            <button
              className="bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
              onClick={exportExcel}
              disabled={!data || data.rows.length === 0}
            >
              Export to Excel
            </button>
          )}
        </div>
      </div>

      {view === "outstanding" && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs font-medium text-gray-500 uppercase">Total Outstanding WIP</div>
            <div className="text-2xl font-bold text-brand-600">{currency(data.totals.wipValue)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs font-medium text-gray-500 uppercase">Unbilled Hours</div>
            <div className="text-2xl font-bold text-gray-800">{data.totals.wipHours.toFixed(1)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-xs font-medium text-gray-500 uppercase">Billed to Date</div>
            <div className="text-2xl font-bold text-gray-800">{currency(data.totals.billedTotal)}</div>
          </div>
        </div>
      )}

      {view === "billed" && history && (() => {
        const totalBilled = history.reduce((s, b) => s + b.amount, 0);
        const totalHours = history.reduce((s, b) => s + b.hours, 0);
        const totalStd = history.reduce((s, b) => s + b.stdValue, 0);
        const totalRealization = totalStd > 0 ? totalBilled / totalStd : null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs font-medium text-gray-500 uppercase">Total Billed</div>
              <div className="text-2xl font-bold text-brand-600">{currency(totalBilled)}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs font-medium text-gray-500 uppercase">Total Hours Billed</div>
              <div className="text-2xl font-bold text-gray-800">{totalHours.toFixed(1)}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-xs font-medium text-gray-500 uppercase">Total Realization</div>
              <div className={`text-2xl font-bold ${realizationColor(totalRealization)}`}>
                {totalRealization != null ? `${(totalRealization * 100).toFixed(0)}%` : "—"}
              </div>
            </div>
          </div>
        );
      })()}

      {view === "outstanding" && (
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b bg-gray-50">
              <SortTh<WipRow> field="clientName" label="Client" sort={sort} />
              <SortTh<WipRow> field="clientType" label="Type" sort={sort} />
              <SortTh<WipRow> field="openEngagements" label="Open Returns" sort={sort} align="right" />
              <SortTh<WipRow> field="wipHours" label="Unbilled Hours" sort={sort} align="right" />
              <SortTh<WipRow> field="wipValue" label="Outstanding WIP" sort={sort} align="right" />
              <SortTh<WipRow> field="billedTotal" label="Billed to Date" sort={sort} align="right" />
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7}><Loading /></td></tr>
            )}
            {sort.sorted.map((r) => (
              <tr key={r.clientId} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 px-4">
                  <Link to={`/clients/${r.clientId}`} className="text-brand-600 hover:underline font-medium">
                    {r.clientName}
                  </Link>
                </td>
                <td className="py-2 px-4 text-gray-600">{r.clientType ?? "-"}</td>
                <td className="py-2 px-4 text-right text-gray-600">{r.openEngagements}</td>
                <td className="py-2 px-4 text-right">
                  {r.wipHours > 0 ? (
                    <button className="text-brand-600 hover:underline" onClick={() => setDetail(r)} title="Breakdown by employee">
                      {r.wipHours.toFixed(1)}
                    </button>
                  ) : (
                    <span className="text-gray-600">0.0</span>
                  )}
                </td>
                <td className="py-2 px-4 text-right font-medium">
                  {r.wipValue > 0 ? (
                    <button className="text-brand-600 hover:underline" onClick={() => setDetail(r)} title="Breakdown by employee">
                      {currency(r.wipValue)}
                    </button>
                  ) : (
                    <span className="text-gray-800">{currency(r.wipValue)}</span>
                  )}
                </td>
                <td className="py-2 px-4 text-right text-gray-600">{currency(r.billedTotal)}</td>
                <td className="py-2 px-4 text-right">
                  <button
                    className="bg-brand-600 text-white text-xs font-medium rounded px-3 py-1 hover:bg-brand-700 disabled:opacity-50"
                    onClick={() => handleBill(r)}
                    disabled={bill.isPending || r.wipValue <= 0}
                  >
                    Bill
                  </button>
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={7}><EmptyState title="No outstanding WIP" hint="All logged time has been billed." /></td></tr>
            )}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-gray-50 font-semibold text-gray-800">
                <td className="py-2 px-4" colSpan={3}>Total</td>
                <td className="py-2 px-4 text-right">{data.totals.wipHours.toFixed(1)}</td>
                <td className="py-2 px-4 text-right">{currency(data.totals.wipValue)}</td>
                <td className="py-2 px-4 text-right">{currency(data.totals.billedTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      )}

      {view === "billed" && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-4">Date</th>
                <th className="py-2 px-4">Client</th>
                <th className="py-2 px-4 text-right">Amount</th>
                <th className="py-2 px-4 text-right">Hours</th>
                <th className="py-2 px-4 text-right">Realization</th>
                <th className="py-2 px-4 text-right">Returns</th>
                <th className="py-2 px-4">Note</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && (
                <tr><td colSpan={8}><Loading /></td></tr>
              )}
              {history?.map((b) => (
                <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-4 whitespace-nowrap">{formatDate(b.billedDate)}</td>
                  <td className="py-2 px-4">
                    <Link to={`/clients/${b.clientId}`} className="text-brand-600 hover:underline font-medium">{b.clientName}</Link>
                  </td>
                  <td className="py-2 px-4 text-right font-medium text-gray-800">{currency(b.amount)}</td>
                  <td className="py-2 px-4 text-right text-gray-600">{b.hours.toFixed(1)}</td>
                  <td className={`py-2 px-4 text-right font-medium ${realizationColor(b.realization)}`}>
                    {b.realization != null ? `${(b.realization * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-2 px-4 text-right text-gray-600">{b.returns}</td>
                  <td className="py-2 px-4 text-gray-600">{b.note || "-"}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap">
                    <button className="text-brand-600 hover:underline mr-3" onClick={() => handleEditBill(b)}>Edit</button>
                    <button className="text-red-600 hover:underline" onClick={() => handleReverseBill(b)}>Reverse</button>
                  </td>
                </tr>
              ))}
              {history && history.length === 0 && (
                <tr><td colSpan={8}><EmptyState title="No bills yet" hint="Bills you create from the Outstanding view appear here." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onMouseDown={() => setDetail(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl animate-[fadeIn_0.12s_ease-out]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-heading text-lg font-semibold text-gray-800">{detail.clientName}</h3>
                <p className="text-xs text-gray-500">Outstanding WIP by return — each group is likely a separate bill</p>
              </div>
              <button className="text-gray-400 hover:text-gray-700" onClick={() => setDetail(null)}>✕</button>
            </div>

            <div className="mt-4 space-y-3">
              {byEngLoading ? (
                <Loading />
              ) : byEng && byEng.length > 0 ? (
                <>
                  {byEng.map((g) => (
                    <div key={g.engagementId ?? "general"} className="rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-t-lg">
                        <span className="font-medium text-gray-800">
                          {g.general ? "General / none" : engagementLabel(g)}
                        </span>
                        <span className="flex items-center gap-3 shrink-0">
                          <span className="text-sm text-gray-600">{g.hours.toFixed(1)} hrs · {currency(g.value)}</span>
                          <button
                            className="bg-brand-600 text-white text-xs font-medium rounded px-3 py-1 hover:bg-brand-700 disabled:opacity-50"
                            onClick={() => handleBillGroup(g)}
                            disabled={billGroup.isPending}
                          >
                            Bill this
                          </button>
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-gray-400 border-b">
                            <th className="py-1 px-3">Date</th>
                            <th className="py-1 px-3">Staff</th>
                            <th className="py-1 px-3 text-right">Hrs</th>
                            <th className="py-1 px-3 text-right">Value</th>
                            <th className="py-1 px-3">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.entries.map((t, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1 px-3 whitespace-nowrap">{formatDate(t.date)}</td>
                              <td className="py-1 px-3 whitespace-nowrap">{t.staff}</td>
                              <td className="py-1 px-3 text-right">{t.hours.toFixed(1)}</td>
                              <td className="py-1 px-3 text-right">{currency(t.value)}</td>
                              <td className="py-1 px-3">{t.description || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  <div className="flex justify-between px-1 pt-1 text-sm font-semibold text-gray-800">
                    <span>Total</span>
                    <span>{detail.wipHours.toFixed(1)} hrs · {currency(detail.wipValue)}</span>
                  </div>
                </>
              ) : (
                <EmptyState title="No unbilled time" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
