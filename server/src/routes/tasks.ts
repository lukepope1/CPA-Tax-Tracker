import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

// A task is free-text, so everything except the title is optional. Dates arrive
// as ISO strings; a null dueDate means "no deadline, just a to-do".
const createSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  engagementId: z.string().optional().nullable(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  engagementId: z.string().optional().nullable(),
  completed: z.boolean().optional(),
});

const include = {
  assignedTo: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  engagement: { select: { id: true, formType: true, taxYear: true, jurisdiction: true, description: true } },
};

// Never show tasks hanging off a trashed client or a soft-deleted return.
const VISIBLE = {
  OR: [{ clientId: null }, { client: { is: { deletedAt: null } } }],
  AND: [{ OR: [{ engagementId: null }, { engagement: { is: { deletedAt: null } } }] }],
};

// Tasks, newest deadline first. Filters mirror the dashboard's controls:
//   ?assignedToId=<id>|unassigned   ?clientId=  ?engagementId=
//   ?includeCompleted=true          ?days=<n>   (due within the next n days)
router.get("/", async (req, res) => {
  const { assignedToId, clientId, engagementId, includeCompleted, days } = req.query;

  const where: Record<string, unknown> = { ...VISIBLE };
  if (includeCompleted !== "true") where.completed = false;
  if (assignedToId === "unassigned") where.assignedToId = null;
  else if (assignedToId) where.assignedToId = String(assignedToId);
  if (clientId) where.clientId = String(clientId);
  if (engagementId) where.engagementId = String(engagementId);

  if (days) {
    // A window means "has a deadline, and it lands inside it" — undated tasks
    // are excluded rather than treated as due now.
    const to = new Date();
    to.setDate(to.getDate() + Number(days));
    where.dueDate = { not: null, lte: to };
  }

  const tasks = await prisma.task.findMany({ where, include, orderBy: [{ completed: "asc" }, { dueDate: "asc" }] });

  // Prisma sorts nulls first on SQLite; undated tasks belong at the bottom.
  tasks.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.dueDate && !b.dueDate) return a.createdAt.getTime() - b.createdAt.getTime();
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });

  res.json(tasks);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  // A task added under a return belongs to that return's client too, so the
  // client-level list stays a complete picture rather than missing the ones
  // filed against a specific return.
  let clientId = d.clientId || null;
  if (!clientId && d.engagementId) {
    const eng = await prisma.engagement.findUnique({
      where: { id: d.engagementId },
      select: { clientId: true },
    });
    clientId = eng?.clientId ?? null;
  }

  const task = await prisma.task.create({
    data: {
      title: d.title,
      notes: d.notes || null,
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      assignedToId: d.assignedToId || null,
      clientId,
      engagementId: d.engagementId || null,
      createdById: req.user!.userId,
    },
    include,
  });
  res.status(201).json(task);
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: {
      title: d.title,
      notes: d.notes === undefined ? undefined : d.notes || null,
      dueDate: d.dueDate === undefined ? undefined : d.dueDate ? new Date(d.dueDate) : null,
      assignedToId: d.assignedToId === undefined ? undefined : d.assignedToId || null,
      clientId: d.clientId === undefined ? undefined : d.clientId || null,
      engagementId: d.engagementId === undefined ? undefined : d.engagementId || null,
      completed: d.completed,
      // Checking the box stamps the time; unchecking clears it.
      completedAt: d.completed === undefined ? undefined : d.completed ? new Date() : null,
    },
    include,
  });
  res.json(task);
});

router.delete("/:id", async (req, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
