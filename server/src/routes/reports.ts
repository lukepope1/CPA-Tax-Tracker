import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();
router.use(requireAuth, requireAdmin);

const val = (t: { hours: number; rate: number | null; user?: { billableRate: number | null } | null }) =>
  t.hours * (t.rate ?? t.user?.billableRate ?? 0);

function range(req: { query: Record<string, unknown> }) {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(`${String(req.query.to)}T23:59:59Z`) : undefined;
  return from || to ? { gte: from, lte: to } : undefined;
}

// Hours & value by staff member for a date range.
router.get("/staff-hours", async (req, res) => {
  const entries = await prisma.timeEntry.findMany({
    where: { date: range(req) },
    select: { hours: true, rate: true, billable: true, user: { select: { id: true, name: true, billableRate: true } } },
  });

  const map = new Map<string, { name: string; hours: number; billableHours: number; value: number }>();
  for (const t of entries) {
    const id = t.user?.id ?? "?";
    const cur = map.get(id) ?? { name: t.user?.name ?? "Unknown", hours: 0, billableHours: 0, value: 0 };
    cur.hours += t.hours;
    if (t.billable) cur.billableHours += t.hours;
    cur.value += val(t);
    map.set(id, cur);
  }
  res.json([...map.values()].sort((a, b) => b.hours - a.hours));
});

// Hours & value by client for a date range.
router.get("/client-hours", async (req, res) => {
  const entries = await prisma.timeEntry.findMany({
    where: { date: range(req), client: { is: { deletedAt: null } } },
    select: { hours: true, rate: true, user: { select: { billableRate: true } }, client: { select: { id: true, name: true } } },
  });

  const map = new Map<string, { name: string; hours: number; value: number }>();
  for (const t of entries) {
    const id = t.client?.id ?? "?";
    const cur = map.get(id) ?? { name: t.client?.name ?? "Unknown", hours: 0, value: 0 };
    cur.hours += t.hours;
    cur.value += val(t);
    map.set(id, cur);
  }
  res.json([...map.values()].sort((a, b) => b.value - a.value));
});

// WIP aging: unbilled time bucketed by how long it has been sitting, per client.
router.get("/wip-aging", async (_req, res) => {
  const entries = await prisma.timeEntry.findMany({
    where: {
      client: { is: { deletedAt: null } },
      OR: [
        { engagement: { is: { billed: false, deletedAt: null } } },
        { engagementId: null, billId: null },
      ],
    },
    select: {
      date: true,
      hours: true,
      rate: true,
      user: { select: { billableRate: true } },
      client: { select: { id: true, name: true } },
    },
  });

  const now = Date.now();
  const map = new Map<string, { name: string; d0_30: number; d31_60: number; d61_90: number; d90plus: number; total: number }>();
  for (const t of entries) {
    const id = t.client?.id ?? "?";
    const cur = map.get(id) ?? { name: t.client?.name ?? "Unknown", d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
    const v = val(t);
    const days = (now - new Date(t.date).getTime()) / 86400000;
    if (days <= 30) cur.d0_30 += v;
    else if (days <= 60) cur.d31_60 += v;
    else if (days <= 90) cur.d61_90 += v;
    else cur.d90plus += v;
    cur.total += v;
    map.set(id, cur);
  }
  res.json([...map.values()].filter((r) => r.total > 0.005).sort((a, b) => b.total - a.total));
});

// Turnaround: completed top-level returns with days from first "in motion"
// status (Information Received, else creation) to Completed.
router.get("/turnaround", async (req, res) => {
  const taxYear = req.query.taxYear ? Number(req.query.taxYear) : undefined;
  const engagements = await prisma.engagement.findMany({
    where: {
      status: "COMPLETED",
      deletedAt: null,
      parentEngagementId: null,
      client: { is: { deletedAt: null } },
      ...(taxYear ? { taxYear } : {}),
    },
    include: {
      client: { select: { name: true } },
      assignedTo: { select: { name: true } },
      statusChanges: { orderBy: { changedAt: "asc" } },
    },
  });

  const rows = engagements.map((e) => {
    const received = e.statusChanges.find((s) => s.status === "INFORMATION_RECEIVED")?.changedAt ?? e.createdAt;
    const completed = [...e.statusChanges].reverse().find((s) => s.status === "COMPLETED")?.changedAt ?? e.updatedAt;
    const days = Math.max(0, Math.round((new Date(completed).getTime() - new Date(received).getTime()) / 86400000));
    return {
      client: e.client.name,
      formType: e.formType,
      jurisdiction: e.jurisdiction,
      taxYear: e.taxYear,
      assignedTo: e.assignedTo?.name ?? "",
      received,
      completed,
      days,
    };
  });

  rows.sort((a, b) => b.days - a.days);
  const avgDays = rows.length ? rows.reduce((s, r) => s + r.days, 0) / rows.length : null;
  res.json({ rows, avgDays });
});

export default router;
