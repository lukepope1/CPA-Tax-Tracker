import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { ENGAGEMENT_STATUS_LABELS, ENGAGEMENT_STATUSES, FORM_TYPE_LABELS, FormType } from "../lib/types";
import { EmptyState, Loading, STATUS_HEX, StatusBadge } from "../components/ui";
import { CHART, ChartCard, Donut, HBarChart } from "../components/Charts";
import { ResponsiveContainer } from "recharts";
import { BarChart3 } from "lucide-react";

interface FirmSummary {
  totalReturns: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  wipValue: number;
  billedTotal: number;
  realization: number | null;
}

const FORM_ORDER: FormType[] = ["FORM_1040", "FORM_1065", "FORM_1120S", "FORM_1120", "FORM_990", "FORM_709", "FORM_706", "SCH_E", "SCH_C", "OTHER"];
const STATUS_ORDER = ENGAGEMENT_STATUSES;

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

  const typeRows = FORM_ORDER.filter((ft) => data?.byType?.[ft]).map((ft) => ({
    label: FORM_TYPE_LABELS[ft],
    count: data!.byType[ft],
  }));

  const completed = data?.byStatus?.COMPLETED ?? 0;
  const outstanding = data ? data.totalReturns - completed : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-800">Firm Dashboard</h1>
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

      <p className="text-xs text-gray-400 -mt-2">
        Return counts reflect federal returns only (state and city returns roll up under their federal return). WIP, billed, and realization include all jurisdictions.
      </p>

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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status mix: a donut in the same workflow colours as the status
                pills, with the counts beside it so nothing needs a hover. */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h2 className="text-sm font-bold text-brand-800 mb-2">Returns by Status</h2>
              {data.totalReturns === 0 ? (
                <EmptyState icon={BarChart3} title="No returns yet" />
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="h-56 w-56 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <Donut
                        data={STATUS_ORDER.map((st) => ({
                          name: ENGAGEMENT_STATUS_LABELS[st],
                          value: data.byStatus?.[st] ?? 0,
                          color: STATUS_HEX[st],
                        }))}
                      />
                    </ResponsiveContainer>
                  </div>
                  <ul className="w-full space-y-1.5">
                    {STATUS_ORDER.filter((st) => (data.byStatus?.[st] ?? 0) > 0).map((st) => (
                      <li key={st} className="flex items-center justify-between gap-3 text-sm">
                        <StatusBadge status={st} />
                        <span className="font-bold text-gray-900">{data.byStatus[st]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <ChartCard title="Returns by Type" subtitle="federal returns" height={Math.max(180, typeRows.length * 38)}>
              <HBarChart integer data={typeRows} bars={[{ key: "count", name: "Returns", color: CHART.brand }]} />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-gradient-to-br from-brand-50 to-white rounded-xl border border-gray-200 border-l-4 border-l-brand-500 shadow-sm hover:shadow-md transition-shadow p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}
