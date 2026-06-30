import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../lib/auth";
import { generateDueDates, FormType } from "../lib/dueDates";

const router = Router();
router.use(requireAuth);

const FORM_TYPES = ["FORM_1040", "FORM_1065", "FORM_1120S", "FORM_1120", "FORM_990"] as const;
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
    where: { taxYear: fromYear, client: { is: { deletedAt: null } } },
  });

  const existingNext = await prisma.engagement.findMany({
    where: { taxYear: toYear },
    select: { clientId: true, formType: true, jurisdiction: true },
  });
  const seen = new Set(existingNext.map((e) => `${e.clientId}|${e.formType}|${e.jurisdiction}`));

  let created = 0;
  let skipped = 0;
  for (const eng of source) {
    const key = `${eng.clientId}|${eng.formType}|${eng.jurisdiction}`;
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    const generated = generateDueDates(
      eng.formType as FormType,
      toYear,
      eng.fiscalYearEndMonth,
      eng.fiscalYearEndDay
    );
    await prisma.engagement.create({
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
        dueDates: { create: generated.map((d) => ({ type: d.type, dueDate: d.dueDate })) },
      },
    });
    seen.add(key);
    created++;
  }

  res.json({ fromYear, toYear, created, skipped });
});

router.get("/", async (req, res) => {
  const { clientId, taxYear, status, assignedToId } = req.query;
  const engagements = await prisma.engagement.findMany({
    where: {
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
    },
  });
  if (!engagement) return res.status(404).json({ error: "Engagement not found" });
  res.json(engagement);
});

// Creates an engagement and generates its filing/estimate due dates.
router.post("/", async (req, res) => {
  const parsed = engagementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const generated = generateDueDates(data.formType, data.taxYear, data.fiscalYearEndMonth, data.fiscalYearEndDay);

  const engagement = await prisma.engagement.create({
    data: {
      clientId: data.clientId,
      formType: data.formType,
      jurisdiction: data.jurisdiction,
      taxYear: data.taxYear,
      fiscalYearEndMonth: data.fiscalYearEndMonth,
      fiscalYearEndDay: data.fiscalYearEndDay,
      status: data.status ?? "NOT_STARTED",
      assignedToId: data.assignedToId || null,
      notes: data.notes || null,
      dueDates: {
        create: generated.map((d) => ({ type: d.type, dueDate: d.dueDate })),
      },
    },
    include: { dueDates: { orderBy: { dueDate: "asc" } }, client: { select: { id: true, name: true } } },
  });

  res.status(201).json(engagement);
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const engagement = await prisma.engagement.update({
    where: { id: req.params.id },
    data: {
      status: data.status,
      extensionFiled: data.extensionFiled,
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

router.delete("/:id", async (req, res) => {
  await prisma.engagement.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
