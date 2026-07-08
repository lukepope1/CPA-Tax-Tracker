import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { StatusBadge, useSort, SortTh } from "../components/ui";
import {
  DueDate,
  ENGAGEMENT_STATUS_LABELS,
  ENGAGEMENT_STATUSES,
  EngagementStatus,
  DUE_DATE_TYPE_LABELS,
  DueDateType,
  FormType,
  engagementLabel,
  User,
} from "../lib/types";

interface Summary {
  overdueCount: number;
  dueThisWeek: number;
  dueThisMonth: number;
  engagementsByStatus: { status: EngagementStatus; count: number }[];
  hoursThisWeek: number;
}

interface InboxItem {
  id: string;
  clientId: string;
  clientName: string;
  formType: FormType;
  jurisdiction?: string;
  taxYear: number;
  status: EngagementStatus;
  extensionFiled: boolean;
  nextDueDate: string | null;
  nextDueType: DueDateType | null;
  statusSince: string | null;
  priority: number | null;
  assignedToId: string | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function Dashboard() {
  const { user } = useAuth();
  const [viewUserId, setViewUserId] = useState<string>(user?.id ?? "");
  const userId = viewUserId || user?.id || "";

  const { data: users } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/auth/users")).data,
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["dashboard-summary", userId],
    queryFn: async () => (await api.get("/dashboard/summary", { params: { userId } })).data,
  });

  const { data: inbox } = useQuery<InboxItem[]>({
    queryKey: ["dashboard-inbox", userId],
    queryFn: async () => (await api.get("/dashboard/inbox", { params: { userId } })).data,
  });

  const { data: upcoming } = useQuery<DueDate[]>({
    queryKey: ["due-dates", "upcoming-14", userId],
    queryFn: async () => (await api.get("/due-dates", { params: { days: 14, assignedToId: userId } })).data,
  });

  const { data: overdue } = useQuery<DueDate[]>({
    queryKey: ["due-dates", "overdue", userId],
    queryFn: async () => (await api.get("/due-dates/overdue", { params: { assignedToId: userId } })).data,
  });

  const isUnassigned = userId === "unassigned";
  const isSelf = userId === user?.id;
  const viewedName = isUnassigned ? "Unassigned pool" : users?.find((u) => u.id === userId)?.name ?? user?.name ?? "";

  // "My order" (drag & drop, server-persisted priority) vs. column sorting.
  const [manualOrder, setManualOrder] = useState(true);
  const inboxSort = useSort<InboxItem>(inbox ?? [], "nextDueDate");
  const displayed = manualOrder ? inbox ?? [] : inboxSort.sorted;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const queryClientHook = useQueryClient();

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.post("/engagements/reorder", { ids }),
    onSuccess: () => queryClientHook.invalidateQueries({ queryKey: ["dashboard-inbox"] }),
  });

  const updateEng = useMutation({
    mutationFn: async ({ engagementId, data }: { engagementId: string; data: Record<string, unknown> }) =>
      (await api.put(`/engagements/${engagementId}`, data)).data,
    onSuccess: () => {
      queryClientHook.invalidateQueries({ queryKey: ["dashboard-inbox"] });
      queryClientHook.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClientHook.invalidateQueries({ queryKey: ["due-dates"] });
    },
  });

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex || !inbox) return;
    const next = [...inbox];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    // Optimistically show the new order, then persist it.
    queryClientHook.setQueryData(["dashboard-inbox", userId], next);
    reorder.mutate(next.map((i) => i.id));
  }

  function sortByColumn(key: keyof InboxItem) {
    setManualOrder(false);
    inboxSort.toggle(key);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-800">Dashboard</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Viewing:
          <select
            className="border border-gray-300 rounded px-2 py-1"
            value={userId}
            onChange={(e) => setViewUserId(e.target.value)}
          >
            {user && <option value={user.id}>My dashboard</option>}
            <option value="unassigned">Unassigned pool (general)</option>
            {users
              ?.filter((u) => u.id !== user?.id)
              .map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Overdue" value={summary?.overdueCount ?? "-"} accent="text-red-600" />
        <StatCard label="Due in 7 days" value={summary?.dueThisWeek ?? "-"} accent="text-amber-600" />
        <StatCard label="Due in 30 days" value={summary?.dueThisMonth ?? "-"} accent="text-brand-600" />
        <StatCard label="Hours this week" value={summary?.hoursThisWeek ?? "-"} accent="text-gray-800" />
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">
            {isUnassigned
              ? "Unassigned Pool — returns not yet assigned"
              : `${isSelf ? "My" : `${viewedName}'s`} Inbox — returns in progress`}
          </h2>
          {manualOrder ? (
            <span className="text-xs text-gray-400">Drag rows to set importance · click a header to sort instead</span>
          ) : (
            <button className="text-xs text-brand-600 hover:underline" onClick={() => setManualOrder(true)}>
              Back to my order
            </button>
          )}
        </div>
        {inbox && inbox.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                {manualOrder && <th className="py-2 pr-2 w-6"></th>}
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("clientName")}>Client</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("formType")}>Return</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("status")}>Status</th>
                <th className="py-2 pr-4">Assigned To</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("statusSince")}>Status Since</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("nextDueDate")}>Next Due</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((item, idx) => {
                const overdueItem = item.nextDueDate && new Date(item.nextDueDate) < new Date();
                return (
                  <tr
                    key={item.id}
                    className={`border-b last:border-0 ${manualOrder ? "cursor-grab" : ""} ${dragIndex === idx ? "opacity-50" : ""}`}
                    draggable={manualOrder}
                    onDragStart={() => setDragIndex(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    {manualOrder && <td className="py-2 pr-2 text-gray-300 select-none">⠿</td>}
                    <td className="py-2 pr-4">
                      <Link to={`/clients/${item.clientId}`} className="text-brand-600 hover:underline">
                        {item.clientName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {engagementLabel(item)}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <select
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        value={item.status}
                        onChange={(e) => updateEng.mutate({ engagementId: item.id, data: { status: e.target.value } })}
                      >
                        {ENGAGEMENT_STATUSES.map((s) => (
                          <option key={s} value={s}>{ENGAGEMENT_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <select
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                        value={item.assignedToId ?? ""}
                        onChange={(e) => updateEng.mutate({ engagementId: item.id, data: { assignedToId: e.target.value || null } })}
                      >
                        <option value="">Unassigned</option>
                        {users?.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-gray-500">{item.statusSince ? formatDate(item.statusSince) : "—"}</td>
                    <td className={`py-2 pr-4 whitespace-nowrap ${overdueItem ? "text-red-700 font-medium" : ""}`}>
                      {item.nextDueDate
                        ? `${formatDate(item.nextDueDate)}${item.nextDueType ? ` (${DUE_DATE_TYPE_LABELS[item.nextDueType]})` : ""}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No returns currently assigned and in progress.</p>
        )}
      </div>

      {summary && summary.engagementsByStatus.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Engagements by status</h2>
          <div className="flex gap-4 flex-wrap">
            {summary.engagementsByStatus.map((s) => (
              <div key={s.status} className="text-sm">
                <span className="font-medium text-gray-800">{s.count}</span>{" "}
                <span className="text-gray-500">{ENGAGEMENT_STATUS_LABELS[s.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {overdue && overdue.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-semibold text-red-700 mb-3">Overdue ({overdue.length})</h2>
          <DueDateTable items={overdue} />
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Due in the next 14 days</h2>
        {upcoming && upcoming.length > 0 ? (
          <DueDateTable items={upcoming} />
        ) : (
          <p className="text-sm text-gray-500">Nothing due in the next 14 days.</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow transition-shadow p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

function DueDateTable({ items }: { items: DueDate[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-gray-500 border-b">
          <th className="py-2 pr-4">Due Date</th>
          <th className="py-2 pr-4">Client</th>
          <th className="py-2 pr-4">Return</th>
          <th className="py-2 pr-4">Type</th>
          <th className="py-2 pr-4">Assigned To</th>
        </tr>
      </thead>
      <tbody>
        {items.map((d) => (
          <tr key={d.id} className="border-b last:border-0">
            <td className="py-2 pr-4 whitespace-nowrap">{formatDate(d.dueDate)}</td>
            <td className="py-2 pr-4">
              <Link to={`/clients/${d.engagement?.client?.id}`} className="text-brand-600 hover:underline">
                {d.engagement?.client?.name}
              </Link>
            </td>
            <td className="py-2 pr-4 whitespace-nowrap">
              {d.engagement && engagementLabel(d.engagement)}
            </td>
            <td className="py-2 pr-4 whitespace-nowrap">{DUE_DATE_TYPE_LABELS[d.type]}</td>
            <td className="py-2 pr-4 whitespace-nowrap">{d.engagement?.assignedTo?.name ?? "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
