import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useDialog } from "../context/DialogContext";
import { useToast } from "../context/ToastContext";
import { Loading } from "../components/ui";
import RichTextEditor from "./RichTextEditor";

export interface ClientNote {
  id: string;
  body: string;
  createdById: string | null;
  createdBy?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

function formatWhen(d: string) {
  return new Date(d).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Rough length of the rendered text, for deciding whether a note needs its own
// "Show more" — HTML length would count markup and clamp short formatted notes.
function textLength(html: string) {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim().length;
}

const LONG_NOTE = 400;

/** Dated rich-text notes on a client, newest first. The whole section collapses,
 *  and any individual long note collapses to a preview. */
export default function ClientNotes({ clientId }: { clientId: string }) {
  const queryClient = useQueryClient();
  const { confirm } = useDialog();
  const { toast } = useToast();

  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const key = ["client-notes", clientId];

  const { data: notes, isLoading } = useQuery<ClientNote[]>({
    queryKey: key,
    queryFn: async () => (await api.get("/client-notes", { params: { clientId } })).data,
    enabled: !!clientId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const addNote = useMutation({
    mutationFn: async (body: string) => (await api.post("/client-notes", { clientId, body })).data,
    onSuccess: () => {
      invalidate();
      setDraft("");
      setAdding(false);
      toast("Note added.");
    },
    onError: () => toast("Could not add the note.", "error"),
  });

  const updateNote = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) =>
      (await api.put(`/client-notes/${id}`, { body })).data,
    onSuccess: () => {
      invalidate();
      setEditingId(null);
      toast("Note updated.");
    },
    onError: () => toast("Could not update the note.", "error"),
  });

  const deleteNote = useMutation({
    mutationFn: async (id: string) => api.delete(`/client-notes/${id}`),
    onSuccess: () => {
      invalidate();
      toast("Note deleted.");
    },
  });

  async function handleDelete(n: ClientNote) {
    const ok = await confirm({
      title: "Delete this note?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) deleteNote.mutate(n.id);
  }

  const count = notes?.length ?? 0;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="w-3 text-gray-400">{open ? "▾" : "▸"}</span>
          <h2 className="text-lg font-semibold text-gray-800">Notes</h2>
          <span className="text-sm text-gray-400">
            {count === 0 ? "none yet" : `${count} note${count === 1 ? "" : "s"}`}
          </span>
        </button>
        {open && !adding && (
          <button
            className="bg-brand-600 text-white text-sm font-medium rounded px-3 py-1.5 hover:bg-brand-700"
            onClick={() => setAdding(true)}
          >
            Add Note
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3">
          {adding && (
            <div>
              <RichTextEditor value={draft} onChange={setDraft} placeholder="Write a note…" minHeight={120} />
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="bg-brand-600 text-white text-sm font-medium rounded px-3 py-1.5 hover:bg-brand-700 disabled:opacity-40"
                  disabled={textLength(draft) === 0 || addNote.isPending}
                  onClick={() => addNote.mutate(draft)}
                >
                  Save note
                </button>
                <button
                  className="text-sm text-gray-500 hover:underline"
                  onClick={() => {
                    setAdding(false);
                    setDraft("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isLoading && <Loading />}

          {!isLoading && count === 0 && !adding && (
            <p className="text-sm text-gray-500">No notes yet — add the first one.</p>
          )}

          {notes?.map((n) => {
            const isEditing = editingId === n.id;
            const isLong = textLength(n.body) > LONG_NOTE;
            const showFull = expanded[n.id] || !isLong;
            return (
              <div key={n.id} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                  <span>
                    {n.createdBy?.name ?? "Unknown"} · {formatWhen(n.createdAt)}
                    {n.updatedAt !== n.createdAt && <span className="ml-1 text-gray-400">(edited)</span>}
                  </span>
                  {!isEditing && (
                    <span className="flex items-center gap-3">
                      <button
                        className="text-brand-600 hover:underline"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditBody(n.body);
                        }}
                      >
                        Edit
                      </button>
                      <button className="text-red-600 hover:underline" onClick={() => handleDelete(n)}>
                        Delete
                      </button>
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div>
                    <RichTextEditor value={editBody} onChange={setEditBody} minHeight={120} />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        className="bg-brand-600 text-white text-sm font-medium rounded px-3 py-1.5 hover:bg-brand-700 disabled:opacity-40"
                        disabled={textLength(editBody) === 0 || updateNote.isPending}
                        onClick={() => updateNote.mutate({ id: n.id, body: editBody })}
                      >
                        Save
                      </button>
                      <button className="text-sm text-gray-500 hover:underline" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={`note-body text-sm text-gray-800 ${showFull ? "" : "max-h-24 overflow-hidden"}`}
                      dangerouslySetInnerHTML={{ __html: n.body }}
                    />
                    {isLong && (
                      <button
                        className="mt-1 text-xs text-brand-600 hover:underline"
                        onClick={() => setExpanded((e) => ({ ...e, [n.id]: !e[n.id] }))}
                      >
                        {showFull ? "Show less" : "Show more"}
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
