import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

const timeEntrySchema = z.object({
  userId: z.string().min(1).optional(),
  clientId: z.string().min(1),
  engagementId: z.string().optional().nullable(),
  date: z.string().datetime(),
  hours: z.number().positive().max(24),
  description: z.string().optional().default(""),
  billable: z.boolean().default(true),
  rate: z.number().nonnegative().optional().nullable(),
});

router.get("/", async (req, res) => {
  const { userId, clientId, engagementId, from, to } = req.query;

  const where: any = {};
  if (userId) where.userId = String(userId);
  if (clientId) where.clientId = String(clientId);
  if (engagementId) where.engagementId = String(engagementId);
  if (from || to) {
    where.date = {};
    if (from) where.date.gte = new Date(String(from));
    if (to) where.date.lte = new Date(String(to));
  }

  const entries = await prisma.timeEntry.findMany({
    where,
    include: {
      client: { select: { id: true, name: true } },
      engagement: { select: { id: true, formType: true, taxYear: true, jurisdiction: true } },
      user: { select: { id: true, name: true, billableRate: true } },
    },
    // rate is returned as a scalar field by default
    orderBy: { date: "desc" },
  });
  res.json(entries);
});

router.post("/", async (req, res) => {
  const parsed = timeEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const entry = await prisma.timeEntry.create({
    data: {
      userId: data.userId || req.user!.userId,
      clientId: data.clientId,
      engagementId: data.engagementId || null,
      date: new Date(data.date),
      hours: data.hours,
      description: data.description,
      billable: data.billable,
      rate: data.rate ?? null,
    },
    include: {
      client: { select: { id: true, name: true } },
      engagement: { select: { id: true, formType: true, taxYear: true, jurisdiction: true } },
      user: { select: { id: true, name: true, billableRate: true } },
    },
    // rate is returned as a scalar field by default
  });
  res.status(201).json(entry);
});

router.put("/:id", async (req, res) => {
  const parsed = timeEntrySchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const entry = await prisma.timeEntry.update({
    where: { id: req.params.id },
    data: {
      clientId: data.clientId,
      engagementId: data.engagementId === undefined ? undefined : data.engagementId || null,
      date: data.date ? new Date(data.date) : undefined,
      hours: data.hours,
      description: data.description,
      billable: data.billable,
      rate: data.rate === undefined ? undefined : data.rate,
    },
    include: {
      client: { select: { id: true, name: true } },
      engagement: { select: { id: true, formType: true, taxYear: true, jurisdiction: true } },
      user: { select: { id: true, name: true, billableRate: true } },
    },
    // rate is returned as a scalar field by default
  });
  res.json(entry);
});

router.delete("/:id", async (req, res) => {
  await prisma.timeEntry.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
