import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { Client, Engagement, engagementLabel, TimeEntry } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDialog } from "../context/DialogContext";
import { Loading, EmptyState, useSort, SortTh } from "../components/ui";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const TIMER_STORAGE_KEY = "cpa-time-tracker-timer";

interface StoredTimer {
  startedAt: number;
  clientId: string;
  engagementId: string;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

export default function TimeEntries() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { confirm } = useDialog();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [engagementId, setEngagementId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [hours, setHours] = useState("1.0");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [rate, setRate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [timer, setTimer] = useState<StoredTimer | null>(() => {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredTimer) : null;
  });
  const [timerClientId, setTimerClientId] = useState("");
  const [timerEngagementId, setTimerEngagementId] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["clients"],
    queryFn: async () => (await api.get("/clients")).data,
  });

  const { data: engagements } = useQuery<Engagement[]>({
    queryKey: ["engagements", clientId],
    queryFn: async () => (await api.get("/engagements", { params: { clientId } })).data,
    enabled: !!clientId,
  });

  const { data: timerEngagements } = useQuery<Engagement[]>({
    queryKey: ["engagements", timerClientId || timer?.clientId],
    queryFn: async () => (await api.get("/engagements", { params: { clientId: timerClientId || timer?.clientId } })).data,
    enabled: !!(timerClientId || timer?.clientId),
  });

  function startTimer() {
    if (!timerClientId) return;
    const newTimer: StoredTimer = { startedAt: Date.now(), clientId: timerClientId, engagementId: timerEngagementId };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(newTimer));
    setTimer(newTimer);
    setNow(Date.now());
  }

  function stopTimer() {
    if (!timer) return;
    const elapsedHours = (Date.now() - timer.startedAt) / 3600000;
    const rounded = Math.max(0.1, Math.round(elapsedHours * 10) / 10);
    setClientId(timer.clientId);
    setEngagementId(timer.engagementId);
    setHours(rounded.toFixed(1));
    localStorage.removeItem(TIMER_STORAGE_KEY);
    setTimer(null);
    setTimerClientId("");
    setTimerEngagementId("");
  }

  function cancelTimer() {
    localStorage.removeItem(TIMER_STORAGE_KEY);
    setTimer(null);
    setTimerClientId("");
    setTimerEngagementId("");
  }

  const { data: entries, isLoading } = useQuery<TimeEntry[]>({
    queryKey: ["time-entries", user?.id],
    queryFn: async () => (await api.get("/time-entries", { params: { userId: user?.id } })).data,
    enabled: !!user,
  });

  const createEntry = useMutation({
    mutationFn: async () =>
      (
        await api.post("/time-entries", {
          clientId,
          engagementId: engagementId || undefined,
          date: new Date(date).toISOString(),
          hours: Number(hours),
          description,
          billable,
          rate: rate === "" ? null : Number(rate),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      resetForm();
      toast("Time logged.");
    },
  });

  const updateEntry = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/time-entries/${editingId}`, {
          clientId,
          engagementId: engagementId || null,
          date: new Date(date).toISOString(),
          hours: Number(hours),
          description,
          billable,
          rate: rate === "" ? null : Number(rate),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      resetForm();
      toast("Entry updated.");
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (entryId: string) => api.delete(`/time-entries/${entryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      toast("Entry deleted.");
    },
  });

  function resetForm() {
    setEditingId(null);
    setClientId("");
    setEngagementId("");
    setDate(todayISO());
    setDescription("");
    setHours("1.0");
    setRate("");
    setBillable(true);
  }

  function startEdit(entry: TimeEntry) {
    setEditingId(entry.id);
    setClientId(entry.clientId);
    setEngagementId(entry.engagementId ?? "");
    setDate(entry.date.slice(0, 10));
    setHours(String(entry.hours));
    setDescription(entry.description);
    setBillable(entry.billable);
    setRate(entry.rate != null ? String(entry.rate) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(entryId: string) {
    const ok = await confirm({
      title: "Delete this time entry?",
      message: "This is permanent and cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) deleteEntry.mutate(entryId);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    if (editingId) updateEntry.mutate();
    else createEntry.mutate();
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  }

  const effectiveRate = (e: TimeEntry) => e.rate ?? e.user?.billableRate ?? null;
  const totalHours = entries?.reduce((sum, e) => sum + e.hours, 0) ?? 0;
  const totalValue = entries?.reduce((sum, e) => sum + e.hours * (effectiveRate(e) ?? 0), 0) ?? 0;

  const currency = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD" });

  const entryRows = (entries ?? []).map((e) => ({
    entry: e,
    date: e.date,
    client: e.client?.name ?? "",
    return: e.engagement ? engagementLabel(e.engagement) : "",
    description: e.description,
    hours: e.hours,
    rate: effectiveRate(e) ?? 0,
    value: e.hours * (effectiveRate(e) ?? 0),
    billable: e.billable ? "Yes" : "No",
  }));
  const entrySort = useSort(entryRows, "date", "desc");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-800">Time Entry</h1>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Timer</h2>
        {!timer ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={timerClientId}
                onChange={(e) => { setTimerClientId(e.target.value); setTimerEngagementId(""); }}
              >
                <option value="">Select a client...</option>
                {clients?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Return (optional)</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={timerEngagementId}
                onChange={(e) => setTimerEngagementId(e.target.value)}
                disabled={!timerClientId}
              >
                <option value="">General / none</option>
                {timerEngagements?.filter((eng) => !eng.parentEngagementId).map((eng) => (
                  <option key={eng.id} value={eng.id}>{engagementLabel(eng)}</option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="button"
                onClick={startTimer}
                disabled={!timerClientId}
                className="bg-green-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-green-700 disabled:opacity-50"
              >
                Start Timer
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="text-sm text-gray-500">
                {clients?.find((c) => c.id === timer.clientId)?.name}
                {timer.engagementId && timerEngagements
                  ? (() => {
                      const eng = timerEngagements.find((e) => e.id === timer.engagementId);
                      return eng ? ` — ${engagementLabel(eng)}` : "";
                    })()
                  : ""}
              </div>
              <div className="text-2xl font-mono font-semibold text-gray-800">{formatElapsed(now - timer.startedAt)}</div>
            </div>
            <button
              type="button"
              onClick={stopTimer}
              className="bg-red-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-red-700"
            >
              Stop & Fill Entry
            </button>
            <button
              type="button"
              onClick={cancelTimer}
              className="text-sm text-gray-500 hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
          <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={clientId} onChange={(e) => { setClientId(e.target.value); setEngagementId(""); }} required>
            <option value="">Select a client...</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Return (optional)</label>
          <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={engagementId} onChange={(e) => setEngagementId(e.target.value)} disabled={!clientId}>
            <option value="">General / none</option>
            {engagements?.filter((eng) => !eng.parentEngagementId).map((eng) => (
              <option key={eng.id} value={eng.id}>{engagementLabel(eng)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input type="date" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
          <input type="number" step="0.1" min="0.1" max="24" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={hours} onChange={(e) => setHours(e.target.value)} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rate ($/hr, optional)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder={user?.billableRate != null ? `Default ${currency(user.billableRate)}` : "Default rate"}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
          <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex items-end gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
            Billable
          </label>
          <button type="submit" disabled={createEntry.isPending || updateEntry.isPending} className="bg-brand-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-brand-700 disabled:opacity-50">
            {editingId ? "Update Entry" : "Log Time"}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="text-sm text-gray-500 hover:underline">
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">My Time Entries</h2>
          <span className="text-sm text-gray-500">Total: {totalHours.toFixed(2)} hrs &middot; {currency(totalValue)}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 border-b">
              <SortTh field="date" label="Date" sort={entrySort} />
              <SortTh field="client" label="Client" sort={entrySort} />
              <SortTh field="return" label="Return" sort={entrySort} />
              <SortTh field="description" label="Description" sort={entrySort} />
              <SortTh field="hours" label="Hours" sort={entrySort} />
              <SortTh field="rate" label="Rate" sort={entrySort} />
              <SortTh field="value" label="Value" sort={entrySort} />
              <SortTh field="billable" label="Billable" sort={entrySort} />
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9}><Loading /></td></tr>
            )}
            {entrySort.sorted.map((r) => {
              const e = r.entry;
              return (
              <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 px-4 whitespace-nowrap">{formatDate(e.date)}</td>
                <td className="py-2 px-4">{e.client?.name}</td>
                <td className="py-2 px-4 whitespace-nowrap">{e.engagement ? engagementLabel(e.engagement) : "-"}</td>
                <td className="py-2 px-4">{e.description}</td>
                <td className="py-2 px-4">{e.hours}</td>
                <td className="py-2 px-4 whitespace-nowrap">
                  {effectiveRate(e) != null ? currency(effectiveRate(e)!) : "-"}
                  {e.rate != null && <span className="ml-1 text-xs text-amber-600">(adj)</span>}
                </td>
                <td className="py-2 px-4">{effectiveRate(e) != null ? currency(e.hours * effectiveRate(e)!) : "-"}</td>
                <td className="py-2 px-4">{e.billable ? "Yes" : "No"}</td>
                <td className="py-2 px-4 whitespace-nowrap">
                  <button className="text-brand-600 hover:underline mr-3" onClick={() => startEdit(e)}>
                    Edit
                  </button>
                  <button className="text-red-600 hover:underline" onClick={() => handleDelete(e.id)}>
                    Delete
                  </button>
                </td>
              </tr>
              );
            })}
            {entries && entries.length === 0 && (
              <tr><td colSpan={9}><EmptyState title="No time entries yet" hint="Log time above or start the timer." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
