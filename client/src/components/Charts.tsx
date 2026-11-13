import { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Chart colours, kept in step with the Tailwind palette in tailwind.config.js.
export const CHART = {
  brand: "#3e6664",
  brandLight: "#88aaa9",
  brandDark: "#264040",
  accent: "#dca634",
  red: "#ef4444",
  amber: "#f59e0b",
  grid: "#e5e7eb",
  axis: "#5b6372",
};

const axisProps = { stroke: CHART.axis, fontSize: 12, tickLine: false, axisLine: { stroke: CHART.grid } };

const tooltipStyle = {
  contentStyle: { borderRadius: 8, borderColor: "#b0c7c6", fontSize: 12 },
  labelStyle: { color: CHART.brandDark, fontWeight: 700 },
};

/** A card frame for a chart, matching the app's cards. */
export function ChartCard({ title, subtitle, children, height = 260 }: { title: string; subtitle?: string; children: ReactNode; height?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-brand-800">{title}</h2>
        {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal bars — best when the labels are names that need room. */
export function HBarChart({
  data,
  bars,
  valueFormat = (v: number) => String(v),
  stacked = false,
  rowColors,
  integer = false,
}: {
  data: Record<string, string | number>[];
  bars: { key: string; name: string; color: string }[];
  valueFormat?: (v: number) => string;
  stacked?: boolean;
  /** With a single series, colour each row individually (e.g. by severity). */
  rowColors?: string[];
  /** Counts: whole-number ticks only, no "0.75 returns". */
  integer?: boolean;
}) {
  // Long client names would crowd the axis; trim them and let the tooltip show
  // the full name.
  const trimmed = data.map((d) => ({ ...d, label: String(d.label).length > 22 ? String(d.label).slice(0, 21) + "…" : d.label, full: d.label }));
  return (
    <BarChart data={trimmed} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
      <CartesianGrid horizontal={false} stroke={CHART.grid} />
      <XAxis type="number" allowDecimals={!integer} {...axisProps} tickFormatter={(v) => valueFormat(Number(v))} />
      <YAxis type="category" dataKey="label" width={150} {...axisProps} />
      <Tooltip
        {...tooltipStyle}
        cursor={{ fill: "#eef3f3" }}
        labelFormatter={(_, p) => String(p?.[0]?.payload?.full ?? "")}
        formatter={(v, name) => [valueFormat(Number(v)), name]}
      />
      {bars.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      {bars.map((b) => (
        <Bar
          key={b.key}
          dataKey={b.key}
          name={b.name}
          fill={b.color}
          stackId={stacked ? "s" : undefined}
          radius={stacked ? 0 : [0, 4, 4, 0]}
          maxBarSize={22}
        >
          {rowColors && bars.length === 1 && trimmed.map((_, i) => <Cell key={i} fill={rowColors[i % rowColors.length]} />)}
        </Bar>
      ))}
    </BarChart>
  );
}

/** Donut with a coloured slice per category. */
export function Donut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const shown = data.filter((d) => d.value > 0);
  return (
    <PieChart>
      <Tooltip {...tooltipStyle} />
      <Pie data={shown} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="#fff" strokeWidth={2}>
        {shown.map((d) => (
          <Cell key={d.name} fill={d.color} />
        ))}
      </Pie>
    </PieChart>
  );
}
