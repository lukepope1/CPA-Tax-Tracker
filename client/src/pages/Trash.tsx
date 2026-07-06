import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Client, Engagement, engagementLabel } from "../lib/types";
import { useToast } from "../context/ToastContext";
import { useDialog } from "../context/DialogContext";
import { Loading, EmptyState } from "../components/ui";

const RETENTION_DAYS = 90;

function daysLeft(deletedAt?: string | null) {
  if (!deletedAt) return RETENTION_DAYS;
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86400000;
  return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed));
}

function formatDate(d?: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export default function Trash() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { confirm } = useDialog();

  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["clients-trash"],
    queryFn: async () => (await api.get("/clients/trash")).data,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["clients-trash"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });
  };

  const restore = useMutation({
    mutationFn: async (clientId: string) => api.post(`/clients/${clientId}/restore`),
    onSuccess: () => {
      invalidate();
      toast("Client restored.");
    },
  });

  const purge = useMutation({
    mutationFn: async (clientId: string) => api.delete(`/clients/${clientId}/permanent`),
    onSuccess: () => {
      invalidate();
      toast("Client permanently deleted.");
    },
  });

  async function handlePurge(c: Client) {
    const ok = await confirm({
      title: `Permanently delete "${c.name}"?`,
      message: "This cannot be undone and will remove the client and all of its returns, due dates, and time entries.",
      confirmLabel: "Delete permanently",
      tone: "danger",
    });
    if (ok) purge.mutate(c.id);
  }

  type TrashedEngagement = Engagement & { client?: { id: string; name: string }; deletedAt?: string | null; subEngagements?: { jurisdiction: string }[] };

  const { data: trashedReturns, isLoading: returnsLoading } = useQuery<TrashedEngagement[]>({
    queryKey: ["engagements-trash"],
    queryFn: async () => (await api.get("/engagements/trash/list")).data,
  });

  const restoreReturn = useMutation({
    mutationFn: async (id: string) => api.post(`/engagements/${id}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements-trash"] });
      queryClient.invalidateQueries({ queryKey: ["client"] });
      queryClient.invalidateQueries({ queryKey: ["due-dates"] });
      toast("Return restored.");
    },
  });

  const purgeReturn = useMutation({
    mutationFn: async (id: string) => api.delete(`/engagements/${id}/permanent`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engagements-trash"] });
      toast("Return permanently deleted.");
    },
  });

  async function handlePurgeReturn(e: TrashedEngagement) {
    const ok = await confirm({
      title: "Permanently delete this return?",
      message: `${engagementLabel(e)} — this cannot be undone.`,
      confirmLabel: "Delete permanently",
      tone: "danger",
    });
    if (ok) purgeReturn.mutate(e.id);
  }

  function returnDaysLeft(deletedAt?: string | null) {
    if (!deletedAt) return 30;
    const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86400000;
    return Math.max(0, Math.ceil(30 - elapsed));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-800">Trash</h1>
        <p className="text-sm text-gray-500">
          Deleted clients are kept here for {RETENTION_DAYS} days, then permanently removed. Restore any client to bring it back.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b bg-gray-50">
              <th className="py-2 px-4">Name</th>
              <th className="py-2 px-4">Type</th>
              <th className="py-2 px-4">Deleted</th>
              <th className="py-2 px-4">Days Left</th>
              <th className="py-2 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5}><Loading /></td></tr>
            )}
            {clients?.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 px-4 font-medium text-gray-800">{c.name}</td>
                <td className="py-2 px-4 text-gray-600">{c.clientType ?? "-"}</td>
                <td className="py-2 px-4 text-gray-600">{formatDate(c.deletedAt)}</td>
                <td className="py-2 px-4 text-gray-600">{daysLeft(c.deletedAt)}</td>
                <td className="py-2 px-4 text-right whitespace-nowrap">
                  <button className="text-brand-600 hover:underline mr-4" onClick={() => restore.mutate(c.id)}>
                    Restore
                  </button>
                  <button className="text-red-600 hover:underline" onClick={() => handlePurge(c)}>
                    Delete permanently
                  </button>
                </td>
              </tr>
            ))}
            {clients && clients.length === 0 && (
              <tr><td colSpan={5}><EmptyState title="No deleted clients" hint="Deleted clients appear here for 90 days." /></td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-800">Deleted Returns</h2>
        <p className="text-sm text-gray-500 mb-2">Deleted returns are kept for 30 days, then permanently removed.</p>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b bg-gray-50">
                <th className="py-2 px-4">Client</th>
                <th className="py-2 px-4">Return</th>
                <th className="py-2 px-4">Deleted</th>
                <th className="py-2 px-4">Days Left</th>
                <th className="py-2 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {returnsLoading && (
                <tr><td colSpan={5}><Loading /></td></tr>
              )}
              {trashedReturns?.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 px-4">
                    <Link to={`/clients/${e.client?.id}`} className="text-brand-600 hover:underline">{e.client?.name}</Link>
                  </td>
                  <td className="py-2 px-4">
                    {engagementLabel(e)}
                    {e.subEngagements && e.subEngagements.length > 0 && (
                      <span className="ml-2 text-xs text-gray-400">+ {e.subEngagements.map((s) => s.jurisdiction).join(", ")}</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-gray-600">{formatDate(e.deletedAt)}</td>
                  <td className="py-2 px-4 text-gray-600">{returnDaysLeft(e.deletedAt)}</td>
                  <td className="py-2 px-4 text-right whitespace-nowrap">
                    <button className="text-brand-600 hover:underline mr-4" onClick={() => restoreReturn.mutate(e.id)}>
                      Restore
                    </button>
                    <button className="text-red-600 hover:underline" onClick={() => handlePurgeReturn(e)}>
                      Delete permanently
                    </button>
                  </td>
                </tr>
              ))}
              {trashedReturns && trashedReturns.length === 0 && (
                <tr><td colSpan={5}><EmptyState title="No deleted returns" hint="Deleted returns appear here for 30 days." /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
