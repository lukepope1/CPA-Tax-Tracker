import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Task, User } from "../lib/types";

// What this list is "about". The same three shapes drive both the query filter
// and the fields stamped onto anything created here, so a task added under a
// return is automatically tied to that return.
export type TaskScope =
  | { assignedToId: string }
  | { clientId: string }
  | { engagementId: string };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Ad-hoc to-dos with optional due dates. Used on the dashboard (scoped to a
 * person), on a client (scoped to the client) and inside a return card (scoped
 * to the engagement).
 */
export default function TaskList({
  scope,
  users,
  heading = "Tasks",
  compact = false,
  showContext = false,
  defaultAssigneeId = "",
}: {
  scope: TaskScope;
  users: User[];
  heading?: string;
  /** Tighter type and spacing, for nesting inside a return card. */
  compact?: boolean;
  /** Show which client/return a task belongs to (for person-scoped lists). */
  showContext?: boolean;
  defaultAssigneeId?: string;
}) {
  const queryClient = useQueryClient();
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(!compact); // return cards start collapsed
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState(defaultAssigneeId);

  // Follow the default assignee when the caller's context changes (e.g. the
  // dashboard's "Viewing:" selector).
  const [lastDefault, setLastDefault] = useState(defaultAssigneeId);
  if (lastDefault !== defaultAssigneeId) {
    setLastDefault(defaultAssigneeId);
    setAssignee(defaultAssigneeId);
  }

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["tasks", scope, showDone],
    queryFn: async () =>
      (await api.get("/tasks", { params: { ...scope, includeCompleted: showDone ? "true" : undefined } })).data,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
  }

  const create = useMutation({
    mutationFn: async () =>
      api.post("/tasks", {
        ...scope,
        title: title.trim(),
        // <input type="date"> yields YYYY-MM-DD; pin to UTC midnight so it shows
        // as the same calendar day everywhere.
        dueDate: due ? new Date(`${due}T00:00:00Z`).toISOString() : null,
        assignedToId: assignee === "unassigned" || !assignee ? null : assignee,
      }),
    onSuccess: () => {
      setTitle("");
      setDue("");
      if (compact) setAdding(false);
      refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => api.put(`/tasks/${id}`, { completed }),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: refresh,
  });

  const open = (tasks ?? []).filter((t) => !t.completed);
  const overdue = open.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length;

  const labelClass = compact ? "text-xs font-medium text-gray-500" : "text-sm font-semibold text-gray-700";
  const rowClass = compact ? "text-xs" : "text-sm";

  const addForm = (
    <form
      className={`flex flex-wrap items-center gap-2 ${compact ? "mb-2" : "mb-3"}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) create.mutate();
      }}
    >
      <input
        className={`flex-1 min-w-[10rem] border border-gray-300 rounded px-2 py-1 ${rowClass}`}
        placeholder="Add a task…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={compact}
      />
      <input
        type="date"
        className={`border border-gray-300 rounded px-2 py-1 text-gray-600 ${rowClass}`}
        value={due}
        onChange={(e) => setDue(e.target.value)}
        title="Due date (optional)"
      />
      <select
        className={`border border-gray-300 rounded px-2 py-1 ${rowClass}`}
        value={assignee}
        onChange={(e) => setAssignee(e.target.value)}
      >
        <option value="unassigned">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!title.trim() || create.isPending}
        className={`rounded bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-700 disabled:opacity-40 ${rowClass}`}
      >
        Add
      </button>
      {compact && (
        <button type="button" className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setAdding(false)}>
          Cancel
        </button>
      )}
    </form>
  );

  return (
    <div className={compact ? "mt-3 border-t pt-3" : "bg-white rounded-xl border border-gray-100 shadow-sm p-4"}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "mb-1" : "mb-3"}`}>
        <div className={labelClass}>
          {heading}
          <span className="ml-2 font-normal text-gray-400">
            {open.length} open
            {overdue > 0 && <span className="ml-1 font-medium text-red-600">· {overdue} overdue</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {(open.length > 0 || showDone) && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              Show completed
            </label>
          )}
          {compact && !adding && (
            <button className="text-xs text-brand-600 hover:underline" onClick={() => setAdding(true)}>
              + Add task
            </button>
          )}
        </div>
      </div>

      {adding && addForm}

      {tasks && tasks.length > 0 ? (
        <ul className={compact ? "space-y-1" : "divide-y divide-gray-100"}>
          {tasks.map((t) => {
            const isOverdue = !t.completed && t.dueDate && new Date(t.dueDate) < new Date();
            return (
              <li key={t.id} className={`group flex items-center gap-3 ${compact ? "" : "py-2"}`}>
                <input
                  type="checkbox"
                  checked={t.completed}
                  onChange={(e) => toggle.mutate({ id: t.id, completed: e.target.checked })}
                  className="cursor-pointer"
                />
                <span className={`flex-1 ${rowClass} ${t.completed ? "text-gray-400 line-through" : "text-gray-800"}`}>
                  {t.title}
                  {showContext && t.client && (
                    <Link to={`/clients/${t.client.id}`} className="ml-2 text-xs text-brand-600 hover:underline">
                      {t.client.name}
                    </Link>
                  )}
                </span>
                <span className="text-xs text-gray-400">{t.assignedTo?.name ?? "Unassigned"}</span>
                <span
                  className={`w-28 text-right text-xs ${
                    isOverdue ? "font-medium text-red-600" : t.dueDate ? "text-gray-500" : "text-gray-300"
                  }`}
                >
                  {t.dueDate ? formatDate(t.dueDate) : "No due date"}
                </span>
                <button
                  onClick={() => remove.mutate(t.id)}
                  className="text-xs text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600"
                  title="Delete task"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={`${compact ? "text-xs" : "text-sm"} text-gray-400`}>
          {compact ? "No tasks on this return." : "No tasks yet — add one above."}
        </p>
      )}
    </div>
  );
}
