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

// Time in status: how long returns sit in each stage. Walks each return's
// status history and measures every stint (one status change to the next), so
// you can see which stage is actually the bottleneck. The final stint is still
// running, so it counts up to now — unless the return is Completed, which is
// terminal and accrues no time.
router.get("/time-in-status", async (req, res) => {
  const taxYear = req.query.taxYear ? Number(req.query.taxYear) : undefined;

  const engagements = await prisma.engagement.findMany({
    where: {
      deletedAt: null,
      parentEngagementId: null,
      client: { is: { deletedAt: null } },
      ...(taxYear ? { taxYear } : {}),
    },
    select: {
      createdAt: true,
      status: true,
      statusChanges: { orderBy: { changedAt: "asc" }, select: { status: true, changedAt: true } },
    },
  });

  const now = Date.now();
  const map = new Map<
    string,
    { status: string; stints: number; totalDays: number; openNow: number; longestDays: number }
  >();

  const add = (status: string, days: number, stillOpen: boolean) => {
    const cur = map.get(status) ?? { status, stints: 0, totalDays: 0, openNow: 0, longestDays: 0 };
    cur.stints += 1;
    cur.totalDays += days;
    if (stillOpen) cur.openNow += 1;
    if (days > cur.longestDays) cur.longestDays = days;
    map.set(status, cur);
  };

  for (const e of engagements) {
    const chain = e.statusChanges;
    if (chain.length === 0) {
      // No history recorded: it has been sitting in its current status since creation.
      if (e.status !== "COMPLETED") add(e.status, (now - e.createdAt.getTime()) / 86400000, true);
      continue;
    }
    for (let i = 0; i < chain.length; i++) {
      const isLast = i === chain.length - 1;
      // Completed is the end of the line — don't accrue time against it.
      if (isLast && chain[i].status === "COMPLETED") continue;
      const start = chain[i].changedAt.getTime();
      const end = isLast ? now : chain[i + 1].changedAt.getTime();
      add(chain[i].status, Math.max(0, (end - start) / 86400000), isLast);
    }
  }

  const rows = [...map.values()]
    .map((r) => ({ ...r, avgDays: r.stints ? r.totalDays / r.stints : 0 }))
    .sort((a, b) => b.avgDays - a.avgDays);
  res.json(rows);
});

// Capacity: open returns per staff member, bucketed by when they're due, with
// an estimate of the hours still required. The estimate uses last year's actual
// hours for the same return (falling back to the manually-entered prior-year
// hours), less whatever has already been logged this year.
router.get("/capacity", async (req, res) => {
  const taxYear = req.query.taxYear ? Number(req.query.taxYear) : undefined;

  const engagements = await prisma.engagement.findMany({
    where: { deletedAt: null, parentEngagementId: null, client: { is: { deletedAt: null } } },
    select: {
      id: true,
      clientId: true,
      formType: true,
      jurisdiction: true,
      taxYear: true,
      status: true,
      extensionFiled: true,
      priorYearHours: true,
      assignedTo: { select: { id: true, name: true } },
      dueDates: { where: { completed: false }, orderBy: { dueDate: "asc" }, select: { dueDate: true, type: true } },
      timeEntries: { select: { hours: true } },
    },
  });

  const hoursOf = (e: { timeEntries: { hours: number }[] }) => e.timeEntries.reduce((s, t) => s + t.hours, 0);
  const key = (e: { clientId: string; formType: string; jurisdiction: string; taxYear: number }) =>
    `${e.clientId}|${e.formType}|${e.jurisdiction}|${e.taxYear}`;

  // Prior-year actual hours, keyed so we can look up "the same return, last year".
  const priorHours = new Map<string, number>();
  for (const e of engagements) priorHours.set(key(e), hoursOf(e));

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;

  const blank = () => ({
    overdue: 0,
    thisWeek: 0,
    nextWeek: 0,
    weeks2to4: 0,
    later: 0,
    noDate: 0,
    returns: 0,
    estHours: 0,
    loggedHours: 0,
    remainingHours: 0,
  });
  const map = new Map<string, { id: string; name: string } & ReturnType<typeof blank>>();

  for (const e of engagements) {
    if (e.status === "COMPLETED") continue;
    // Filter here rather than in the query: the prior-year lookup above needs
    // last year's returns to stay in the result set.
    if (taxYear && e.taxYear !== taxYear) continue;

    const id = e.assignedTo?.id ?? "unassigned";
    const cur = map.get(id) ?? { id, name: e.assignedTo?.name ?? "Unassigned", ...blank() };

    // Same extension rule the dashboard uses when picking the "next" due date.
    const relevant = e.dueDates.filter((dd) =>
      e.extensionFiled ? dd.type !== "ORIGINAL_FILING" : dd.type !== "EXTENDED_FILING"
    );
    const next = relevant[0];

    if (!next) cur.noDate += 1;
    else {
      const days = (new Date(next.dueDate).getTime() - startOfToday) / day;
      if (days < 0) cur.overdue += 1;
      else if (days <= 7) cur.thisWeek += 1;
      else if (days <= 14) cur.nextWeek += 1;
      else if (days <= 28) cur.weeks2to4 += 1;
      else cur.later += 1;
    }

    const logged = hoursOf(e);
    const est = priorHours.get(key({ ...e, taxYear: e.taxYear - 1 })) ?? e.priorYearHours ?? 0;
    cur.returns += 1;
    cur.estHours += est;
    cur.loggedHours += logged;
    cur.remainingHours += Math.max(0, est - logged);
    map.set(id, cur);
  }

  res.json([...map.values()].sort((a, b) => b.returns - a.returns));
});

// Client profitability: hours and standard value against what was actually
// billed, giving realization and the effective hourly rate per client.
router.get("/client-profitability", async (req, res) => {
  const period = range(req);

  const [entries, bills, checkboxBilled] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { date: period, client: { is: { deletedAt: null } } },
      select: { hours: true, rate: true, user: { select: { billableRate: true } }, client: { select: { id: true, name: true } } },
    }),
    prisma.bill.findMany({
      where: { billedDate: period, client: { is: { deletedAt: null } } },
      select: { amount: true, client: { select: { id: true, name: true } } },
    }),
    // Returns billed with the checkbox rather than through a Bill record.
    prisma.engagement.findMany({
      where: { billed: true, billId: null, billedDate: period, deletedAt: null, client: { is: { deletedAt: null } } },
      select: { billedAmount: true, client: { select: { id: true, name: true } } },
    }),
  ]);

  const map = new Map<string, { name: string; hours: number; stdValue: number; billed: number }>();
  const get = (id: string, name: string) => {
    const cur = map.get(id) ?? { name, hours: 0, stdValue: 0, billed: 0 };
    map.set(id, cur);
    return cur;
  };

  for (const t of entries) {
    const cur = get(t.client?.id ?? "?", t.client?.name ?? "Unknown");
    cur.hours += t.hours;
    cur.stdValue += val(t);
  }
  for (const b of bills) get(b.client.id, b.client.name).billed += b.amount;
  for (const e of checkboxBilled) get(e.client.id, e.client.name).billed += e.billedAmount ?? 0;

  const rows = [...map.values()]
    .map((r) => ({
      ...r,
      writeOff: r.stdValue - r.billed,
      realization: r.stdValue > 0 ? r.billed / r.stdValue : null,
      effectiveRate: r.hours > 0 ? r.billed / r.hours : null,
    }))
    .sort((a, b) => b.billed - a.billed);
  res.json(rows);
});

export default router;
