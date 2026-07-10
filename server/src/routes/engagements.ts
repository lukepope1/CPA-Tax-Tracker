import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateDueDates, FormType } from "../lib/dueDates";

const router = Router();
router.use(requireAuth);

const FORM_TYPES = ["FORM_1040", "FORM_1065", "FORM_1120S", "FORM_1120", "FORM_990", "FORM_709", "FORM_706", "SCH_E", "SCH_C", "OTHER"] as const;
const STATUSES = [
  "NOT_STARTED",
  "INFORMATION_RECEIVED",
  "MISSING_ITEMS",
  "IN_PREP",
  "OPEN_FOR_QUESTIONS",
  "IN_REVIEW",
  "REVIEW_NOTES",
  "SECOND_REVIEW",
  "READY_FOR_DELIVERY",
  "AWAITING_CLIENT_APPROVAL",
  "COMPLETED",
] as const;

const engagementSchema = z.object({
  clientId: z.string().min(1),
  formType: z.enum(FORM_TYPES),
  jurisdiction: z.string().min(1).default("Federal"),
  description: z.string().optional().nullable(),
  parentEngagementId: z.string().optional().nullable(),
  includeEstimates: z.boolean().default(true),
  dueDate: z.string().datetime().optional().nullable(), // optional manual deadline (Other/Special Project)
  taxYear: z.number().int().min(2000).max(2100),
  fiscalYearEndMonth: z.number().int().min(1).max(12).default(12),
  fiscalYearEndDay: z.number().int().min(1).max(31).default(31),
  status: z.enum(STATUSES).optional(),
  assignedToId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateSchema = z.object({
  status: z.enum(STATUSES).optional(),
  extensionFiled: z.boolean().optional(),
  description: z.string().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  projectedFee: z.number().nonnegative().optional().nullable(),
  priorYearFee: z.number().nonnegative().optional().nullable(),
  priorYearHours: z.number().nonnegative().optional().nullable(),
  priorBilled: z.number().nonnegative().optional().nullable(),
  billed: z.boolean().optional(),
  billedDate: z.string().datetime().optional().nullable(),
  billedAmount: z.number().nonnegative().optional().nullable(),
});

// Admin: roll forward every return from one tax year to the next. For each
// active return in `fromYear`, creates the equivalent return for fromYear+1
// (same client / form / jurisdiction) with freshly generated due dates and a
// reset status. Skips any that already exist. Billing fields start blank — last
// year's billed amount/hours still auto-carry for comparison.
router.post("/rollforward", requireAdmin, async (req, res) => {
  const fromYear = Number(req.body.fromYear);
  if (!fromYear || Number.isNaN(fromYear)) {
    return res.status(400).json({ error: "A valid fromYear is required" });
  }
  const toYear = fromYear + 1;

  const source = await prisma.engagement.findMany({
    where: { taxYear: fromYear, deletedAt: null, client: { is: { deletedAt: null } } },
  });

  const existingNext = await prisma.engagement.findMany({
    where: { taxYear: toYear },
    select: { clientId: true, formType: true, jurisdiction: true },
  });
  const seen = new Set(existingNext.map((e) => `${e.clientId}|${e.formType}|${e.jurisdiction}`));

  let created = 0;
  let skipped = 0;
  // Two passes: create top-level returns first, then sub-returns linked to the
  // new year's parent (so the state/city sub-task structure carries forward).
  const newParentByKey = new Map<string, string>(); // clientId|formType -> new top-level id
  const ordered = [...source.filter((e) => !e.parentEngagementId), ...source.filter((e) => e.parentEngagementId)];

  for (const eng of ordered) {
    const key = `${eng.clientId}|${eng.formType}|${eng.jurisdiction}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    const isTopLevel = !eng.parentEngagementId;
    const generated = generateDueDates(
      eng.formType as FormType,
      toYear,
      eng.fiscalYearEndMonth,
      eng.fiscalYearEndDay,
      isTopLevel // estimates only on the top-level (federal) return
    );
    const createdEng = await prisma.engagement.create({
      data: {
        clientId: eng.clientId,
        formType: eng.formType,
        jurisdiction: eng.jurisdiction,
        taxYear: toYear,
        fiscalYearEndMonth: eng.fiscalYearEndMonth,
        fiscalYearEndDay: eng.fiscalYearEndDay,
        status: "NOT_STARTED",
        assignedToId: eng.assignedToId,
        projectedFee: eng.projectedFee, // carry the engagement-letter fee forward as the starting projection
        parentEngagementId: isTopLevel ? null : newParentByKey.get(`${eng.clientId}|${eng.formType}`) ?? null,
        dueDates: { create: generated.map((d) => ({ type: d.type, dueDate: d.dueDate })) },
        statusChanges: { create: { status: "NOT_STARTED", changedById: req.user!.userId } },
      },
    });
    if (isTopLevel) newParentByKey.set(`${eng.clientId}|${eng.formType}`, createdEng.id);
    seen.add(key);
    created++;
  }

  res.json({ fromYear, toYear, created, skipped });
});

// Admin maintenance: link existing state/city returns to their federal parent
// (same client + form + tax year), and create an initial status-history entry
// for any return that has none. One-time cleanup for data created before the
// sub-task model existed. Safe to run repeatedly.
router.post("/relink-subtasks", requireAdmin, async (_req, res) => {
  const all = await prisma.engagement.findMany({
    select: { id: true, clientId: true, formType: true, taxYear: true, jurisdiction: true, parentEngagementId: true, status: true },
  });

  // Map federal returns by client+form+year.
  const federalByKey = new Map<string, string>();
  for (const e of all) {
    if (!e.jurisdiction || e.jurisdiction === "Federal") {
      federalByKey.set(`${e.clientId}|${e.formType}|${e.taxYear}`, e.id);
    }
  }

  let linked = 0;
  for (const e of all) {
    const isFederal = !e.jurisdiction || e.jurisdiction === "Federal";
    if (!isFederal && !e.parentEngagementId) {
      const parent = federalByKey.get(`${e.clientId}|${e.formType}|${e.taxYear}`);
      if (parent && parent !== e.id) {
        await prisma.engagement.update({ where: { id: e.id }, data: { parentEngagementId: parent } });
        linked++;
      }
    }
  }

  // Backfill status history for returns that have none.
  const withHistory = new Set(
    (await prisma.statusChange.findMany({ select: { engagementId: true }, distinct: ["engagementId"] })).map((s) => s.engagementId)
  );
  let seeded = 0;
  for (const e of all) {
    if (!withHistory.has(e.id)) {
      await prisma.statusChange.create({ data: { engagementId: e.id, status: e.status } });
      seeded++;
    }
  }

  res.json({ linked, historySeeded: seeded });
});

// Save a manual importance order for a set of returns (dashboard drag & drop).
// Each id's priority becomes its position in the list.
router.post("/reorder", async (req, res) => {
  const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  if (ids.length === 0) return res.status(400).json({ error: "ids array required" });
  await prisma.$transaction(
    ids.map((id, i) => prisma.engagement.update({ where: { id }, data: { priority: i } }))
  );
  res.json({ ok: true });
});

router.get("/", async (req, res) => {
  const { clientId, taxYear, status, assignedToId } = req.query;
  const engagements = await prisma.engagement.findMany({
    where: {
      deletedAt: null,
      clientId: clientId ? String(clientId) : undefined,
      taxYear: taxYear ? Number(taxYear) : undefined,
      status: status ? (String(status) as any) : undefined,
      assignedToId: assignedToId ? String(assignedToId) : undefined,
    },
    include: {
      client: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      dueDates: { orderBy: { dueDate: "asc" } },
    },
    orderBy: [{ taxYear: "desc" }, { createdAt: "desc" }],
  });
  res.json(engagements);
});

router.get("/:id", async (req, res) => {
  const engagement = await prisma.engagement.findUnique({
    where: { id: req.params.id },
    include: {
      client: true,
      assignedTo: { select: { id: true, name: true } },
      dueDates: { orderBy: { dueDate: "asc" } },
      timeEntries: { orderBy: { date: "desc" }, include: { user: { select: { id: true, name: true } } } },
      statusChanges: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { name: true } } } },
    },
  });
  if (!engagement) return res.status(404).json({ error: "Engagement not found" });
  res.json(engagement);
});

// Status-change history for a single return.
router.get("/:id/history", async (req, res) => {
  const history = await prisma.statusChange.findMany({
    where: { engagementId: req.params.id },
    orderBy: { changedAt: "desc" },
    include: { changedBy: { select: { name: true } } },
  });
  res.json(history);
});

// Creates an engagement and generates its filing/estimate due dates.
router.post("/", async (req, res) => {
  const parsed = engagementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const generated = generateDueDates(
    data.formType,
    data.taxYear,
    data.fiscalYearEndMonth,
    data.fiscalYearEndDay,
    data.includeEstimates
  );

  // 706 estate and "Other / Special Project" returns have no standard deadline;
  // allow an optional manual due date (ongoing projects can be left blank).
  if ((data.formType === "OTHER" || data.formType === "FORM_706") && data.dueDate) {
    generated.push({ type: "ORIGINAL_FILING", dueDate: new Date(data.dueDate) });
  }

  const status = data.status ?? "NOT_STARTED";
  const engagement = await prisma.engagement.create({
    data: {
      clientId: data.clientId,
      formType: data.formType,
      jurisdiction: data.jurisdiction,
      description: data.description || null,
      parentEngagementId: data.parentEngagementId || null,
      taxYear: data.taxYear,
      fiscalYearEndMonth: data.fiscalYearEndMonth,
      fiscalYearEndDay: data.fiscalYearEndDay,
      status,
      assignedToId: data.assignedToId || null,
      notes: data.notes || null,
      dueDates: {
        create: generated.map((d) => ({ type: d.type, dueDate: d.dueDate })),
      },
      statusChanges: { create: { status, changedById: req.user!.userId } },
    },
    include: { dueDates: { orderBy: { dueDate: "asc" } }, client: { select: { id: true, name: true } } },
  });

  res.status(201).json(engagement);
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  // Record a status-change history entry when the status actually changes.
  if (data.status) {
    const current = await prisma.engagement.findUnique({
      where: { id: req.params.id },
      select: { status: true },
    });
    if (current && current.status !== data.status) {
      await prisma.statusChange.create({
        data: { engagementId: req.params.id, status: data.status, changedById: req.user!.userId },
      });
    }
  }

  const engagement = await prisma.engagement.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      extensionFiled: data.extensionFiled,
      description: data.description === undefined ? undefined : data.description || null,
      assignedToId: data.assignedToId === undefined ? undefined : data.assignedToId || null,
      notes: data.notes,
      projectedFee: data.projectedFee,
      priorYearFee: data.priorYearFee,
      priorYearHours: data.priorYearHours,
      priorBilled: data.priorBilled,
      billed: data.billed,
      billedDate:
        data.billed === true
          ? new Date(data.billedDate ?? Date.now())
          : data.billed === false
          ? null
          : data.billedDate
          ? new Date(data.billedDate)
          : undefined,
      billedAmount: data.billedAmount,
    },
    include: { dueDates: { orderBy: { dueDate: "asc" } }, client: { select: { id: true, name: true } } },
  });

  res.json(engagement);
});

// Soft-delete a return (and its state/city sub-returns). Restorable for 30 days
// from the Trash page.
router.delete("/:id", async (req, res) => {
  const now = new Date();
  await prisma.engagement.updateMany({
    where: { OR: [{ id: req.params.id }, { parentEngagementId: req.params.id }] },
    data: { deletedAt: now },
  });
  res.status(204).send();
});

const ENGAGEMENT_TRASH_DAYS = 30;

// Deleted returns still within the 30-day window (top-level; sub-returns restore
// with their parent). Purges anything older.
router.get("/trash/list", async (_req, res) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ENGAGEMENT_TRASH_DAYS);
  await prisma.engagement.deleteMany({ where: { deletedAt: { not: null, lt: cutoff } } });

  const engagements = await prisma.engagement.findMany({
    where: { deletedAt: { not: null }, parentEngagementId: null },
    include: { client: { select: { id: true, name: true } }, subEngagements: { select: { jurisdiction: true } } },
    orderBy: { deletedAt: "desc" },
  });
  res.json(engagements);
});

// Restore a soft-deleted return (and its sub-returns).
router.post("/:id/restore", async (req, res) => {
  await prisma.engagement.updateMany({
    where: { OR: [{ id: req.params.id }, { parentEngagementId: req.params.id }] },
    data: { deletedAt: null },
  });
  res.json({ ok: true });
});

// Permanently delete a soft-deleted return.
router.delete("/:id/permanent", async (req, res) => {
  await prisma.engagement.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
