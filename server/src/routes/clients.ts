import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

const CLIENT_TYPES = ["Corporation", "Individual", "Sch. E", "Estate", "Trust", "Partnership", "S Corporation", "Non-Profit"] as const;

const clientSchema = z.object({
  name: z.string().min(1),
  clientType: z.enum(CLIENT_TYPES).default("Corporation"),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  spouseName: z.string().optional().nullable(),
  clientCode: z.string().optional().nullable(),
  contactName: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().or(z.literal("")).nullable(),
  contactPhone: z.string().optional().nullable(),
  fiscalYearEndMonth: z.number().int().min(1).max(12).default(12),
  fiscalYearEndDay: z.number().int().min(1).max(31).default(31),
  notes: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
});

const TRASH_RETENTION_DAYS = 90;

function trashCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - TRASH_RETENTION_DAYS);
  return d;
}

// Permanently remove any clients that have been in the trash longer than the
// retention window. Best-effort housekeeping run when the trash is accessed.
async function purgeExpiredTrash() {
  await prisma.client.deleteMany({
    where: { deletedAt: { not: null, lt: trashCutoff() } },
  });
}

router.get("/", async (req, res) => {
  const { q } = req.query;
  const clients = await prisma.client.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: String(q) } },
              { clientCode: { contains: String(q) } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { engagements: { where: { deletedAt: null } } } },
      parent: { select: { id: true, name: true } },
    },
  });
  res.json(clients);
});

// Clients currently in the trash (soft-deleted, still within retention window).
router.get("/trash", async (_req, res) => {
  await purgeExpiredTrash();
  const clients = await prisma.client.findMany({
    where: { deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    include: { _count: { select: { engagements: true } } },
  });
  res.json(clients);
});

router.get("/:id", async (req, res) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      engagements: {
        where: { deletedAt: null },
        include: {
          dueDates: true,
          assignedTo: { select: { id: true, name: true } },
          timeEntries: { select: { hours: true, rate: true, user: { select: { billableRate: true } } } },
          statusChanges: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { name: true } } } },
        },
        orderBy: [{ taxYear: "desc" }, { formType: "asc" }],
      },
    },
  });
  if (!client) return res.status(404).json({ error: "Client not found" });
  res.json(client);
});

const importSchema = z.array(clientSchema.partial({ fiscalYearEndMonth: true, fiscalYearEndDay: true }).extend({ name: z.string().min(1) }));

// Returns the largest purely-numeric client code currently in use (0 if none),
// so new auto-assigned codes continue the sequence.
async function highestNumericClientCode(): Promise<number> {
  const clients = await prisma.client.findMany({
    where: { clientCode: { not: null } },
    select: { clientCode: true },
  });
  let max = 0;
  for (const c of clients) {
    if (c.clientCode && /^\d+$/.test(c.clientCode)) {
      max = Math.max(max, Number(c.clientCode));
    }
  }
  return max;
}

// Bulk import from a parsed spreadsheet. Matches existing clients by
// clientCode (if present) or name, and updates them; otherwise creates new.
router.post("/import", async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  let created = 0;
  let updated = 0;

  // Track the highest numeric client code so rows without one can be assigned
  // the next sequential code (continuing where the existing clients leave off).
  let nextCode = await highestNumericClientCode();

  for (const row of parsed.data) {
    let clientCode = row.clientCode || null;

    // Find any existing client to update (by code if provided, else by name).
    const existing = await prisma.client.findFirst({
      where: clientCode ? { clientCode } : { name: row.name },
    });

    // New client with no code supplied → assign the next chronological code.
    if (!existing && !clientCode) {
      nextCode += 1;
      clientCode = String(nextCode);
    }

    const data = {
      name: row.name,
      clientType: row.clientType ?? "Corporation",
      firstName: row.firstName || null,
      lastName: row.lastName || null,
      spouseName: row.spouseName || null,
      clientCode,
      contactName: row.contactName || null,
      contactEmail: row.contactEmail || null,
      contactPhone: row.contactPhone || null,
      fiscalYearEndMonth: row.fiscalYearEndMonth ?? 12,
      fiscalYearEndDay: row.fiscalYearEndDay ?? 31,
      notes: row.notes || null,
    };

    if (existing) {
      // Don't overwrite an existing code with the (empty) imported one.
      await prisma.client.update({ where: { id: existing.id }, data: { ...data, clientCode: existing.clientCode } });
      updated++;
    } else {
      await prisma.client.create({ data });
      created++;
    }
  }

  res.status(201).json({ created, updated });
});

router.post("/", async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const client = await prisma.client.create({
    data: {
      ...data,
      clientCode: data.clientCode || null,
      contactEmail: data.contactEmail || null,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      spouseName: data.spouseName || null,
      parentId: data.parentId || null,
    },
  });
  res.status(201).json(client);
});

router.put("/:id", async (req, res) => {
  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      ...data,
      clientCode: data.clientCode ?? undefined,
      contactEmail: data.contactEmail ?? undefined,
      parentId: data.parentId === undefined ? undefined : data.parentId || null,
    },
  });
  res.json(client);
});

// Move a client to the trash (soft delete). Restorable for 90 days.
router.delete("/:id", async (req, res) => {
  await prisma.client.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date() },
  });
  res.status(204).send();
});

// Restore a client from the trash.
router.post("/:id/restore", async (req, res) => {
  const client = await prisma.client.update({
    where: { id: req.params.id },
    data: { deletedAt: null },
  });
  res.json(client);
});

// Permanently delete a client from the trash (cannot be undone).
router.delete("/:id/permanent", async (req, res) => {
  await prisma.client.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
