import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();
router.use(requireAuth, requireAdmin);

// Bill a client's outstanding WIP. Marks all of the client's unbilled returns
// as billed and distributes the entered amount across them in proportion to each
// return's WIP value, so per-return realization stays meaningful.
router.post("/bill", async (req, res) => {
  const clientId = String(req.body.clientId ?? "");
  const amount = Number(req.body.amount);
  if (!clientId || Number.isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: "clientId and a valid amount are required" });
  }

  const engagements = await prisma.engagement.findMany({
    where: { clientId, billed: false, client: { is: { deletedAt: null } } },
    select: {
      id: true,
      timeEntries: { select: { hours: true, rate: true, user: { select: { billableRate: true } } } },
    },
  });
  if (engagements.length === 0) {
    return res.status(400).json({ error: "No unbilled returns for this client" });
  }

  const valueOf = (entries: { hours: number; rate: number | null; user: { billableRate: number | null } | null }[]) =>
    entries.reduce((s, t) => s + t.hours * (t.rate ?? t.user?.billableRate ?? 0), 0);

  const wips = engagements.map((e) => ({ id: e.id, wip: valueOf(e.timeEntries) }));
  const totalWip = wips.reduce((s, w) => s + w.wip, 0);
  const now = new Date();

  let allocated = 0;
  const updates = wips.map((w, i) => {
    let amt: number;
    if (i === wips.length - 1) {
      amt = Math.round((amount - allocated) * 100) / 100; // remainder avoids rounding drift
    } else {
      const share = totalWip > 0 ? amount * (w.wip / totalWip) : amount / wips.length;
      amt = Math.round(share * 100) / 100;
      allocated += amt;
    }
    return prisma.engagement.update({
      where: { id: w.id },
      data: { billed: true, billedDate: now, billedAmount: amt },
    });
  });

  await prisma.$transaction(updates);
  res.json({ billedReturns: engagements.length, amount });
});

// Outstanding WIP for a single client, broken down by employee. Counts time on
// the client's unbilled returns plus any general (no-return) time.
router.get("/wip/:clientId/by-user", async (req, res) => {
  const clientId = req.params.clientId;

  const unbilled = await prisma.engagement.findMany({
    where: { clientId, billed: false },
    select: { id: true },
  });
  const engIds = unbilled.map((e) => e.id);

  const entries = await prisma.timeEntry.findMany({
    where: {
      clientId,
      OR: [{ engagementId: { in: engIds } }, { engagementId: null }],
    },
    select: { hours: true, rate: true, user: { select: { id: true, name: true, billableRate: true } } },
  });

  const map = new Map<string, { userId: string; userName: string; hours: number; value: number }>();
  for (const t of entries) {
    const userId = t.user?.id ?? "unknown";
    const userName = t.user?.name ?? "Unknown";
    const value = t.hours * (t.rate ?? t.user?.billableRate ?? 0);
    const cur = map.get(userId) ?? { userId, userName, hours: 0, value: 0 };
    cur.hours += t.hours;
    cur.value += value;
    map.set(userId, cur);
  }

  const rows = [...map.values()].filter((r) => r.hours > 0).sort((a, b) => b.value - a.value);
  res.json(rows);
});

// Firm-wide dashboard summary, optionally scoped to a single tax year.
// Returns aggregate counts (total returns, by return type, by status) along
// with total WIP, total billed, and overall realization.
router.get("/firm", async (req, res) => {
  const taxYear = req.query.taxYear ? Number(req.query.taxYear) : undefined;

  const engagements = await prisma.engagement.findMany({
    where: {
      client: { is: { deletedAt: null } },
      ...(taxYear ? { taxYear } : {}),
    },
    select: {
      formType: true,
      parentEngagementId: true,
      status: true,
      billed: true,
      billedAmount: true,
      timeEntries: { select: { hours: true, rate: true, user: { select: { billableRate: true } } } },
    },
  });

  const valueOf = (entries: { hours: number; rate: number | null; user: { billableRate: number | null } | null }[]) =>
    entries.reduce((s, t) => s + t.hours * (t.rate ?? t.user?.billableRate ?? 0), 0);

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let totalReturns = 0;
  let wipValue = 0;
  let billedTotal = 0;
  let billedStandardValue = 0; // standard value of time on billed returns, for realization

  for (const eng of engagements) {
    // Return counts reflect top-level returns only (a federal 1040 with its
    // state/city sub-returns is one return). Dollar figures include everything.
    const isTopLevel = !eng.parentEngagementId;
    if (isTopLevel) {
      totalReturns++;
      byType[eng.formType] = (byType[eng.formType] ?? 0) + 1;
      byStatus[eng.status] = (byStatus[eng.status] ?? 0) + 1;
    }

    const stdValue = valueOf(eng.timeEntries);
    if (eng.billed) {
      billedTotal += eng.billedAmount ?? 0;
      billedStandardValue += stdValue;
    } else {
      wipValue += stdValue;
    }
  }

  const realization = billedStandardValue > 0 ? billedTotal / billedStandardValue : null;

  res.json({
    totalReturns,
    byType,
    byStatus,
    wipValue,
    billedTotal,
    realization,
  });
});

// Outstanding WIP (work in progress) by client.
//
// WIP = standard value of logged time that has not yet been billed. Time logged
// to an engagement that is marked "billed" is considered cleared; everything
// else (open engagements + general/no-engagement time) counts as outstanding WIP.
router.get("/wip", async (_req, res) => {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      clientType: true,
      engagements: {
        select: {
          id: true,
          formType: true,
          taxYear: true,
          billed: true,
          billedAmount: true,
          projectedFee: true,
          timeEntries: { select: { hours: true, rate: true, user: { select: { billableRate: true } } } },
        },
      },
      // General time not tied to a return is always outstanding WIP.
      timeEntries: {
        where: { engagementId: null },
        select: { hours: true, rate: true, user: { select: { billableRate: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  const value = (entries: { hours: number; rate: number | null; user: { billableRate: number | null } | null }[]) =>
    entries.reduce((s, t) => s + t.hours * (t.rate ?? t.user?.billableRate ?? 0), 0);
  const hoursOf = (entries: { hours: number }[]) => entries.reduce((s, t) => s + t.hours, 0);

  const rows = clients
    .map((c) => {
      const generalValue = value(c.timeEntries);
      const generalHours = hoursOf(c.timeEntries);

      let wipValue = generalValue;
      let wipHours = generalHours;
      let billedTotal = 0;
      let openEngagements = 0;

      for (const eng of c.engagements) {
        const engValue = value(eng.timeEntries);
        const engHours = hoursOf(eng.timeEntries);
        if (eng.billed) {
          billedTotal += eng.billedAmount ?? 0;
        } else {
          wipValue += engValue;
          wipHours += engHours;
          if (engHours > 0 || (eng.projectedFee ?? 0) > 0) openEngagements++;
        }
      }

      return {
        clientId: c.id,
        clientName: c.name,
        clientType: c.clientType,
        wipHours,
        wipValue,
        billedTotal,
        openEngagements,
      };
    })
    .filter((r) => r.wipValue > 0 || r.wipHours > 0)
    .sort((a, b) => b.wipValue - a.wipValue);

  const totals = rows.reduce(
    (acc, r) => ({
      wipHours: acc.wipHours + r.wipHours,
      wipValue: acc.wipValue + r.wipValue,
      billedTotal: acc.billedTotal + r.billedTotal,
    }),
    { wipHours: 0, wipValue: 0, billedTotal: 0 }
  );

  res.json({ rows, totals });
});

export default router;
