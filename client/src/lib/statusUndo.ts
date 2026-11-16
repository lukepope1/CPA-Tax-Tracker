import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useToast } from "../context/ToastContext";
import { ENGAGEMENT_STATUS_LABELS, EngagementStatus } from "./types";

/** What the server reports back when a status change happens. */
export interface StatusUndo {
  engagementId: string;
  previousStatus: EngagementStatus;
  statusChangeId: string;
}

/**
 * After a status change, show "Status changed to X · Undo". Undo puts the
 * return (and any sub-returns carried along) back where they were and removes
 * the history entries the slip created. `afterUndo` lets a caller reverse its
 * own side effects too (Due Dates also ticks the deadline complete).
 */
export function useStatusUndo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return function offerUndo(
    response: { statusUndo?: StatusUndo[]; status?: string } | undefined,
    afterUndo?: () => Promise<unknown>
  ) {
    const changes = response?.statusUndo;
    if (!changes?.length) return;
    const label = ENGAGEMENT_STATUS_LABELS[response!.status as EngagementStatus] ?? response!.status;
    const extra = changes.length > 1 ? ` (+${changes.length - 1} state/city)` : "";

    toast(`Status changed to ${label}${extra}`, "success", {
      label: "Undo",
      onClick: async () => {
        try {
          const { data } = await api.post("/engagements/status-undo", { changes });
          if (afterUndo) await afterUndo();
          await queryClient.invalidateQueries();
          if (data.skipped > 0 && data.reverted === 0) {
            toast("Couldn't undo — the status has changed again since.", "error");
          } else if (data.skipped > 0) {
            toast(`Undone, except ${data.skipped} return${data.skipped === 1 ? "" : "s"} that changed again since.`, "info");
          } else {
            toast("Status change undone.");
          }
        } catch {
          toast("Couldn't undo the status change.", "error");
        }
      },
    });
  };
}
