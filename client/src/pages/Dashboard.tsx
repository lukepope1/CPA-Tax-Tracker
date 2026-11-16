import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../context/DialogContext";
import { DueChip, EmptyState, Loading, Skeleton, STATUS_FILL, statusClasses, useSort } from "../components/ui";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  Clock,
  Inbox,
  Layers,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import TaskList from "../components/TaskList";
import { useStatusUndo } from "../lib/statusUndo";
import { daysPastDue, isOverdue } from "../lib/dates";
import {
  DueDate,
  ENGAGEMENT_STATUS_LABELS,
  ENGAGEMENT_STATUSES,
  EngagementStatus,
  DUE_DATE_TYPE_LABELS,
  DueDateType,
  FormType,
  engagementLabel,
  Task,
  User,
} from "../lib/types";

interface Summary {
  overdueCount: number;
  dueThisWeek: number;
  dueThisMonth: number;
  engagementsByStatus: { status: EngagementStatus; count: number }[];
  hoursThisWeek: number;
  tasksOpen: number;
  tasksOverdue: number;
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
  openItemCount: number;
  oldestOpenItem: string | null;
  subReturns: { id: string; jurisdiction: string; status: EngagementStatus }[];
}

// The three due-date stat cards can each be expanded into the list behind them.
type CardKey = "overdue" | "week" | "month";

const CARD_TITLES: Record<CardKey, string> = {
  overdue: "Overdue deadlines",
  week: "Deadlines in the next 7 days",
  month: "Deadlines in the next 30 days",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

// Days since the oldest outstanding request on a return.
function waitingDays(item: InboxItem) {
  if (!item.oldestOpenItem) return 0;
  return Math.floor((Date.now() - new Date(item.oldestOpenItem).getTime()) / 86400000);
}

export default function Dashboard() {
  const { user } = useAuth();
  const { choose } = useDialog();
  const queryClientHook = useQueryClient();
  const offerUndo = useStatusUndo();
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

  // Which stat card is expanded to show the deadlines behind its number.
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const drillDays = openCard === "week" ? 7 : openCard === "month" ? 30 : null;

  const drill = useQuery<DueDate[]>({
    queryKey: ["due-dates", "drill", drillDays, userId],
    queryFn: async () => (await api.get("/due-dates", { params: { days: drillDays, assignedToId: userId } })).data,
    enabled: drillDays !== null,
  });

  // "Overdue" reuses the list already on the page; the other two are fetched on
  // demand with the same window the summary count uses, so the number and the
  // list below it always agree.
  const drillItems = openCard === "overdue" ? overdue ?? [] : drill.data ?? [];
  const drillLoading = openCard === "overdue" ? overdue === undefined : drill.isLoading;

  // Past-due tasks get a banner at the top — they are easy to lose track of
  // otherwise, since the deadline cards above only count filing deadlines.
  const { data: taskList } = useQuery<Task[]>({
    // Keyed under "tasks" so TaskList's invalidation refreshes the banner too.
    queryKey: ["tasks", "overdue-banner", userId],
    queryFn: async () => (await api.get("/tasks", { params: { assignedToId: userId } })).data,
  });
  const overdueTasks = (taskList ?? []).filter((t) => !t.completed && isOverdue(t.dueDate));

  // Tasks checked off in the last week sit at the bottom of the dashboard, so
  // one closed by accident can be put back without hunting for it.
  const { data: recentlyCompletedData } = useQuery<Task[]>({
    queryKey: ["tasks", "recently-completed", userId],
    queryFn: async () =>
      (await api.get("/tasks", { params: { assignedToId: userId, completedWithin: 7 } })).data,
  });
  const recentlyCompleted = recentlyCompletedData ?? [];

  const restoreTask = useMutation({
    mutationFn: async (taskId: string) => api.put(`/tasks/${taskId}`, { completed: false }),
    onSuccess: () => {
      queryClientHook.invalidateQueries({ queryKey: ["tasks"] });
      queryClientHook.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });

  const isUnassigned = userId === "unassigned";
  const isSelf = userId === user?.id;
  const viewedName = isUnassigned ? "Unassigned pool" : users?.find((u) => u.id === userId)?.name ?? user?.name ?? "";

  // "My order" (drag & drop, server-persisted priority) vs. column sorting.
  const [manualOrder, setManualOrder] = useState(true);
  const inboxSort = useSort<InboxItem>(inbox ?? [], "nextDueDate");
  const displayed = manualOrder ? inbox ?? [] : inboxSort.sorted;
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => api.post("/engagements/reorder", { ids }),
    onSuccess: () => queryClientHook.invalidateQueries({ queryKey: ["dashboard-inbox"] }),
  });

  const updateEng = useMutation({
    mutationFn: async ({ engagementId, data }: { engagementId: string; data: Record<string, unknown> }) =>
      (await api.put(`/engagements/${engagementId}`, data)).data,
    onSuccess: (resp) => {
      offerUndo(resp);
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

  // State/city sub-returns hold their own status, so completing a federal return
  // leaves them showing as unfinished. Offer to carry the status down.
  async function handleStatusChange(item: InboxItem, status: EngagementStatus) {
    const behind = (item.subReturns ?? []).filter((s) => s.status !== status);
    if (behind.length === 0) {
      updateEng.mutate({ engagementId: item.id, data: { status } });
      return;
    }
    const picked = await choose({
      title: `Also mark these "${ENGAGEMENT_STATUS_LABELS[status]}"?`,
      message: "Uncheck any state or city return that still needs work — it will stay as it is.",
      options: behind.map((s) => ({
        id: s.id,
        label: s.jurisdiction,
        hint: `currently ${ENGAGEMENT_STATUS_LABELS[s.status]}`,
      })),
      confirmLabel: "Apply",
      // Cancel / ✕ / Esc back out entirely; this button is the old "just this one".
      altLabel: "This return only",
    });
    // Cancelled: change nothing. The dropdown snaps back to the current status.
    if (picked === null) return;

    updateEng.mutate({
      engagementId: item.id,
      data: { status, ...(picked.length > 0 ? { cascadeToIds: picked } : {}) },
    });
  }

  function sortByColumn(key: keyof InboxItem) {
    setManualOrder(false);
    inboxSort.toggle(key);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-800">Dashboard</h1>
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

      {overdueTasks.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-red-800">
              ⚠ {overdueTasks.length} past-due task{overdueTasks.length === 1 ? "" : "s"}
            </h2>
            <span className="text-xs text-red-700">Tie off or reschedule these.</span>
          </div>
          <ul className="mt-2 space-y-1">
            {overdueTasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline gap-2 text-sm text-red-900">
                <span className="font-medium">{t.title}</span>
                {t.client && (
                  <Link to={`/clients/${t.client.id}`} className="text-xs text-red-700 underline hover:no-underline">
                    {t.client.name}
                  </Link>
                )}
                <span className="text-xs text-red-700">
                  due {formatDate(t.dueDate!)} · {daysPastDue(t.dueDate!)} day
                  {daysPastDue(t.dueDate!) === 1 ? "" : "s"} ago
                </span>
              </li>
            ))}
            {overdueTasks.length > 5 && (
              <li className="text-xs text-red-700">and {overdueTasks.length - 5} more below.</li>
            )}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Overdue"
            value={summary?.overdueCount}
            accent="text-red-600"
            icon={TriangleAlert}
            open={openCard === "overdue"}
            onClick={() => setOpenCard(openCard === "overdue" ? null : "overdue")}
          />
          <StatCard
            label="Due in 7 days"
            value={summary?.dueThisWeek}
            accent="text-amber-600"
            icon={CalendarClock}
            open={openCard === "week"}
            onClick={() => setOpenCard(openCard === "week" ? null : "week")}
          />
          <StatCard
            label="Due in 30 days"
            value={summary?.dueThisMonth}
            accent="text-brand-600"
            icon={CalendarDays}
            open={openCard === "month"}
            onClick={() => setOpenCard(openCard === "month" ? null : "month")}
          />
          <StatCard label="Hours this week" value={summary?.hoursThisWeek.toFixed(1)} accent="text-gray-800" icon={Clock} />
        </div>

        {openCard && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold text-brand-800">{CARD_TITLES[openCard]}</h2>
              <div className="flex items-center gap-3">
                {!drillLoading && drillItems.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {drillItems.length} deadline{drillItems.length === 1 ? "" : "s"} across{" "}
                    {new Set(drillItems.map((d) => d.engagementId)).size} return
                    {new Set(drillItems.map((d) => d.engagementId)).size === 1 ? "" : "s"}
                  </span>
                )}
                <button className="text-xs text-brand-600 hover:underline" onClick={() => setOpenCard(null)}>
                  Hide
                </button>
              </div>
            </div>
            {drillLoading ? (
              <Loading />
            ) : drillItems.length > 0 ? (
              <DueDateTable items={drillItems} />
            ) : (
              <p className="text-sm text-gray-500">Nothing here right now.</p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-brand-800">
            <Inbox className="h-4 w-4" aria-hidden="true" />
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
        {inbox === undefined ? (
          <SkeletonRows />
        ) : inbox.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                {manualOrder && <th className="py-2 pr-2 w-6"></th>}
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("clientName")}>Client</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("formType")}>Return</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("status")}>Status</th>
                <th className="py-2 pr-4">Assigned To</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("statusSince")}>Status Since</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("oldestOpenItem")}>Waiting On</th>
                <th className="py-2 pr-4 cursor-pointer hover:text-gray-700" onClick={() => sortByColumn("nextDueDate")}>Next Due</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((item, idx) => {
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
                        className={`rounded-full border-0 px-3 py-1 text-xs font-semibold cursor-pointer ${statusClasses(item.status)}`}
                        value={item.status}
                        onChange={(e) => handleStatusChange(item, e.target.value as EngagementStatus)}
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
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {item.openItemCount > 0 ? (
                        <Link
                          to={`/clients/${item.clientId}`}
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                            waitingDays(item) >= 14 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                          }`}
                          title="Open items outstanding — click to see the list"
                        >
                          {item.openItemCount} item{item.openItemCount === 1 ? "" : "s"}
                          {waitingDays(item) > 0 ? ` · ${waitingDays(item)}d` : ""}
                        </Link>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {item.nextDueDate ? (
                        <span className="inline-flex flex-col items-start gap-0.5">
                          <DueChip date={item.nextDueDate} />
                          {item.nextDueType && (
                            <span className="text-xs text-gray-500">{DUE_DATE_TYPE_LABELS[item.nextDueType]}</span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <EmptyState
            compact
            icon={Inbox}
            title={isUnassigned ? "Nothing waiting in the pool" : "No returns in progress"}
            hint={isUnassigned ? "Every active return has someone on it." : "Returns assigned here show up once work starts."}
          />
        )}
      </div>

      <TaskList
        scope={{ assignedToId: userId }}
        users={users ?? []}
        heading={`${isUnassigned ? "Unassigned" : isSelf ? "My" : `${viewedName}'s`} Tasks`}
        showContext
        defaultAssigneeId={userId}
      />

      {summary && summary.engagementsByStatus.length > 0 && (
        <StatusPipeline rows={summary.engagementsByStatus} />
      )}

      {overdue && overdue.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-red-700">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Overdue ({overdue.length})
          </h2>
          <DueDateTable items={overdue} />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-brand-800">
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          Due in the next 14 days
        </h2>
        {upcoming === undefined ? (
          <SkeletonRows />
        ) : upcoming.length > 0 ? (
          <DueDateTable items={upcoming} />
        ) : (
          <EmptyState compact icon={CalendarCheck} title="Nothing due in the next 14 days" hint="You're clear for the next two weeks." />
        )}
      </div>

      {recentlyCompleted.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-bold text-brand-800">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Recently completed
              <span className="ml-2 font-normal text-gray-400">last 7 days</span>
            </h2>
            <span className="text-xs text-gray-400">Checked something off by mistake? Restore it here.</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {recentlyCompleted.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="flex-1 text-sm text-gray-400 line-through">
                  {t.title}
                  {t.client && (
                    <Link to={`/clients/${t.client.id}`} className="ml-2 text-xs text-brand-600 no-underline hover:underline">
                      {t.client.name}
                    </Link>
                  )}
                </span>
                <span className="text-xs text-gray-400">
                  {t.completedAt ? `completed ${formatDate(t.completedAt)}` : ""}
                </span>
                <button
                  className="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => restoreTask.mutate(t.id)}
                  disabled={restoreTask.isPending}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Each stat card carries the colour of what it measures, keyed off its accent:
// a tinted face, a solid bar down the left edge, and a matching label.
const STAT_TONES: Record<string, { face: string; bar: string; label: string }> = {
  "text-red-600": { face: "from-red-50", bar: "border-l-red-500", label: "text-red-700" },
  "text-amber-600": { face: "from-amber-50", bar: "border-l-amber-500", label: "text-amber-700" },
  "text-brand-600": { face: "from-brand-50", bar: "border-l-brand-500", label: "text-brand-700" },
  "text-gray-800": { face: "from-accent-50", bar: "border-l-accent-400", label: "text-accent-700" },
};

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
  onClick,
  open = false,
}: {
  label: string;
  /** undefined while loading — shown as a placeholder, not as "–", which read
   *  like missing data. */
  value: string | number | undefined;
  accent: string;
  icon?: LucideIcon;
  onClick?: () => void;
  open?: boolean;
}) {
  const tone = STAT_TONES[accent] ?? STAT_TONES["text-brand-600"];
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-bold uppercase tracking-wide ${tone.label}`}>{label}</p>
        {Icon && <Icon className={`h-5 w-5 shrink-0 opacity-80 ${tone.label}`} aria-hidden="true" />}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        {value === undefined ? (
          <Skeleton className="my-1.5 h-7 w-14" />
        ) : (
          <p className={`text-3xl font-bold ${accent}`}>{value}</p>
        )}
        {/* A faint ▸ beside the label didn't read as clickable; a worded cue
            in the brand colour does. */}
        {onClick && (
          <span className="mb-1 text-xs font-semibold text-brand-600 group-hover:underline">
            {open ? "Hide list ▴" : "View list ▾"}
          </span>
        )}
      </div>
    </>
  );

  const base = `bg-white bg-gradient-to-br ${tone.face} to-white rounded-xl border border-l-4 ${tone.bar} shadow-sm p-4 transition-shadow`;

  if (!onClick) {
    return <div className={`${base} border-y-gray-200 border-r-gray-200 hover:shadow-md`}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      title="Click to see the deadlines behind this number"
      className={`${base} group w-full text-left hover:shadow-md cursor-pointer ${
        open ? "border-y-brand-300 border-r-brand-300 ring-2 ring-brand-200" : "border-y-gray-200 border-r-gray-200"
      }`}
    >
      {body}
    </button>
  );
}

/**
 * The whole pipeline as one bar: a segment per status, sized by how many
 * returns sit in it and ordered by the workflow, so it reads left-to-right from
 * not-started to done. Each segment and legend entry opens Due Dates filtered to
 * returns in that status.
 */
function StatusPipeline({ rows }: { rows: { status: EngagementStatus; count: number }[] }) {
  const byStatus = new Map(rows.map((r) => [r.status, r.count]));
  const ordered = ENGAGEMENT_STATUSES.filter((s) => (byStatus.get(s) ?? 0) > 0).map((s) => ({
    status: s,
    count: byStatus.get(s)!,
  }));
  const total = ordered.reduce((n, r) => n + r.count, 0);
  if (total === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-sm font-bold text-brand-800">
          <Layers className="h-4 w-4" aria-hidden="true" />
          Pipeline
        </h2>
        <span className="text-xs text-gray-500">
          {total} active return{total === 1 ? "" : "s"} · click a stage to see its deadlines
        </span>
      </div>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100" role="img" aria-label="Returns by status">
        {ordered.map((r) => (
          <Link
            key={r.status}
            to={`/due-dates?status=${r.status}`}
            className={`${STATUS_FILL[r.status]} h-full transition-opacity hover:opacity-80 border-r-2 border-white last:border-r-0`}
            style={{ width: `${(r.count / total) * 100}%` }}
            title={`${ENGAGEMENT_STATUS_LABELS[r.status]}: ${r.count}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {ordered.map((r) => (
          <Link
            key={r.status}
            to={`/due-dates?status=${r.status}`}
            className="group inline-flex items-center gap-1.5 text-sm"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_FILL[r.status]}`} aria-hidden="true" />
            <span className="font-bold text-gray-900">{r.count}</span>
            <span className="text-gray-600 group-hover:text-brand-700 group-hover:underline">
              {ENGAGEMENT_STATUS_LABELS[r.status]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Placeholder table rows while a list loads, so it doesn't flash "empty". */
function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-1" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

function DueDateTable({ items }: { items: DueDate[] }) {
  return (
    <div className="overflow-x-auto">
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
            <td className="py-2 pr-4 whitespace-nowrap"><DueChip date={d.dueDate} /></td>
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
    </div>
  );
}
