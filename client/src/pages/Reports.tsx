import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Loading, EmptyState } from "../components/ui";
import { FORM_TYPE_LABELS, FormType } from "../lib/types";

type ReportKey = "staff" | "clients" | "aging" | "turnaround";

interface StaffRow { name: string; hours: number; billableHours: number; value: number }
interface ClientRow { name: string; hours: number; value: number }
interface AgingRow { name: string; d0_30: number; d31_60: number; d61_90: number; d90plus: number; total: number }
interface TurnRow {
  client: string; formType: FormType; jurisdiction: string | null; taxYear: number;
  assignedTo: string; received: string; completed: string; days: number;
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
    }
    if (rows.length === 0) return toast("Nothing to export.", "error");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet);
    XLSX.writeFile(wb, `report-${tab}-${todayISO()}.xlsx`);
    toast("Report exported.");
  }

  const usesDates = tab === "staff" || tab === "clients";

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

      <div className="bg-white rounded-lg shadow overflow-x-auto">
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
      </div>
    </div>
  );
}
