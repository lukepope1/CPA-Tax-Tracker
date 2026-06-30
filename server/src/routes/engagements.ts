import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";
import { generateDueDates } from "../lib/dueDates";

const router = Router();
router.use(requireAuth);

const FORM_TYPES = ["FORM_1040", "FORM_1065", "FORM_1120S", "FORM_1120", "FORM_990"] as const;
const STATUSES = [
  "NOT_STARTED",
  "INFORMATION_RECEIVED",
  "IN_PREP",
  "IN_REVIEW",
  "READY_FOR_DELIVERY",
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
