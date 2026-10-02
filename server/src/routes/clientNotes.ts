import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  clientId: z.string().min(1),
  body: z.string().min(1),
});

const updateSchema = z.object({
  body: z.string().min(1),
});

const include = { createdBy: { select: { id: true, name: true } } };

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
    select: { notes: true, clientNotes: { select: { id: true }, take: 1 } },
  });
  if (!client || client.clientNotes.length > 0) return;
  const legacy = (client.notes ?? "").trim();
  if (!legacy) return;

  await prisma.clientNote.create({
    data: {
      clientId,
      body: `<p>${legacy.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] as string)).replace(/\n/g, "<br>")}</p>`,
    },
  });
}

// All notes for one client, newest first.
router.get("/", async (req, res) => {
  const clientId = String(req.query.clientId ?? "");
  if (!clientId) return res.status(400).json({ error: "clientId is required" });

  await backfillLegacyNote(clientId);

  const notes = await prisma.clientNote.findMany({
    where: { clientId, client: { is: { deletedAt: null } } },
    include,
    orderBy: { createdAt: "desc" },
  });
  res.json(notes);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const note = await prisma.clientNote.create({
    data: {
      clientId: parsed.data.clientId,
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

router.delete("/:id", async (req, res) => {
  await prisma.clientNote.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
