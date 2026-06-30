import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  DueDate,
  DUE_DATE_TYPE_LABELS,
  ENGAGEMENT_STATUS_LABELS,
  EngagementStatus,
  engagementLabel,
  User,
} from "../lib/types";
import { Loading, EmptyState } from "../components/ui";

const STATUSES: EngagementStatus[] = [
  "NOT_STARTED",
  "INFORMATION_RECEIVED",
  "IN_PREP",
  "IN_REVIEW",
  "READY_FOR_DELIVERY",
  "COMPLETED",
];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function DueDates() {
  const queryClient = useQueryClient();
  const [days, setDays] = useState<string>("all");
  const [taxYear, setTaxYear] = useState<string>("");
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const { data: taxYears } = useQuery<number[]>({
    queryKey: ["due-dates", "tax-years"],
    queryFn: async () => (await api.get("/due-dates/tax-years")).data,
  });

  const { data: users } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/auth/users")).data,
  });

  const { data: dueDates, isLoading } = useQuery<DueDate[]>({
    queryKey: ["due-dates", "list", String(days), taxYear, includeCompleted],
    queryFn: async () =>
      (
        await api.get("/due-dates", {
          params: {
            includeCompleted: includeCompleted ? "true" : "false",
            ...(taxYear ? { taxYear } : days !== "all" ? { days } : {}),
          },
        })
      ).data,
  });

  // Updates the return's workflow status. Choosing "Completed" also marks this
  // due date done (so it drops off the outstanding list); any other status
  // re-opens it.
  const setStatus = useMutation({
    mutationFn: async ({
      engagementId,
      dueDateId,
      status,
    }: {
      engagementId: string;
      dueDateId: string;
      status: EngagementStatus;
    }) => {
      await api.put(`/engagements/${engagementId}`, { status });
      await api.put(`/due-dates/${dueDateId}`, { completed: status === "COMPLETED" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["due-dates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-inbox"] });
    },
  });

  const assign = useMutation({
    mutationFn: async ({ engagementId, assignedToId }: { engagementId: string; assignedToId: string | null }) =>
      (await api.put(`/engagements/${engagementId}`, { assignedToId })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["due-dates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-inbox"] });
    },
  });

  const now = new Date();

  function isFederal(d: DueDate) {
    return !d.engagement?.jurisdiction || d.engagement.jurisdiction === "Federal";
  }

  // Group due dates into "return families" (same client + form type + tax year)
  // so each state return's due dates nest under the matching federal return.
  interface Family {
    key: string;
    federal: DueDate[];
    states: Map<string, DueDate[]>;
    earliest: number;
  }

  const families: Family[] = [];
  {
    const map = new Map<string, Family>();
    for (const d of dueDates ?? []) {
      const e = d.engagement;
      const key = `${e?.client?.id ?? "?"}|${e?.formType ?? "?"}|${e?.taxYear ?? "?"}`;
      let fam = map.get(key);
      if (!fam) {
        fam = { key, federal: [], states: new Map(), earliest: Infinity };
        map.set(key, fam);
        families.push(fam);
      }
      if (isFederal(d)) {
        fam.federal.push(d);
      } else {
        const st = e!.jurisdiction!;
        if (!fam.states.has(st)) fam.states.set(st, []);
        fam.states.get(st)!.push(d);
      }
      fam.earliest = Math.min(fam.earliest, new Date(d.dueDate).getTime());
    }
    const byDate = (a: DueDate, b: DueDate) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    for (const fam of families) {
      fam.federal.sort(byDate);
      for (const arr of fam.states.values()) arr.sort(byDate);
    }
    families.sort((a, b) => a.earliest - b.earliest);
  }

  function renderRow(d: DueDate, opts: { sub?: boolean; rolledUp?: string[] } = {}) {
    const overdue = !d.completed && new Date(d.dueDate) < now;
    return (
      <tr key={d.id} className={`border-b last:border-0 hover:bg-gray-50 ${overdue ? "bg-red-50" : ""}`}>
        <td className={`py-2 px-4 whitespace-nowrap ${overdue ? "text-red-700 font-medium" : ""}`}>{formatDate(d.dueDate)}</td>
        <td className="py-2 px-4">
          <Link to={`/clients/${d.engagement?.client?.id}`} className="text-brand-600 hover:underline">
            {d.engagement?.client?.name}
          </Link>
        </td>
        <td className={`py-2 px-4 whitespace-nowrap ${opts.sub ? "pl-8 text-gray-600" : ""}`}>
          {opts.sub && <span className="text-gray-400 mr-1">↳</span>}
          {d.engagement && engagementLabel(d.engagement)}
          {opts.rolledUp && opts.rolledUp.length > 0 && (
            <span className="ml-2 text-xs text-gray-400">+ {opts.rolledUp.join(", ")}</span>
          )}
        </td>
        <td className="py-2 px-4 whitespace-nowrap">{DUE_DATE_TYPE_LABELS[d.type]}</td>
        <td className="py-2 px-4">
          {d.engagement ? (
            <select
              className="border border-gray-300 rounded px-2 py-1 text-sm"
              value={d.engagement.assignedToId ?? ""}
              onChange={(e) =>
                assign.mutate({ engagementId: d.engagement!.id, assignedToId: e.target.value || null })
              }
            >
              <option value="">Unassigned</option>
              {users?.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : (
            "-"
          )}
        </td>
        <td className="py-2 px-4">
          {d.engagement ? (
            <select
              className="border border-gray-300 rounded px-2 py-1 text-sm"
              value={d.engagement.status}
              onChange={(e) =>
                setStatus.mutate({
                  engagementId: d.engagement!.id,
                  dueDateId: d.id,
                  status: e.target.value as EngagementStatus,
                })
              }
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{ENGAGEMENT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          ) : (
            "-"
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-800">Due Dates</h1>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Tax Year:
            <select className="border border-gray-300 rounded px-2 py-1" value={taxYear} onChange={(e) => setTaxYear(e.target.value)}>
              <option value="">All years</option>
              {taxYears?.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Window:
            <select
              className="border border-gray-300 rounded px-2 py-1 disabled:opacity-50"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={!!taxYear}
            >
              <option value="all">All outstanding</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
              <option value="90">Next 90 days</option>
              <option value="365">Next 12 months</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} />
            Show completed
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="py-2 px-4">Due Date</th>
              <th className="py-2 px-4">Client</th>
              <th className="py-2 px-4">Return</th>
              <th className="py-2 px-4">Type</th>
              <th className="py-2 px-4">Assigned To</th>
              <th className="py-2 px-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6}><Loading /></td></tr>
            )}
            {families.map((fam) => {
              // Collapse a state/city due date when it matches the federal date
              // for the same deadline type; only show ones that differ. A
              // jurisdiction whose dates all match is noted on the federal row.
              const dayKey = (s: string) => new Date(s).toISOString().slice(0, 10);
              const fedDay = new Map<string, string>();
              fam.federal.forEach((d) => fedDay.set(d.type, dayKey(d.dueDate)));
              const rolledUp: string[] = [];
              const stateRows: DueDate[] = [];
              for (const [jurisdiction, rows] of fam.states) {
                const differing = rows.filter((d) => fedDay.get(d.type) !== dayKey(d.dueDate));
                if (differing.length === 0 && fam.federal.length > 0) rolledUp.push(jurisdiction);
                else stateRows.push(...differing.length > 0 ? differing : rows);
              }
              return (
                <Fragment key={fam.key}>
                  {fam.federal.map((d, i) => renderRow(d, { rolledUp: i === 0 ? rolledUp : undefined }))}
                  {stateRows.map((d) => renderRow(d, { sub: true }))}
                </Fragment>
              );
            })}
            {dueDates && dueDates.length === 0 && (
              <tr><td colSpan={6}><EmptyState title="Nothing due" hint="No outstanding due dates for this filter." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
