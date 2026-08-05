import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Loading, EmptyState } from "../components/ui";
import { ENGAGEMENT_STATUS_LABELS, EngagementStatus, FORM_TYPE_LABELS, FormType } from "../lib/types";

type ReportKey = "staff" | "clients" | "aging" | "turnaround" | "status" | "capacity" | "profit";

interface StaffRow { name: string; hours: number; billableHours: number; value: number }
interface ClientRow { name: string; hours: number; value: number }
interface AgingRow { name: string; d0_30: number; d31_60: number; d61_90: number; d90plus: number; total: number }
interface TurnRow {
  client: string; formType: FormType; jurisdiction: string | null; taxYear: number;
  assignedTo: string; received: string; completed: string; days: number;
}
interface StatusRow {
  status: EngagementStatus; stints: number; totalDays: number;
  openNow: number; longestDays: number; avgDays: number;
}
interface CapacityRow {
  id: string; name: string;
  overdue: number; thisWeek: number; nextWeek: number; weeks2to4: number; later: number; noDate: number;
  returns: number; estHours: number; loggedHours: number; remainingHours: number;
}
interface ProfitRow {
  name: string; hours: number; stdValue: number; billed: number;
  writeOff: number; realization: number | null; effectiveRate: number | null;
}

const currency = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function yearStartISO() {
  return `${new Date().getFullYear()}-01-01`;
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const TABS: { key: ReportKey; label: string }[] = [
  { key: "staff", label: "Staff Hours" },
  { key: "clients", label: "Client Hours" },
  { key: "aging", label: "WIP Aging" },
  { key: "turnaround", label: "Turnaround" },
  { key: "status", label: "Time in Status" },
  { key: "capacity", label: "Capacity" },
  { key: "profit", label: "Client Profitability" },
];

export default function Reports() {
  const { toast } = useToast();
  const [tab, setTab] = useState<ReportKey>("staff");
  const [from, setFrom] = useState(yearStartISO());
  const [to, setTo] = useState(todayISO());

  const dateParams = { from, to };

  const staff = useQuery<StaffRow[]>({
    queryKey: ["report-staff", from, to],
    queryFn: async () => (await api.get("/reports/staff-hours", { params: dateParams })).data,
    enabled: tab === "staff",
  });

  const clients = useQuery<ClientRow[]>({
    queryKey: ["report-clients", from, to],
    queryFn: async () => (await api.get("/reports/client-hours", { params: dateParams })).data,
    enabled: tab === "clients",
  });

  const aging = useQuery<AgingRow[]>({
    queryKey: ["report-aging"],
    queryFn: async () => (await api.get("/reports/wip-aging")).data,
    enabled: tab === "aging",
  });

  const turnaround = useQuery<{ rows: TurnRow[]; avgDays: number | null }>({
    queryKey: ["report-turnaround"],
    queryFn: async () => (await api.get("/reports/turnaround")).data,
    enabled: tab === "turnaround",
  });

  const status = useQuery<StatusRow[]>({
    queryKey: ["report-time-in-status"],
    queryFn: async () => (await api.get("/reports/time-in-status")).data,
    enabled: tab === "status",
  });

  const capacity = useQuery<CapacityRow[]>({
    queryKey: ["report-capacity"],
    queryFn: async () => (await api.get("/reports/capacity")).data,
    enabled: tab === "capacity",
  });

  const profit = useQuery<ProfitRow[]>({
    queryKey: ["report-profit", from, to],
    queryFn: async () => (await api.get("/reports/client-profitability", { params: dateParams })).data,
    enabled: tab === "profit",
  });

  function exportCurrent() {
    let rows: Record<string, unknown>[] = [];
    let sheet = "Report";
    if (tab === "staff" && staff.data) {
      sheet = "Staff Hours";
      rows = staff.data.map((r) => ({
        Staff: r.name,
        Hours: Number(r.hours.toFixed(1)),
        "Billable Hours": Number(r.billableHours.toFixed(1)),
        "Billable %": r.hours > 0 ? Number(((r.billableHours / r.hours) * 100).toFixed(0)) : 0,
        Value: Number(r.value.toFixed(2)),
      }));
    } else if (tab === "clients" && clients.data) {
      sheet = "Client Hours";
      rows = clients.data.map((r) => ({ Client: r.name, Hours: Number(r.hours.toFixed(1)), Value: Number(r.value.toFixed(2)) }));
    } else if (tab === "aging" && aging.data) {
      sheet = "WIP Aging";
      rows = aging.data.map((r) => ({
        Client: r.name,
        "0-30 days": Number(r.d0_30.toFixed(2)),
        "31-60 days": Number(r.d31_60.toFixed(2)),
        "61-90 days": Number(r.d61_90.toFixed(2)),
        "90+ days": Number(r.d90plus.toFixed(2)),
        Total: Number(r.total.toFixed(2)),
      }));
      if (rows.length > 0) {
        const t = aging.data.reduce(
          (a, r) => ({
            d0_30: a.d0_30 + r.d0_30,
            d31_60: a.d31_60 + r.d31_60,
            d61_90: a.d61_90 + r.d61_90,
            d90plus: a.d90plus + r.d90plus,
            total: a.total + r.total,
          }),
          { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 }
        );
        rows.push({
          Client: "TOTAL",
          "0-30 days": Number(t.d0_30.toFixed(2)),
          "31-60 days": Number(t.d31_60.toFixed(2)),
          "61-90 days": Number(t.d61_90.toFixed(2)),
          "90+ days": Number(t.d90plus.toFixed(2)),
          Total: Number(t.total.toFixed(2)),
        });
      }
    } else if (tab === "turnaround" && turnaround.data) {
      sheet = "Turnaround";
      rows = turnaround.data.rows.map((r) => ({
        Client: r.client,
        Return: FORM_TYPE_LABELS[r.formType],
        Jurisdiction: r.jurisdiction ?? "Federal",
        "Tax Year": r.taxYear,
        "Assigned To": r.assignedTo,
        Received: fmtDate(r.received),
        Completed: fmtDate(r.completed),
        Days: r.days,
      }));
    } else if (tab === "status" && status.data) {
      sheet = "Time in Status";
      rows = status.data.map((r) => ({
        Status: ENGAGEMENT_STATUS_LABELS[r.status],
        "Avg Days": Number(r.avgDays.toFixed(1)),
        "Longest Days": Number(r.longestDays.toFixed(1)),
        "Times Entered": r.stints,
        "Sitting There Now": r.openNow,
      }));
    } else if (tab === "capacity" && capacity.data) {
      sheet = "Capacity";
      rows = capacity.data.map((r) => ({
        Staff: r.name,
        Overdue: r.overdue,
        "Due This Week": r.thisWeek,
        "Next Week": r.nextWeek,
        "2-4 Weeks": r.weeks2to4,
        Later: r.later,
        "No Due Date": r.noDate,
        "Open Returns": r.returns,
        "Est. Hours": Number(r.estHours.toFixed(1)),
        "Logged": Number(r.loggedHours.toFixed(1)),
        "Est. Remaining": Number(r.remainingHours.toFixed(1)),
      }));
    } else if (tab === "profit" && profit.data) {
      sheet = "Client Profitability";
      rows = profit.data.map((r) => ({
        Client: r.name,
        Hours: Number(r.hours.toFixed(1)),
        "Standard Value": Number(r.stdValue.toFixed(2)),
        Billed: Number(r.billed.toFixed(2)),
        "Write-Off": Number(r.writeOff.toFixed(2)),
        "Realization %": r.realization != null ? Number((r.realization * 100).toFixed(0)) : "",
        "Effective Rate": r.effectiveRate != null ? Number(r.effectiveRate.toFixed(2)) : "",
      }));
    }
    if (rows.length === 0) return toast("Nothing to export.", "error");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
    XLSX.writeFile(wb, `report-${tab}-${todayISO()}.xlsx`);
    toast("Report exported.");
  }

  const usesDates = tab === "staff" || tab === "clients" || tab === "profit";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-800">Reports</h1>
        <button
          className="bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded px-4 py-2 hover:bg-gray-50"
          onClick={exportCurrent}
        >
          Export to Excel
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {usesDates && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            From
            <input type="date" className="border border-gray-300 rounded px-2 py-1.5" value={from} onChange={(e) => setFrom(e.target.value)} />
            to
            <input type="date" className="border border-gray-300 rounded px-2 py-1.5" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
        {tab === "staff" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-4">Staff</th>
                <th className="py-2 px-4 text-right">Hours</th>
                <th className="py-2 px-4 text-right">Billable Hours</th>
                <th className="py-2 px-4 text-right">Billable %</th>
                <th className="py-2 px-4 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {staff.isLoading && <tr><td colSpan={5}><Loading /></td></tr>}
              {staff.data?.map((r) => (
                <tr key={r.name} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2 px-4 text-right">{r.hours.toFixed(1)}</td>
                  <td className="py-2 px-4 text-right">{r.billableHours.toFixed(1)}</td>
                  <td className="py-2 px-4 text-right">{r.hours > 0 ? `${((r.billableHours / r.hours) * 100).toFixed(0)}%` : "—"}</td>
                  <td className="py-2 px-4 text-right font-medium">{currency(r.value)}</td>
                </tr>
              ))}
              {staff.data?.length === 0 && <tr><td colSpan={5}><EmptyState title="No time in this range" /></td></tr>}
            </tbody>
          </table>
        )}

        {tab === "clients" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-4">Client</th>
                <th className="py-2 px-4 text-right">Hours</th>
                <th className="py-2 px-4 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {clients.isLoading && <tr><td colSpan={3}><Loading /></td></tr>}
              {clients.data?.map((r) => (
                <tr key={r.name} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2 px-4 text-right">{r.hours.toFixed(1)}</td>
                  <td className="py-2 px-4 text-right font-medium">{currency(r.value)}</td>
                </tr>
              ))}
              {clients.data?.length === 0 && <tr><td colSpan={3}><EmptyState title="No time in this range" /></td></tr>}
            </tbody>
          </table>
        )}

        {tab === "aging" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-4">Client</th>
                <th className="py-2 px-4 text-right">0–30 days</th>
                <th className="py-2 px-4 text-right">31–60</th>
                <th className="py-2 px-4 text-right">61–90</th>
                <th className="py-2 px-4 text-right text-red-600">90+</th>
                <th className="py-2 px-4 text-right">Total WIP</th>
              </tr>
            </thead>
            <tbody>
              {aging.isLoading && <tr><td colSpan={6}><Loading /></td></tr>}
              {aging.data?.map((r) => (
                <tr key={r.name} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium text-gray-800">{r.name}</td>
                  <td className="py-2 px-4 text-right">{currency(r.d0_30)}</td>
                  <td className="py-2 px-4 text-right">{currency(r.d31_60)}</td>
                  <td className="py-2 px-4 text-right">{currency(r.d61_90)}</td>
                  <td className={`py-2 px-4 text-right ${r.d90plus > 0 ? "text-red-600 font-medium" : ""}`}>{currency(r.d90plus)}</td>
                  <td className="py-2 px-4 text-right font-semibold">{currency(r.total)}</td>
                </tr>
              ))}
              {aging.data?.length === 0 && <tr><td colSpan={6}><EmptyState title="No outstanding WIP" /></td></tr>}
            </tbody>
            {aging.data && aging.data.length > 0 && (() => {
              const t = aging.data.reduce(
                (a, r) => ({
                  d0_30: a.d0_30 + r.d0_30,
                  d31_60: a.d31_60 + r.d31_60,
                  d61_90: a.d61_90 + r.d61_90,
                  d90plus: a.d90plus + r.d90plus,
                  total: a.total + r.total,
                }),
                { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 }
              );
              return (
                <tfoot>
                  <tr className="border-t bg-gray-50 font-semibold text-gray-800">
                    <td className="py-2 px-4">Total</td>
                    <td className="py-2 px-4 text-right">{currency(t.d0_30)}</td>
                    <td className="py-2 px-4 text-right">{currency(t.d31_60)}</td>
                    <td className="py-2 px-4 text-right">{currency(t.d61_90)}</td>
                    <td className={`py-2 px-4 text-right ${t.d90plus > 0 ? "text-red-600" : ""}`}>{currency(t.d90plus)}</td>
                    <td className="py-2 px-4 text-right">{currency(t.total)}</td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        )}

        {tab === "turnaround" && (
          <div>
            {turnaround.data?.avgDays != null && (
              <div className="px-4 py-2 border-b bg-gray-50 text-sm text-gray-600">
                Average turnaround: <span className="font-semibold text-gray-800">{turnaround.data.avgDays.toFixed(0)} days</span>
                {" "}(Information Received → Completed, completed returns only)
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2 px-4">Client</th>
                  <th className="py-2 px-4">Return</th>
                  <th className="py-2 px-4">Assigned To</th>
                  <th className="py-2 px-4">Received</th>
                  <th className="py-2 px-4">Completed</th>
                  <th className="py-2 px-4 text-right">Days</th>
                </tr>
              </thead>
              <tbody>
                {turnaround.isLoading && <tr><td colSpan={6}><Loading /></td></tr>}
                {turnaround.data?.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium text-gray-800">{r.client}</td>
                    <td className="py-2 px-4">{FORM_TYPE_LABELS[r.formType]} ({r.taxYear})</td>
                    <td className="py-2 px-4">{r.assignedTo || "—"}</td>
                    <td className="py-2 px-4 whitespace-nowrap">{fmtDate(r.received)}</td>
                    <td className="py-2 px-4 whitespace-nowrap">{fmtDate(r.completed)}</td>
                    <td className="py-2 px-4 text-right font-medium">{r.days}</td>
                  </tr>
                ))}
                {turnaround.data?.rows.length === 0 && (
                  <tr><td colSpan={6}><EmptyState title="No completed returns yet" hint="Turnaround appears once returns are marked Completed." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "status" && (
          <div>
            <div className="px-4 py-2 border-b bg-gray-50 text-sm text-gray-600">
              Average days returns spend in each stage, across their full status history. The stage with the
              highest average is your bottleneck.
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2 px-4">Status</th>
                  <th className="py-2 px-4 text-right">Avg Days</th>
                  <th className="py-2 px-4 text-right">Longest</th>
                  <th className="py-2 px-4 text-right">Times Entered</th>
                  <th className="py-2 px-4 text-right">Sitting There Now</th>
                </tr>
              </thead>
              <tbody>
                {status.isLoading && <tr><td colSpan={5}><Loading /></td></tr>}
                {status.data?.map((r, i) => (
                  <tr key={r.status} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium text-gray-800">
                      {ENGAGEMENT_STATUS_LABELS[r.status] ?? r.status}
                      {i === 0 && r.avgDays > 0 && (
                        <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">Bottleneck</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right font-semibold">{r.avgDays.toFixed(1)}</td>
                    <td className="py-2 px-4 text-right text-gray-500">{r.longestDays.toFixed(0)}</td>
                    <td className="py-2 px-4 text-right text-gray-500">{r.stints}</td>
                    <td className={`py-2 px-4 text-right ${r.openNow > 0 ? "font-medium text-gray-800" : "text-gray-400"}`}>{r.openNow}</td>
                  </tr>
                ))}
                {status.data?.length === 0 && (
                  <tr><td colSpan={5}><EmptyState title="No status history yet" hint="This fills in as returns move through their stages." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "capacity" && (
          <div>
            <div className="px-4 py-2 border-b bg-gray-50 text-sm text-gray-600">
              Open returns per person by when they're due. Estimated hours use last year's actual hours for the
              same return; "Remaining" subtracts what's already been logged.
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2 px-4">Staff</th>
                  <th className="py-2 px-4 text-right text-red-600">Overdue</th>
                  <th className="py-2 px-4 text-right">This Week</th>
                  <th className="py-2 px-4 text-right">Next Week</th>
                  <th className="py-2 px-4 text-right">2–4 Wks</th>
                  <th className="py-2 px-4 text-right">Later</th>
                  <th className="py-2 px-4 text-right">No Date</th>
                  <th className="py-2 px-4 text-right">Open</th>
                  <th className="py-2 px-4 text-right">Est. Hrs Left</th>
                </tr>
              </thead>
              <tbody>
                {capacity.isLoading && <tr><td colSpan={9}><Loading /></td></tr>}
                {capacity.data?.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium text-gray-800">{r.name}</td>
                    <td className={`py-2 px-4 text-right ${r.overdue > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}>{r.overdue || "—"}</td>
                    <td className={`py-2 px-4 text-right ${r.thisWeek > 0 ? "text-amber-700 font-medium" : "text-gray-400"}`}>{r.thisWeek || "—"}</td>
                    <td className="py-2 px-4 text-right">{r.nextWeek || "—"}</td>
                    <td className="py-2 px-4 text-right">{r.weeks2to4 || "—"}</td>
                    <td className="py-2 px-4 text-right text-gray-500">{r.later || "—"}</td>
                    <td className="py-2 px-4 text-right text-gray-500">{r.noDate || "—"}</td>
                    <td className="py-2 px-4 text-right font-semibold">{r.returns}</td>
                    <td className="py-2 px-4 text-right">{r.remainingHours > 0 ? r.remainingHours.toFixed(1) : "—"}</td>
                  </tr>
                ))}
                {capacity.data?.length === 0 && (
                  <tr><td colSpan={9}><EmptyState title="No open returns" /></td></tr>
                )}
              </tbody>
              {capacity.data && capacity.data.length > 0 && (() => {
                const t = capacity.data.reduce(
                  (a, r) => ({
                    overdue: a.overdue + r.overdue,
                    thisWeek: a.thisWeek + r.thisWeek,
                    nextWeek: a.nextWeek + r.nextWeek,
                    weeks2to4: a.weeks2to4 + r.weeks2to4,
                    later: a.later + r.later,
                    noDate: a.noDate + r.noDate,
                    returns: a.returns + r.returns,
                    remainingHours: a.remainingHours + r.remainingHours,
                  }),
                  { overdue: 0, thisWeek: 0, nextWeek: 0, weeks2to4: 0, later: 0, noDate: 0, returns: 0, remainingHours: 0 }
                );
                return (
                  <tfoot>
                    <tr className="border-t bg-gray-50 font-semibold text-gray-800">
                      <td className="py-2 px-4">Total</td>
                      <td className={`py-2 px-4 text-right ${t.overdue > 0 ? "text-red-600" : ""}`}>{t.overdue}</td>
                      <td className="py-2 px-4 text-right">{t.thisWeek}</td>
                      <td className="py-2 px-4 text-right">{t.nextWeek}</td>
                      <td className="py-2 px-4 text-right">{t.weeks2to4}</td>
                      <td className="py-2 px-4 text-right">{t.later}</td>
                      <td className="py-2 px-4 text-right">{t.noDate}</td>
                      <td className="py-2 px-4 text-right">{t.returns}</td>
                      <td className="py-2 px-4 text-right">{t.remainingHours.toFixed(1)}</td>
                    </tr>
                  </tfoot>
                );
              })()}
            </table>
          </div>
        )}

        {tab === "profit" && (
          <div>
            <div className="px-4 py-2 border-b bg-gray-50 text-sm text-gray-600">
              Standard value of time logged vs. what was actually billed. Healthy realization runs 85–95%;
              anything under 80% is flagged.
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b bg-gray-50">
                  <th className="py-2 px-4">Client</th>
                  <th className="py-2 px-4 text-right">Hours</th>
                  <th className="py-2 px-4 text-right">Std Value</th>
                  <th className="py-2 px-4 text-right">Billed</th>
                  <th className="py-2 px-4 text-right">Write-Off</th>
                  <th className="py-2 px-4 text-right">Realization</th>
                  <th className="py-2 px-4 text-right">Eff. Rate</th>
                </tr>
              </thead>
              <tbody>
                {profit.isLoading && <tr><td colSpan={7}><Loading /></td></tr>}
                {profit.data?.map((r) => (
                  <tr key={r.name} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-4 font-medium text-gray-800">{r.name}</td>
                    <td className="py-2 px-4 text-right">{r.hours.toFixed(1)}</td>
                    <td className="py-2 px-4 text-right">{currency(r.stdValue)}</td>
                    <td className="py-2 px-4 text-right font-medium">{currency(r.billed)}</td>
                    <td className={`py-2 px-4 text-right ${r.writeOff > 0.005 ? "text-red-600" : "text-gray-400"}`}>
                      {Math.abs(r.writeOff) < 0.005 ? "—" : currency(r.writeOff)}
                    </td>
                    <td
                      className={`py-2 px-4 text-right font-semibold ${
                        r.realization == null ? "text-gray-400" : r.realization < 0.8 ? "text-red-600" : "text-green-700"
                      }`}
                    >
                      {r.realization != null ? `${(r.realization * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="py-2 px-4 text-right">{r.effectiveRate != null ? currency(r.effectiveRate) : "—"}</td>
                  </tr>
                ))}
                {profit.data?.length === 0 && <tr><td colSpan={7}><EmptyState title="No activity in this range" /></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
