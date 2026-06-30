import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { api } from "../lib/api";
import { User } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useDialog } from "../context/DialogContext";
import { Loading, EmptyState } from "../components/ui";

export default function Admin() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useDialog();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "STAFF">("STAFF");
  const [billableRate, setBillableRate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rollYear, setRollYear] = useState<string>("");

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/auth/users")).data,
  });

  const { data: taxYears } = useQuery<number[]>({
    queryKey: ["due-dates", "tax-years"],
    queryFn: async () => (await api.get("/due-dates/tax-years")).data,
  });

  const rollForward = useMutation({
    mutationFn: async (fromYear: number) =>
      (await api.post("/engagements/rollforward", { fromYear })).data as {
        fromYear: number;
        toYear: number;
        created: number;
        skipped: number;
      },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["due-dates"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      queryClient.invalidateQueries({ queryKey: ["firm-summary"] });
      toast(`Rolled forward ${res.fromYear} → ${res.toYear}: ${res.created} created, ${res.skipped} already existed.`);
    },
    onError: (err: any) => toast(err.response?.data?.error || "Roll forward failed.", "error"),
  });

  const exportAll = useMutation({
    mutationFn: async () => (await api.get("/export/all")).data as Record<string, any[]>,
    onSuccess: (data) => {
      const wb = XLSX.utils.book_new();
      const sheets: [string, any[]][] = [
        ["Clients", data.clients],
        ["Returns", data.returns],
        ["Due Dates", data.dueDates],
        ["Time Entries", data.timeEntries],
        ["Staff", data.staff],
      ];
      for (const [name, rows] of sheets) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows ?? []), name);
      }
      XLSX.writeFile(wb, `cpa-tax-tracker-backup-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast("Backup downloaded.");
    },
    onError: () => toast("Export failed.", "error"),
  });

  const relinkSubtasks = useMutation({
    mutationFn: async () => (await api.post("/engagements/relink-subtasks")).data as { linked: number; historySeeded: number },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["client"] });
      queryClient.invalidateQueries({ queryKey: ["firm-summary"] });
      toast(`Linked ${r.linked} state/city returns to their federal parent; seeded ${r.historySeeded} history entries.`);
    },
    onError: () => toast("Relink failed.", "error"),
  });

  async function handleRollForward() {
    if (!rollYear) return;
    const from = Number(rollYear);
    const ok = await confirm({
      title: `Roll forward ${from} → ${from + 1}?`,
      message: `This creates ${from + 1} returns for every active ${from} return (same client, form, and state), with fresh due dates and a reset status. Returns that already exist for ${from + 1} are skipped. Billing fields start blank; prior-year figures still carry forward for comparison.`,
      confirmLabel: "Roll Forward",
    });
    if (ok) rollForward.mutate(from);
  }

  const createUser = useMutation({
    mutationFn: async () =>
      (
        await api.post("/auth/users", {
          name,
          email,
          password,
          role,
          billableRate: billableRate === "" ? null : Number(billableRate),
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setName("");
      setEmail("");
      setPassword("");
      setRole("STAFF");
      setBillableRate("");
      setError(null);
      toast("Staff member added.");
    },
    onError: (err: any) => {
      setError(err.response?.data?.error?.formErrors?.[0] || err.response?.data?.error || "Something went wrong");
    },
  });

  const updateRate = useMutation({
    mutationFn: async ({ userId, billableRate }: { userId: string; billableRate: number | null }) =>
      (await api.put(`/auth/users/${userId}`, { billableRate })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
  });

  const deleteUser = useMutation({
    mutationFn: async (userId: string) => api.delete(`/auth/users/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast("Staff member removed.");
    },
  });

  async function handleDelete(u: User) {
    const ok = await confirm({
      title: `Remove ${u.name}?`,
      message: "This also deletes their logged time entries.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (ok) deleteUser.mutate(u.id);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createUser.mutate();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-800">Admin</h1>
        <button
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          onClick={() => exportAll.mutate()}
          disabled={exportAll.isPending}
        >
          {exportAll.isPending ? "Exporting…" : "Export All Data (Backup)"}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Roll Forward Returns</h2>
        <p className="text-xs text-gray-400 mb-3">
          Create next year's returns from an existing tax year — copies every active return (client, form, state) with fresh due
          dates and a reset status. Returns that already exist for the next year are skipped.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Roll forward from tax year</label>
            <select
              className="border border-gray-300 rounded px-3 py-2 text-sm"
              value={rollYear}
              onChange={(e) => setRollYear(e.target.value)}
            >
              <option value="">Select a year…</option>
              {taxYears?.map((y) => (
                <option key={y} value={y}>{y} → {y + 1}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleRollForward}
            disabled={!rollYear || rollForward.isPending}
            className="bg-brand-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
          >
            {rollForward.isPending ? "Rolling forward…" : "Roll Forward"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Maintenance</h2>
        <p className="text-xs text-gray-400 mb-3">
          One-time: link existing state/city returns to their federal parent (so they become sub-returns) and seed status history for older returns. Safe to run more than once.
        </p>
        <button
          type="button"
          onClick={() => relinkSubtasks.mutate()}
          disabled={relinkSubtasks.isPending}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {relinkSubtasks.isPending ? "Linking…" : "Link state/city returns to federal"}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Add Staff Member</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
            <input type="password" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "STAFF")}>
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Billable Rate ($/hr)</label>
            <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={billableRate} onChange={(e) => setBillableRate(e.target.value)} placeholder="0.00" />
          </div>
          <div className="md:col-span-5">
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <button type="submit" disabled={createUser.isPending} className="bg-brand-600 text-white text-sm font-medium rounded px-4 py-2 hover:bg-brand-700 disabled:opacity-50">
              Add Staff Member
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="py-2 px-4">Name</th>
              <th className="py-2 px-4">Email</th>
              <th className="py-2 px-4">Role</th>
              <th className="py-2 px-4">Billable Rate ($/hr)</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5}><Loading /></td></tr>
            )}
            {users?.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 px-4 font-medium text-gray-800">{u.name}</td>
                <td className="py-2 px-4 text-gray-600">{u.email}</td>
                <td className="py-2 px-4 text-gray-600">{u.role}</td>
                <td className="py-2 px-4">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="w-28 border border-gray-300 rounded px-2 py-1 text-sm"
                    defaultValue={u.billableRate ?? ""}
                    placeholder="0.00"
                    onBlur={(e) => {
                      const value = e.target.value === "" ? null : Number(e.target.value);
                      if (value !== (u.billableRate ?? null)) {
                        updateRate.mutate({ userId: u.id, billableRate: value });
                      }
                    }}
                  />
                </td>
                <td className="py-2 px-4">
                  {u.id !== currentUser?.id && (
                    <button className="text-red-600 hover:underline" onClick={() => handleDelete(u)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users && users.length === 0 && (
              <tr><td colSpan={5}><EmptyState title="No staff members yet" hint="Add your first staff member above." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
