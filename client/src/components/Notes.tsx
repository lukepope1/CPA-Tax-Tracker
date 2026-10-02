import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useDialog } from "../context/DialogContext";
import { useToast } from "../context/ToastContext";
import { Loading } from "../components/ui";
import RichTextEditor from "./RichTextEditor";
import { FormType } from "../lib/types";

export interface Note {
  id: string;
  body: string;
  clientId: string;
  engagementId: string | null;
  createdById: string | null;
  createdBy?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  engagement?: {
    id: string;
    formType: FormType;
    taxYear: number;
    jurisdiction?: string | null;
    description?: string | null;
  } | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Whether this list belongs to a client as a whole or to one return. */
export type NoteScope = { clientId: string } | { engagementId: string };

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

/**
 * An unsaved note survives navigating away: the draft is mirrored into
 * localStorage under a key for this exact list, and restored when you come
 * back. It is cleared only when the note is saved or the draft is explicitly
 * discarded, so a misclick on the nav bar never costs you what you typed.
 */
function draftKey(scope: NoteScope) {
  return "clientId" in scope ? `note-draft:client:${scope.clientId}` : `note-draft:engagement:${scope.engagementId}`;
}

function readDraft(scope: NoteScope): string {
  try {
    return localStorage.getItem(draftKey(scope)) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(scope: NoteScope, html: string) {
  try {
    if (textLength(html) === 0) localStorage.removeItem(draftKey(scope));
    else localStorage.setItem(draftKey(scope), html);
  } catch {
    /* private mode / storage disabled — drafts just won't persist */
  }
}

function clearDraft(scope: NoteScope) {
  try {
    localStorage.removeItem(draftKey(scope));
  } catch {
    /* ignore */
  }
}

/** Dated rich-text notes, newest first. The section collapses, long notes
 *  collapse to a preview, and deletes go to the trash for 7 days. */
export default function Notes({
  scope,
  heading = "Notes",
  compact = false,
}: {
  scope: NoteScope;
  heading?: string;
  /** Tighter styling, for nesting inside a return card. */
  compact?: boolean;
}) {
  const queryClient = useQueryClient();
  const { confirm } = useDialog();
  const { toast } = useToast();

  const scopeId = "clientId" in scope ? scope.clientId : scope.engagementId;

  const [open, setOpen] = useState(!compact);
  const [draft, setDraft] = useState(() => readDraft(scope));
  const [adding, setAdding] = useState(() => textLength(readDraft(scope)) > 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Moving between clients/returns re-points this list; pick up that record's
  // own draft rather than carrying the previous one across.
  useEffect(() => {
    const saved = readDraft(scope);
    setDraft(saved);
    if (textLength(saved) > 0) {
      setAdding(true);
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  const key = ["notes", scopeId];

  const { data: notes, isLoading } = useQuery<Note[]>({
    queryKey: key,
    queryFn: async () => (await api.get("/client-notes", { params: scope })).data,
    enabled: !!scopeId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["notes-trash"] });
  };

  const addNote = useMutation({
    mutationFn: async (body: string) => (await api.post("/client-notes", { ...scope, body })).data,
    onSuccess: () => {
      invalidate();
      setDraft("");
      clearDraft(scope);
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
      toast("Note moved to trash — restorable for 7 days.");
    },
  });

  async function handleDelete(n: Note) {
    const ok = await confirm({
      title: "Delete this note?",
      message: "It moves to the Trash page and can be restored for 7 days.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) deleteNote.mutate(n.id);
  }

  function onDraftChange(html: string) {
    setDraft(html);
    writeDraft(scope, html);
  }

  async function discardDraft() {
    if (textLength(draft) > 0) {
      const ok = await confirm({
        title: "Discard this draft?",
        message: "What you've typed here will be lost.",
        confirmLabel: "Discard",
        tone: "danger",
      });
      if (!ok) return;
    }
    setDraft("");
    clearDraft(scope);
    setAdding(false);
  }

  const count = notes?.length ?? 0;
  const hasDraft = textLength(draft) > 0;

  const headingClass = compact ? "text-xs font-medium text-gray-500" : "text-lg font-semibold text-gray-800";
  const wrapper = compact ? "mt-3 border-t pt-3" : "bg-white rounded-xl border border-gray-100 shadow-sm";
  const inner = compact ? "" : "border-t border-gray-100 px-4 py-3 space-y-3";

  return (
    <div className={wrapper}>
      <div className={`flex flex-wrap items-center justify-between gap-2 ${compact ? "mb-1" : "px-4 py-3"}`}>
        <button
          type="button"
          className="flex items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="w-3 text-gray-400">{open ? "▾" : "▸"}</span>
          <span className={headingClass}>{heading}</span>
          <span className={`${compact ? "text-xs" : "text-sm"} text-gray-400`}>
            {count === 0 ? "none yet" : `${count} note${count === 1 ? "" : "s"}`}
            {hasDraft && <span className="ml-1 text-amber-600">· draft saved</span>}
          </span>
        </button>
        {open && !adding && (
          <button
            className={
              compact
                ? "text-xs text-brand-600 hover:underline"
                : "bg-brand-600 text-white text-sm font-medium rounded px-3 py-1.5 hover:bg-brand-700"
            }
            onClick={() => setAdding(true)}
          >
            {compact ? "+ Add note" : "Add Note"}
          </button>
        )}
      </div>

      {open && (
        <div className={inner || "space-y-2"}>
          {adding && (
            <div className={compact ? "mb-2" : ""}>
              <RichTextEditor
                value={draft}
                onChange={onDraftChange}
                placeholder="Write a note…"
                minHeight={compact ? 90 : 120}
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  className="bg-brand-600 text-white text-sm font-medium rounded px-3 py-1.5 hover:bg-brand-700 disabled:opacity-40"
                  disabled={!hasDraft || addNote.isPending}
                  onClick={() => addNote.mutate(draft)}
                >
                  Save note
                </button>
                <button className="text-sm text-gray-500 hover:underline" onClick={discardDraft}>
                  {hasDraft ? "Discard" : "Cancel"}
                </button>
                {hasDraft && (
                  <span className="text-xs text-gray-400">Unsaved — kept if you navigate away.</span>
                )}
              </div>
            </div>
          )}

          {isLoading && <Loading />}

          {!isLoading && count === 0 && !adding && (
            <p className={`${compact ? "text-xs" : "text-sm"} text-gray-400`}>
              {compact ? "No notes on this return." : "No notes yet — add the first one."}
            </p>
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
                    <RichTextEditor value={editBody} onChange={setEditBody} minHeight={compact ? 90 : 120} />
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
