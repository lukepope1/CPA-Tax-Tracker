import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { EngagementStatus, FORM_TYPE_LABELS, FormType } from "../lib/types";
import { Loading, StatusBadge } from "../components/ui";

interface FirmSummary {
  totalReturns: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  wipValue: number;
  billedTotal: number;
  realization: number | null;
}

const FORM_ORDER: FormType[] = ["FORM_1040", "FORM_1065", "FORM_1120S", "FORM_1120", "FORM_990"];
const STATUS_ORDER: EngagementStatus[] = [
  "NOT_STARTED",
  "INFORMATION_RECEIVED",
  "IN_PREP",
  "IN_REVIEW",
  "READY_FOR_DELIVERY",
  "COMPLETED",
];

function currency(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function FirmDashboard() {
  const [taxYear, setTaxYear] = useState<string>("");

  const { data: taxYears } = useQuery<number[]>({
    queryKey: ["due-dates", "tax-years"],
    queryFn: async () => (await api.get("/due-dates/tax-years")).data,
  });

  const { data, isLoading } = useQuery<FirmSummary>({
    queryKey: ["firm-summary", taxYear],
    queryFn: async () =>
      (await api.get("/billing/firm", { params: taxYear ? { taxYear } : undefined })).data,
  });

  const completed = data?.byStatus?.COMPLETED ?? 0;
  const outstanding = data ? data.totalReturns - completed : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-800">Firm Dashboard</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Tax Year:
          <select
            className="border border-gray-300 rounded px-2 py-1"
            value={taxYear}
            onChange={(e) => setTaxYear(e.target.value)}
          >
            <option value="">All years</option>
            {taxYears?.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      {isLoading && <Loading />}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Total Returns" value={data.totalReturns} accent="text-brand-600" />
            <StatCard label="Completed" value={completed} accent="text-green-700" />
            <StatCard label="Outstanding" value={outstanding} accent="text-amber-600" />
            <StatCard label="In Prep" value={data.byStatus?.IN_PREP ?? 0} accent="text-gray-800" />
            <StatCard label="In Review" value={data.byStatus?.IN_REVIEW ?? 0} accent="text-gray-800" />
            <StatCard
              label="Ready for Delivery"
              value={data.byStatus?.READY_FOR_DELIVERY ?? 0}
              accent="text-gray-800"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Total WIP" value={currency(data.wipValue)} accent="text-brand-600" />
            <StatCard label="Billed to Date" value={currency(data.billedTotal)} accent="text-gray-800" />
            <StatCard
              label="Realization"
              value={data.realization != null ? `${(data.realization * 100).toFixed(0)}%` : "—"}
              accent={
                data.realization == null
                  ? "text-gray-400"
                  : data.realization >= 1
                  ? "text-green-700"
                  : data.realization >= 0.85
                  ? "text-amber-600"
                  : "text-red-600"
              }
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Returns by Type</h2>
              <table className="w-full text-sm">
                <tbody>
                  {FORM_ORDER.filter((ft) => data.byType?.[ft]).map((ft) => (
                    <tr key={ft} className="border-b last:border-0">
                      <td className="py-2 text-gray-700">{FORM_TYPE_LABELS[ft]}</td>
                      <td className="py-2 text-right font-medium text-gray-800">{data.byType[ft]}</td>
                    </tr>
                  ))}
                  {Object.keys(data.byType ?? {}).length === 0 && (
                    <tr><td className="py-2 text-gray-500">No returns.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Returns by Status</h2>
              <table className="w-full text-sm">
                <tbody>
                  {STATUS_ORDER.map((s) => (
                    <tr key={s} className="border-b last:border-0">
                      <td className="py-2"><StatusBadge status={s} /></td>
                      <td className="py-2 text-right font-medium text-gray-800">{data.byStatus?.[s] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}
