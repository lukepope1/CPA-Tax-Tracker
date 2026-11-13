import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Client, Task, User } from "../lib/types";
import { isOverdue } from "../lib/dates";
import { DueChip, EmptyState } from "./ui";
import { ListChecks } from "lucide-react";

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
  // Only person-scoped lists offer a client picker — on a client or return page
  // the client is already implied by where you are.
  const picksClient = "assignedToId" in scope;
  const [taskClientId, setTaskClientId] = useState("");

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: async () => (await api.get("/clients")).data,
    enabled: picksClient,
  });

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
        // Blank means a general task with no client — that stays possible.
        ...(picksClient && taskClientId ? { clientId: taskClientId } : {}),
        title: title.trim(),
        // <input type="date"> yields YYYY-MM-DD; pin to UTC midnight so it shows
        // as the same calendar day everywhere.
        dueDate: due ? new Date(`${due}T00:00:00Z`).toISOString() : null,
        assignedToId: assignee === "unassigned" || !assignee ? null : assignee,
      }),
    onSuccess: () => {
      setTitle("");
      setDue("");
      setTaskClientId("");
      if (compact) setAdding(false);
      refresh();
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => api.put(`/tasks/${id}`, { completed }),
    onSuccess: refresh,
  });

  // Re-dating an existing task. Same UTC-midnight convention as when adding one.
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  // What's in the date box while editing. Saved only when you're done (Enter or
  // clicking away) — a date input reports a valid date after every typed digit,
  // so saving on each change would store January the moment you typed "1".
  const [draftDue, setDraftDue] = useState("");

  function startDueEdit(t: Task) {
    setDraftDue(t.dueDate ? t.dueDate.slice(0, 10) : "");
    setEditingDueId(t.id);
  }

  function commitDue(t: Task) {
    const current = t.dueDate ? t.dueDate.slice(0, 10) : "";
    // Unchanged, or a half-typed (empty) value: just close.
    if (!draftDue || draftDue === current) return setEditingDueId(null);
    setDueDate.mutate({ id: t.id, due: draftDue });
  }
  const setDueDate = useMutation({
    mutationFn: async ({ id, due }: { id: string; due: string | null }) =>
      api.put(`/tasks/${id}`, { dueDate: due ? new Date(`${due}T00:00:00Z`).toISOString() : null }),
    onSuccess: () => {
      setEditingDueId(null);
      refresh();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: refresh,
  });

  const open = (tasks ?? []).filter((t) => !t.completed);
  const overdue = open.filter((t) => isOverdue(t.dueDate)).length;

  const labelClass = compact ? "text-xs font-medium text-gray-500" : "text-sm font-bold text-brand-800";
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
        className={`w-full lg:w-auto lg:flex-1 lg:min-w-[10rem] border border-gray-300 rounded px-2 py-1 ${rowClass}`}
        placeholder="Add a task…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus={compact}
      />
      {/* The controls and Add travel together, so Add never wraps onto a line
          of its own away from the fields it submits. */}
      <div className="flex flex-wrap items-center gap-2">
      {picksClient && (
        <select
          className={`border border-gray-300 rounded px-2 py-1 max-w-[12rem] ${rowClass} ${
            taskClientId ? "text-gray-700" : "text-gray-400"
          }`}
          value={taskClientId}
          onChange={(e) => setTaskClientId(e.target.value)}
          title="Tie this task to a client (optional)"
        >
          <option value="">No client — general</option>
          {clients?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}
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
      </div>
    </form>
  );

  return (
    <div className={compact ? "mt-3 border-t pt-3" : "bg-white rounded-xl border border-gray-200 shadow-sm p-4"}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "mb-1" : "mb-3"}`}>
        <div className={`inline-flex items-center gap-2 ${labelClass}`}>
          <ListChecks className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
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
                <span className="min-w-[7rem] text-right text-xs">
                  {editingDueId === t.id ? (
                    <span className="inline-flex items-center gap-1">
                      <input
                        type="date"
                        autoFocus
                        className="rounded border border-brand-300 px-1.5 py-0.5 text-xs text-gray-800"
                        value={draftDue}
                        disabled={setDueDate.isPending}
                        onChange={(e) => setDraftDue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitDue(t);
                          if (e.key === "Escape") setEditingDueId(null);
                        }}
                        onBlur={(e) => {
                          // Moving to the "remove date" button isn't "done".
                          if (!(e.relatedTarget as HTMLElement | null)?.dataset?.clearDue) commitDue(t);
                        }}
                        aria-label="Due date"
                      />
                      {t.dueDate && (
                        <button
                          type="button"
                          data-clear-due="1"
                          className="rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                          title="Remove the due date"
                          onClick={() => setDueDate.mutate({ id: t.id, due: null })}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ) : t.completed ? (
                    t.dueDate ? (
                      <span className="text-gray-500 line-through">{formatDate(t.dueDate)}</span>
                    ) : (
                      <span className="text-gray-400">No due date</span>
                    )
                  ) : (
                    // Open tasks: the date is the control for changing it.
                    <button
                      type="button"
                      onClick={() => startDueEdit(t)}
                      className="rounded-full hover:ring-2 hover:ring-brand-200"
                      title={t.dueDate ? "Change due date" : "Add a due date"}
                    >
                      {t.dueDate ? (
                        <DueChip date={t.dueDate} />
                      ) : (
                        <span className="inline-block px-1 text-gray-400 underline decoration-dotted hover:text-brand-600">
                          No due date
                        </span>
                      )}
                    </button>
                  )}
                </span>
                <button
                  onClick={() => remove.mutate(t.id)}
                  className="text-xs text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-600"
                  title="Move to trash — recoverable for 7 days"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        compact ? (
          <p className="text-xs text-gray-500">No tasks on this return.</p>
        ) : (
          <EmptyState compact icon={ListChecks} title="No tasks yet" hint="Add one above — give it a due date and it'll show on the dashboard." />
        )
      )}
    </div>
  );
}
