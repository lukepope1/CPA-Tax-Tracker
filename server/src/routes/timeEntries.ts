import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";
import { NON_CHARGE_CATEGORIES } from "../lib/categories";

const router = Router();
router.use(requireAuth);

const timeEntrySchema = z.object({
  userId: z.string().min(1).optional(),
  // Optional, because non-chargeable firm time needn't belong to a client.
  clientId: z.string().min(1).optional().nullable(),
  engagementId: z.string().optional().nullable(),
  category: z.enum(NON_CHARGE_CATEGORIES).optional().nullable(),
  date: z.string().datetime(),
  hours: z.number().positive().max(24),
  description: z.string().optional().default(""),
  billable: z.boolean().default(true),
  rate: z.number().nonnegative().optional().nullable(),
});

/**
 * An entry is either client work or non-chargeable firm time. Non-charge time
 * is forced non-billable and detached from any return, so it can never find its
 * way onto a bill no matter what the caller sent.
 */
function normalize<T extends { category?: string | null; clientId?: string | null; engagementId?: string | null; billable?: boolean }>(d: T) {
  const nonCharge = !!d.category;
  return {
    category: d.category ?? null,
    clientId: d.clientId || null,
    engagementId: nonCharge ? null : d.engagementId || null,
    billable: nonCharge ? false : d.billable,
  };
}

router.get("/", async (req, res) => {
  const { userId, clientId, engagementId, from, to } = req.query;

  const where: any = {};
  if (userId) where.userId = String(userId);
  if (clientId) where.clientId = String(clientId);
  if (req.query.category) where.category = String(req.query.category);
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

  const n = normalize(data);
  // Every entry must be pinned to something: a client, or a firm category.
  if (!n.clientId && !n.category) {
    return res.status(400).json({ error: "Pick a client, or a non-chargeable category" });
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: data.userId || req.user!.userId,
      clientId: n.clientId,
      engagementId: n.engagementId,
      category: n.category,
      date: new Date(data.date),
      hours: data.hours,
      description: data.description,
      billable: n.billable ?? true,
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
      userId: data.userId,
      // Category drives the rest, so whenever it's part of the update the
      // client/return/billable fields are re-derived together.
      ...(data.category === undefined
        ? {
            clientId: data.clientId === undefined ? undefined : data.clientId || null,
            engagementId: data.engagementId === undefined ? undefined : data.engagementId || null,
            billable: data.billable,
          }
        : normalize(data)),
      date: data.date ? new Date(data.date) : undefined,
      hours: data.hours,
      description: data.description,
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
