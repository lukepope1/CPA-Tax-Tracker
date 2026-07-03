import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

// Upcoming due dates, optionally filtered by a date window (defaults to next 60 days)
// and whether to include already-completed items.
// Excludes due dates that should never appear on the firm-wide views:
//   - clients that are in the trash (soft-deleted)
//   - the ORIGINAL filing deadline once a return has an extension on file
//     (and the EXTENDED deadline until an extension is actually filed)
// Extension-aware exclusions: hide the ORIGINAL deadline once an extension is
// filed, and the EXTENDED deadline until one is.
const EXTENSION_NOT = [
  { type: "ORIGINAL_FILING", engagement: { is: { extensionFiled: true } } },
  { type: "EXTENDED_FILING", engagement: { is: { extensionFiled: false } } },
];

// Builds the engagement-level filter shared by the firm-wide views: never show
// due dates for trashed clients, and optionally scope to a tax year or assignee.
function engagementFilter(opts: { taxYear?: number; assignedToId?: string; status?: string; parentClientId?: string } = {}) {
  const clientIs: Record<string, unknown> = { deletedAt: null };
  if (opts.parentClientId) {
    // Include the parent client itself plus all of its children.
    clientIs.OR = [{ id: opts.parentClientId }, { parentId: opts.parentClientId }];
  }
  const is: Record<string, unknown> = { client: { is: clientIs } };
  if (opts.taxYear) is.taxYear = opts.taxYear;
  if (opts.assignedToId) is.assignedToId = opts.assignedToId;
  // Hide returns marked Completed unless the user explicitly filters by a status.
  if (opts.status) is.status = opts.status;
  else is.status = { not: "COMPLETED" };
  return { is };
}

router.get("/", async (req, res) => {
  const { from, to, includeCompleted, days, taxYear, assignedToId, status, parentClientId } = req.query;

  const where: Record<string, unknown> = {
    completed: includeCompleted === "true" ? undefined : false,
    engagement: engagementFilter({
      taxYear: taxYear ? Number(taxYear) : undefined,
      assignedToId: assignedToId ? String(assignedToId) : undefined,
      status: status ? String(status) : undefined,
      parentClientId: parentClientId ? String(parentClientId) : undefined,
    }),
    NOT: EXTENSION_NOT,
  };

  if (!taxYear && (days || from || to)) {
    // Apply a date window only when one is requested. With no window we return
    // every outstanding item (including overdue), which is the default view.
    const fromDate = from ? new Date(String(from)) : new Date();
    let toDate: Date;
    if (to) {
      toDate = new Date(String(to));
    } else {
      const windowDays = Number(days);
      toDate = new Date(fromDate);
      toDate.setDate(toDate.getDate() + windowDays);
    }
    where.dueDate = { gte: fromDate, lte: toDate };
  }

  const dueDates = await prisma.dueDate.findMany({
    where,
    include: {
      engagement: {
        include: {
          client: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  res.json(dueDates);
});

// Distinct tax years that have engagements, for populating year filter dropdowns.
router.get("/tax-years", async (_req, res) => {
  const years = await prisma.engagement.findMany({
    select: { taxYear: true },
    distinct: ["taxYear"],
    orderBy: { taxYear: "desc" },
  });
  res.json(years.map((y) => y.taxYear));
});

// Overdue, incomplete due dates.
router.get("/overdue", async (req, res) => {
  const { assignedToId } = req.query;
  const dueDates = await prisma.dueDate.findMany({
    where: {
      dueDate: { lt: new Date() },
      completed: false,
      engagement: engagementFilter({ assignedToId: assignedToId ? String(assignedToId) : undefined }),
      NOT: EXTENSION_NOT,
    },
    include: {
      engagement: {
        include: {
          client: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });
  res.json(dueDates);
});

const updateSchema = z.object({
  completed: z.boolean().optional(),
  completedDate: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional(),
});

router.put("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const dueDate = await prisma.dueDate.update({
    where: { id: req.params.id },
    data: {
      completed: data.completed,
      completedDate:
        data.completed === true
          ? new Date(data.completedDate ?? Date.now())
          : data.completed === false
          ? null
          : undefined,
      notes: data.notes,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    },
  });

  res.json(dueDate);
});

export default router;
