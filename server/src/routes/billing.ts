import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, requireAdmin } from "../lib/auth";

const router = Router();
router.use(requireAuth, requireAdmin);

const valueOf = (entries: { hours: number; rate: number | null; user: { billableRate: number | null } | null }[]) =>
  entries.reduce((s, t) => s + t.hours * (t.rate ?? t.user?.billableRate ?? 0), 0);

// Distributes `amount` across returns proportionally to each return's WIP value,
// with the rounding remainder on the last one so the total matches to the penny.
function distribute(items: { id: string; wip: number }[], amount: number): Map<string, number> {
  const totalWip = items.reduce((s, w) => s + w.wip, 0);
  const out = new Map<string, number>();
  let allocated = 0;
  items.forEach((w, i) => {
    let amt: number;
    if (i === items.length - 1) {
      amt = Math.round((amount - allocated) * 100) / 100;
    } else {
      const share = totalWip > 0 ? amount * (w.wip / totalWip) : amount / items.length;
      amt = Math.round(share * 100) / 100;
      allocated += amt;
    }
    out.set(w.id, amt);
  });
  return out;
}

// Bill a client's outstanding WIP. Creates a Bill record, links the client's
// unbilled returns to it, and distributes the entered amount across them.
router.post("/bill", async (req, res) => {
  const clientId = String(req.body.clientId ?? "");
  const amount = Number(req.body.amount);
  const note = req.body.note ? String(req.body.note) : null;
  if (!clientId || Number.isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: "clientId and a valid amount are required" });
  }

  const engagements = await prisma.engagement.findMany({
    where: { clientId, billed: false, deletedAt: null, client: { is: { deletedAt: null } } },
    select: {
      id: true,
      // Weight the split by billable, still-unbilled time only.
      timeEntries: {
        where: { billId: null, billable: true },
        select: { hours: true, rate: true, user: { select: { billableRate: true } } },
      },
    },
  });
  if (engagements.length === 0) {
    return res.status(400).json({ error: "No unbilled returns for this client" });
  }

  const bill = await prisma.bill.create({ data: { clientId, amount, note } });
  const alloc = distribute(engagements.map((e) => ({ id: e.id, wip: valueOf(e.timeEntries) })), amount);

  await prisma.$transaction([
    ...engagements.map((e) =>
      prisma.engagement.update({
        where: { id: e.id },
        data: { billed: true, billedDate: bill.billedDate, billedAmount: alloc.get(e.id) ?? 0, billId: bill.id },
      })
    ),
    // Attach the time this bill actually covers. Without it, a return's whole
    // history counts as billed forever and any time logged afterwards is
    // swallowed by this bill instead of showing up as new outstanding WIP.
    prisma.timeEntry.updateMany({
      where: { engagementId: { in: engagements.map((e) => e.id) }, billId: null, billable: true },
      data: { billId: bill.id },
    }),
  ]);

  res.json({ billId: bill.id, billedReturns: engagements.length, amount });
});

// Bill a single return, or the client's General (no-return) time, on its own.
router.post("/bill-engagement", async (req, res) => {
  const clientId = String(req.body.clientId ?? "");
  const engagementId = req.body.engagementId ? String(req.body.engagementId) : null;
  const amount = Number(req.body.amount);
  const note = req.body.note ? String(req.body.note) : null;
  if (!clientId || Number.isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: "clientId and a valid amount are required" });
  }

  const bill = await prisma.bill.create({ data: { clientId, amount, note } });

  if (engagementId) {
    await prisma.$transaction([
      prisma.engagement.update({
        where: { id: engagementId },
        data: { billed: true, billedAmount: amount, billedDate: bill.billedDate, billId: bill.id },
      }),
      // Only the time outstanding right now belongs to this bill — see /bill.
      prisma.timeEntry.updateMany({
        where: { engagementId, billId: null, billable: true },
        data: { billId: bill.id },
      }),
    ]);
  } else {
    // General bucket — mark the client's unbilled no-return time to this bill.
    await prisma.timeEntry.updateMany({
      where: { clientId, engagementId: null, billId: null, billable: true },
      data: { billId: bill.id },
    });
  }

  res.json({ billId: bill.id, amount });
});

// Billing history: every recorded bill, newest first, with the billed hours and
// standard value behind each bill so per-bill realization can be shown.
router.get("/history", async (_req, res) => {
  const bills = await prisma.bill.findMany({
    include: {
      client: { select: { name: true, parent: { select: { id: true, name: true } } } },
      engagements: {
        select: { timeEntries: { select: { hours: true, rate: true, user: { select: { billableRate: true } } } } },
      },
      timeEntries: { select: { engagementId: true, hours: true, rate: true, user: { select: { billableRate: true } } } },
    },
    orderBy: { billedDate: "desc" },
  });

  res.json(
    bills.map((b) => {
      // The time entries actually attached to this bill. Reading them off the
      // billed returns instead would pull in work logged after the bill and
      // quietly restate its hours and realization.
      const all = b.timeEntries;
      const hours = all.reduce((s, t) => s + t.hours, 0);
      const stdValue = valueOf(all);
      return {
        id: b.id,
        clientId: b.clientId,
        clientName: b.client.name,
        parentId: b.client.parent?.id ?? b.clientId,
        parentName: b.client.parent?.name ?? b.client.name,
        isChild: b.client.parent != null,
        amount: b.amount,
        billedDate: b.billedDate,
        note: b.note ?? "",
        // Counted from the bill's own time entries. Engagement.billId only ever
        // points at the most recent bill, so billing a return a second time
        // would otherwise drop the earlier bill's count to zero.
        returns:
          new Set(all.map((t) => t.engagementId).filter(Boolean)).size || b.engagements.length,
        hours,
        stdValue,
        realization: stdValue > 0 ? b.amount / stdValue : null,
      };
    })
  );
});

// Detailed bill history for one client — each bill with the returns it covered
// and the underlying time entries, for drill-down.
router.get("/client/:clientId/bills", async (req, res) => {
  const bills = await prisma.bill.findMany({
    where: { clientId: req.params.clientId },
    orderBy: { billedDate: "desc" },
    include: {
      engagements: {
        select: {
          id: true,
          formType: true,
          jurisdiction: true,
          description: true,
          taxYear: true,
          billedAmount: true,
        },
      },
      // Every time entry on this bill — return time and general time alike.
      // Scoped by billId so work logged after the bill isn't folded into it.
      timeEntries: {
        orderBy: { date: "asc" },
        select: {
          engagementId: true,
          date: true,
          hours: true,
          description: true,
          rate: true,
          user: { select: { name: true, billableRate: true } },
        },
      },
    },
  });

  res.json(
    bills.map((b) => {
      const mapT = (t: { date: Date; hours: number; description: string; rate: number | null; user: { name: string; billableRate: number | null } | null }) => ({
        date: t.date,
        staff: t.user?.name ?? "",
        hours: t.hours,
        description: t.description,
        value: t.hours * (t.rate ?? t.user?.billableRate ?? 0),
      });
      const timeEntries = b.timeEntries.map(mapT);
      const totalHours = timeEntries.reduce((s, t) => s + t.hours, 0);
      const returns = b.engagements.map((e) => ({
        formType: e.formType,
        jurisdiction: e.jurisdiction,
        description: e.description,
        taxYear: e.taxYear,
        billedAmount: e.billedAmount ?? 0,
        hours: b.timeEntries.filter((t) => t.engagementId === e.id).reduce((s, t) => s + t.hours, 0),
      }));
      return {
        id: b.id,
        amount: b.amount,
        billedDate: b.billedDate,
        note: b.note ?? "",
        totalHours,
        returns,
        timeEntries,
      };
    })
  );
});

// Edit a past bill: change the amount (redistributed across its returns), date,
// or note.
router.put("/bill/:id", async (req, res) => {
  const bill = await prisma.bill.findUnique({
    where: { id: req.params.id },
    include: {
      engagements: { select: { id: true } },
      // Weight the split by the time this bill covers, not by everything ever
      // logged on its returns.
      timeEntries: { select: { engagementId: true, hours: true, rate: true, user: { select: { billableRate: true } } } },
    },
  });
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const amount = req.body.amount !== undefined ? Number(req.body.amount) : undefined;
  const note = req.body.note !== undefined ? String(req.body.note) || null : undefined;
  const billedDate = req.body.billedDate ? new Date(String(req.body.billedDate)) : undefined;

  const updated = await prisma.bill.update({
    where: { id: bill.id },
    data: {
      amount: amount !== undefined && !Number.isNaN(amount) ? amount : undefined,
      note,
      billedDate,
    },
  });

  // Redistribute the (possibly new) amount + date across the bill's returns.
  const alloc = distribute(
    bill.engagements.map((e) => ({
      id: e.id,
      wip: valueOf(bill.timeEntries.filter((t) => t.engagementId === e.id)),
    })),
    updated.amount
  );
  await prisma.$transaction(
    bill.engagements.map((e) =>
      prisma.engagement.update({
        where: { id: e.id },
        data: { billedAmount: alloc.get(e.id) ?? 0, billedDate: updated.billedDate },
      })
    )
  );

  res.json({ id: updated.id, amount: updated.amount });
});

// Reverse a bill: un-bill its returns (back to WIP) and delete the bill.
router.delete("/bill/:id", async (req, res) => {
  await prisma.engagement.updateMany({
    where: { billId: req.params.id },
    data: { billed: false, billedAmount: null, billedDate: null, billId: null },
  });
  await prisma.timeEntry.updateMany({
    where: { billId: req.params.id },
    data: { billId: null },
  });
  await prisma.bill.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

// Outstanding WIP for a single client, broken down by employee. Counts time on
// the client's unbilled returns plus any general (no-return) time.
router.get("/wip/:clientId/by-user", async (req, res) => {
  const clientId = req.params.clientId;

  const engagements = await prisma.engagement.findMany({
    where: { clientId, deletedAt: null },
    select: { id: true },
  });
  const engIds = engagements.map((e) => e.id);

  // Unbilled time on any of the client's returns, plus unbilled general time.
  const entries = await prisma.timeEntry.findMany({
    where: {
      clientId,
      billId: null,
      billable: true,
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

// Outstanding WIP for a single client, broken down by return (engagement), with
// General/no-return time as its own group and each group's time entries (incl.
// descriptions) for billing. Each group is typically a separate bill.
router.get("/wip/:clientId/by-engagement", async (req, res) => {
  const clientId = req.params.clientId;

  const engagements = await prisma.engagement.findMany({
    where: { clientId, deletedAt: null },
    select: {
      id: true,
      formType: true,
      taxYear: true,
      jurisdiction: true,
      description: true,
      timeEntries: {
        where: { billId: null, billable: true },
        orderBy: { date: "asc" },
        select: { date: true, hours: true, description: true, rate: true, user: { select: { name: true, billableRate: true } } },
      },
    },
  });

  const general = await prisma.timeEntry.findMany({
    where: { clientId, engagementId: null, billId: null, billable: true },
    orderBy: { date: "asc" },
    select: { date: true, hours: true, description: true, rate: true, user: { select: { name: true, billableRate: true } } },
  });

  const mapEntries = (entries: typeof general) =>
    entries.map((t) => ({
      date: t.date,
      staff: t.user?.name ?? "",
      hours: t.hours,
      value: t.hours * (t.rate ?? t.user?.billableRate ?? 0),
      description: t.description,
    }));

  const groups = engagements
    .filter((e) => e.timeEntries.length > 0)
    .map((e) => {
      const entries = mapEntries(e.timeEntries);
      return {
        engagementId: e.id,
        general: false,
        formType: e.formType,
        taxYear: e.taxYear,
        jurisdiction: e.jurisdiction,
        description: e.description,
        hours: entries.reduce((s, x) => s + x.hours, 0),
        value: entries.reduce((s, x) => s + x.value, 0),
        entries,
      };
    });

  if (general.length > 0) {
    const entries = mapEntries(general);
    groups.push({
      engagementId: null as any,
      general: true,
      formType: "" as any,
      taxYear: 0 as any,
      jurisdiction: null as any,
      description: null as any,
      hours: entries.reduce((s, x) => s + x.hours, 0),
      value: entries.reduce((s, x) => s + x.value, 0),
      entries,
    });
  }

  groups.sort((a, b) => b.value - a.value);
  res.json(groups);
});

// Firm-wide dashboard summary, optionally scoped to a single tax year.
// Returns aggregate counts (total returns, by return type, by status) along
// with total WIP, total billed, and overall realization.
router.get("/firm", async (req, res) => {
  const taxYear = req.query.taxYear ? Number(req.query.taxYear) : undefined;

  const engagements = await prisma.engagement.findMany({
    where: {
      deletedAt: null,
      client: { is: { deletedAt: null } },
      ...(taxYear ? { taxYear } : {}),
    },
    select: {
      formType: true,
      parentEngagementId: true,
      status: true,
      billed: true,
      billedAmount: true,
      timeEntries: {
        where: { billable: true },
        select: { billId: true, hours: true, rate: true, user: { select: { billableRate: true } } },
      },
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

    // Split by whether the time is on a bill, not by the return's flag — a
    // billed return can still carry new unbilled work.
    wipValue += valueOf(eng.timeEntries.filter((t) => !t.billId));
    billedStandardValue += valueOf(eng.timeEntries.filter((t) => t.billId));
    if (eng.billed) billedTotal += eng.billedAmount ?? 0;
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
      // Parent group, for rolling related clients up on the Billing page.
      parent: { select: { id: true, name: true } },
      engagements: {
        where: { deletedAt: null },
        select: {
          id: true,
          formType: true,
          taxYear: true,
          billed: true,
          billedAmount: true,
          billId: true,
          projectedFee: true,
          // Only time that isn't on a bill yet is outstanding. Keying off the
          // return's `billed` flag instead would hide time logged after it was
          // billed, which is real work still owed.
          timeEntries: {
            where: { billId: null, billable: true },
            select: { hours: true, rate: true, user: { select: { billableRate: true } } },
          },
        },
      },
      // General time not tied to a return (and not yet billed) is outstanding WIP.
      timeEntries: {
        where: { engagementId: null, billId: null, billable: true },
        select: { hours: true, rate: true, user: { select: { billableRate: true } } },
      },
      bills: { select: { amount: true } },
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
      let openEngagements = 0;

      // Total ever billed: recorded bills, plus returns marked billed via the
      // checkbox on the client page (which don't create a bill record).
      let billedTotal = c.bills.reduce((s, b) => s + b.amount, 0);

      for (const eng of c.engagements) {
        // eng.timeEntries is already filtered to unbilled time, so a return
        // that was billed earlier still contributes any work done since.
        wipValue += value(eng.timeEntries);
        const engHours = hoursOf(eng.timeEntries);
        wipHours += engHours;
        if (engHours > 0 || (!eng.billed && (eng.projectedFee ?? 0) > 0)) openEngagements++;
        // Returns marked billed by the checkbox on the client page never create
        // a bill record, so their amount is counted here instead.
        if (eng.billed && !eng.billId) {
          billedTotal += eng.billedAmount ?? 0;
        }
      }

      return {
        clientId: c.id,
        clientName: c.name,
        clientType: c.clientType,
        // A client with no parent is its own group, so every row belongs to
        // exactly one group and nothing falls through the filter.
        parentId: c.parent?.id ?? c.id,
        parentName: c.parent?.name ?? c.name,
        isChild: c.parent != null,
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
