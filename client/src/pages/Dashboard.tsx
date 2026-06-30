import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { StatusBadge } from "../components/ui";
import {
  DueDate,
  ENGAGEMENT_STATUS_LABELS,
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

  const isSelf = userId === user?.id;
  const viewedName = users?.find((u) => u.id === userId)?.name ?? user?.name ?? "";

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
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          {isSelf ? "My Inbox" : `${viewedName}'s Inbox`} — returns in progress
        </h2>
        {inbox && inbox.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Client</th>
                <th className="py-2 pr-4">Return</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Status Since</th>
                <th className="py-2 pr-4">Next Due</th>
              </tr>
            </thead>
            <tbody>
              {inbox.map((item) => {
                const overdueItem = item.nextDueDate && new Date(item.nextDueDate) < new Date();
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">
                      <Link to={`/clients/${item.clientId}`} className="text-brand-600 hover:underline">
                        {item.clientName}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {engagementLabel(item)}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap"><StatusBadge status={item.status} /></td>
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
    <div className="bg-white rounded-lg shadow p-4">
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
