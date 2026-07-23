import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../lib/auth";

const router = Router();
router.use(requireAuth);

router.get("/summary", async (req, res) => {
  const raw = req.query.userId ? String(req.query.userId) : undefined;
  const unassigned = raw === "unassigned";
  const userId = unassigned ? undefined : raw;

  const now = new Date();
  const in7 = new Date(now);
  in7.setDate(in7.getDate() + 7);
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Keep counts consistent with the Due Dates page: ignore due dates for
  // trashed clients, and ignore the original deadline once an extension is filed
  // (and the extended deadline until one is). When a userId is given, scope to
  // the returns assigned to that person.
  const engagementIs: Record<string, unknown> = { client: { is: { deletedAt: null } }, deletedAt: null };
  if (unassigned) engagementIs.assignedToId = null;
  else if (userId) engagementIs.assignedToId = userId;
  const activeFilters = {
    engagement: { is: engagementIs },
    NOT: [
      { type: "ORIGINAL_FILING", engagement: { is: { extensionFiled: true } } },
      { type: "EXTENDED_FILING", engagement: { is: { extensionFiled: false } } },
    ],
  };

  // Status breakdown must match the Inbox above it: active top-level returns only
  // (exclude Completed, soft-deleted returns, trashed clients, and state/city
  // sub-returns so a federal return with children isn't counted twice).
  const engagementWhere: Record<string, unknown> = {
    deletedAt: null,
    client: { is: { deletedAt: null } },
    parentEngagementId: null,
    status: { not: "COMPLETED" },
  };
  if (unassigned) engagementWhere.assignedToId = null;
  else if (userId) engagementWhere.assignedToId = userId;
  const hoursWhere: Record<string, unknown> = { date: { gte: weekAgo, lte: now } };
  if (unassigned) hoursWhere.id = "__none__"; // no personal hours for the pool
  else if (userId) hoursWhere.userId = userId;

  const [overdueCount, dueThisWeek, dueThisMonth, engagementsByStatus, hoursThisWeek] = await Promise.all([
    prisma.dueDate.count({ where: { completed: false, dueDate: { lt: now }, ...activeFilters } }),
    prisma.dueDate.count({ where: { completed: false, dueDate: { gte: now, lte: in7 }, ...activeFilters } }),
    prisma.dueDate.count({ where: { completed: false, dueDate: { gte: now, lte: in30 }, ...activeFilters } }),
    prisma.engagement.groupBy({ by: ["status"], where: engagementWhere, _count: { _all: true } }),
    prisma.timeEntry.aggregate({ where: hoursWhere, _sum: { hours: true } }),
  ]);

  res.json({
    overdueCount,
    dueThisWeek,
    dueThisMonth,
    engagementsByStatus: engagementsByStatus.map((s) => ({ status: s.status, count: s._count._all })),
    hoursThisWeek: hoursThisWeek._sum.hours ?? 0,
  });
});

// A user's "inbox": the returns currently assigned to them that aren't finished
// yet (anything not FILED). Defaults to the logged-in user; pass ?userId= to
// view another person's inbox. Each return includes its next outstanding due
// date so it can be sorted/displayed by urgency.
router.get("/inbox", async (req, res) => {
  const raw = req.query.userId ? String(req.query.userId) : req.user!.userId;
  const unassigned = raw === "unassigned";

  const engagements = await prisma.engagement.findMany({
    where: {
      assignedToId: unassigned ? null : raw,
      status: { not: "COMPLETED" },
      deletedAt: null,
      client: { is: { deletedAt: null } },
      parentEngagementId: null, // top-level returns only (state/city roll up)
    },
    include: {
      client: { select: { id: true, name: true } },
      dueDates: {
        where: { completed: false },
        orderBy: { dueDate: "asc" },
      },
      statusChanges: { orderBy: { changedAt: "desc" }, take: 1 },
    },
  });

  const rows = engagements.map((eng) => {
    // Respect the extension rule when choosing the "next" due date to show.
    const relevant = eng.dueDates.filter((dd) =>
      eng.extensionFiled ? dd.type !== "ORIGINAL_FILING" : dd.type !== "EXTENDED_FILING"
    );
    const next = relevant[0] ?? null;
    return {
      id: eng.id,
      clientId: eng.client.id,
      clientName: eng.client.name,
      formType: eng.formType,
      jurisdiction: eng.jurisdiction,
      taxYear: eng.taxYear,
      status: eng.status,
      extensionFiled: eng.extensionFiled,
      nextDueDate: next ? next.dueDate : null,
      nextDueType: next ? next.type : null,
      statusSince: eng.statusChanges[0]?.changedAt ?? null,
      priority: eng.priority,
      assignedToId: eng.assignedToId,
    };
  });

  // Manual priority first (lower = more important); un-prioritized items follow,
  // soonest due first.
  rows.sort((a, b) => {
    if (a.priority != null && b.priority != null) return a.priority - b.priority;
    if (a.priority != null) return -1;
    if (b.priority != null) return 1;
    if (!a.nextDueDate) return 1;
    if (!b.nextDueDate) return -1;
    return new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime();
  });

  res.json(rows);
});

export default router;
