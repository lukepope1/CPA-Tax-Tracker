import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  engagementId: z.string().min(1),
  description: z.string().min(1),
  notes: z.string().optional(),
  requestedAt: z.string().datetime().optional(),
});

const updateSchema = z.object({
  description: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
  requestedAt: z.string().datetime().optional(),
  // Convenience flag: true stamps receivedAt with "now", false clears it.
  received: z.boolean().optional(),
});

// All open items for one engagement (oldest request first), or firm-wide when
// no engagement is given.
router.get("/", async (req, res) => {
  const { engagementId, outstandingOnly } = req.query;
  const items = await prisma.openItem.findMany({
    where: {
      ...(engagementId ? { engagementId: String(engagementId) } : {}),
      ...(outstandingOnly === "true" ? { receivedAt: null } : {}),
      engagement: { is: { deletedAt: null, client: { is: { deletedAt: null } } } },
    },
    orderBy: { requestedAt: "asc" },
  });
  res.json(items);
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { engagementId, description, notes, requestedAt } = parsed.data;

  const item = await prisma.openItem.create({
    data: {
      engagementId,
      description,
      notes: notes || null,
      requestedAt: requestedAt ? new Date(requestedAt) : new Date(),
    },
  });
  res.status(201).json(item);
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { description, notes, requestedAt, received } = parsed.data;

  const item = await prisma.openItem.update({
    where: { id: req.params.id },
    data: {
      description,
      notes: notes === undefined ? undefined : notes || null,
      requestedAt: requestedAt ? new Date(requestedAt) : undefined,
      receivedAt: received === undefined ? undefined : received ? new Date() : null,
    },
  });
  res.json(item);
});

router.delete("/:id", async (req, res) => {
  await prisma.openItem.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
