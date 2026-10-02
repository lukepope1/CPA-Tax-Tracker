import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  clientId: z.string().min(1).optional(),
  engagementId: z.string().min(1).optional(),
  body: z.string().min(1),
});

// Deleted notes are recoverable for a week, matching tasks.
const TRASH_RETENTION_DAYS = 7;

function trashCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - TRASH_RETENTION_DAYS);
  return d;
}

// Best-effort housekeeping, run whenever the trash is read.
async function purgeExpiredNotes() {
  await prisma.clientNote.deleteMany({ where: { deletedAt: { not: null, lt: trashCutoff() } } });
}

const updateSchema = z.object({
  body: z.string().min(1),
});

const include = {
  createdBy: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  engagement: { select: { id: true, formType: true, taxYear: true, jurisdiction: true, description: true } },
};

// Rich-text bodies are stored as HTML. Everything here is written by staff
// through the app's own editor, but strip the tags that would let a pasted
// payload execute — the notes are rendered with dangerouslySetInnerHTML.
function sanitize(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    // Inline event handlers (onclick=…) and javascript: URLs.
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

// The single Client.notes field this replaced is copied in as the earliest note
// the first time a client's notes are read, so nothing written before the
// upgrade disappears. The original column is left untouched as a backstop.
async function backfillLegacyNote(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      notes: true,
      // Deleted notes count here too — otherwise deleting the backfilled note
      // would just bring it back on the next page load.
      clientNotes: { where: { engagementId: null }, select: { id: true }, take: 1 },
    },
  });
  if (!client || client.clientNotes.length > 0) return;
  const legacy = (client.notes ?? "").trim();
  if (!legacy) return;

  await prisma.clientNote.create({ data: { clientId, body: `<p>${escapeText(legacy)}</p>` } });
}

// Plain text from the old single-field notes, as safe HTML.
function escapeText(s: string) {
  return s
    .replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string))
    .replace(/\n/g, "<br>");
}

// Same idea for a return's old single-field notes.
async function backfillLegacyEngagementNote(engagementId: string) {
  const eng = await prisma.engagement.findUnique({
    where: { id: engagementId },
    select: { notes: true, clientId: true, clientNotes: { select: { id: true }, take: 1 } },
  });
  if (!eng || eng.clientNotes.length > 0) return;
  const legacy = (eng.notes ?? "").trim();
  if (!legacy) return;

  await prisma.clientNote.create({
    data: { clientId: eng.clientId, engagementId, body: `<p>${escapeText(legacy)}</p>` },
  });
}

// Notes for one client or one return, newest first. A client's own list shows
// only its general notes — notes written against a specific return live on that
// return, so the client view doesn't fill up with per-return detail.
router.get("/", async (req, res) => {
  const clientId = req.query.clientId ? String(req.query.clientId) : "";
  const engagementId = req.query.engagementId ? String(req.query.engagementId) : "";
  if (!clientId && !engagementId) {
    return res.status(400).json({ error: "clientId or engagementId is required" });
  }

  if (engagementId) await backfillLegacyEngagementNote(engagementId);
  else await backfillLegacyNote(clientId);

  const notes = await prisma.clientNote.findMany({
    where: {
      deletedAt: null,
      client: { is: { deletedAt: null } },
      ...(engagementId
        ? { engagementId, engagement: { is: { deletedAt: null } } }
        : { clientId, engagementId: null }),
    },
    include,
    orderBy: { createdAt: "desc" },
  });
  res.json(notes);
});

// Notes currently in the trash. Reading this list also purges expired ones.
router.get("/trash", async (_req, res) => {
  await purgeExpiredNotes();
  const notes = await prisma.clientNote.findMany({
    where: { deletedAt: { not: null } },
    include,
    orderBy: { deletedAt: "desc" },
  });
  res.json(notes);
});

router.post("/:id/restore", async (req, res) => {
  const note = await prisma.clientNote.update({
    where: { id: req.params.id },
    data: { deletedAt: null },
    include,
  });
  res.json(note);
});

// Permanently delete, skipping the retention window.
router.delete("/:id/permanent", async (req, res) => {
  await prisma.clientNote.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  // A return's note still records which client it belongs to, so it stays
  // reachable if the note is ever detached from the return.
  let clientId = parsed.data.clientId ?? null;
  if (!clientId && parsed.data.engagementId) {
    const eng = await prisma.engagement.findUnique({
      where: { id: parsed.data.engagementId },
      select: { clientId: true },
    });
    clientId = eng?.clientId ?? null;
  }
  if (!clientId) return res.status(400).json({ error: "clientId or a valid engagementId is required" });

  const note = await prisma.clientNote.create({
    data: {
      clientId,
      engagementId: parsed.data.engagementId ?? null,
      body: sanitize(parsed.data.body),
      createdById: req.user!.userId,
    },
    include,
  });
  res.status(201).json(note);
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const note = await prisma.clientNote.update({
    where: { id: req.params.id },
    data: { body: sanitize(parsed.data.body) },
    include,
  });
  res.json(note);
});

// Move a note to the trash. Recoverable for 7 days.
router.delete("/:id", async (req, res) => {
  await prisma.clientNote.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.status(204).send();
});

export default router;
