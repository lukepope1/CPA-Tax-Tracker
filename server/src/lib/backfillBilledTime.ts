import { prisma } from "./prisma";

/**
 * Billing used to mark a return as billed without attaching its time entries to
 * the bill. WIP then keyed off the return's `billed` flag, so time logged after
 * a bill vanished from Outstanding and was silently folded into that old bill's
 * hours and realization.
 *
 * The code now treats a time entry as billed only when it carries a `billId`.
 * This links up the history written before that change: for every return that
 * belongs to a bill, any of its time entries that existed when the bill was
 * raised are attached to it. Entries created afterwards are deliberately left
 * unattached — that is the work that should have been showing as outstanding
 * all along, and it now will.
 *
 * Idempotent: it only ever fills in a null `billId`, so once a row is linked it
 * is never touched again and later runs match nothing.
 */
export async function backfillBilledTime(): Promise<number> {
  const billedEngagements = await prisma.engagement.findMany({
    where: { billId: { not: null } },
    select: { id: true, billId: true, bill: { select: { createdAt: true } } },
  });
  if (billedEngagements.length === 0) return 0;

  let linked = 0;
  for (const eng of billedEngagements) {
    if (!eng.billId || !eng.bill) continue;
    const { count } = await prisma.timeEntry.updateMany({
      where: {
        engagementId: eng.id,
        billId: null,
        // "Existed when the bill was raised." createdAt is when the entry was
        // keyed in, which is what decides whether it could have been on the
        // bill — the work date it records may be much earlier.
        createdAt: { lte: eng.bill.createdAt },
      },
      data: { billId: eng.billId },
    });
    linked += count;
  }

  if (linked > 0) {
    console.log(`[billing] linked ${linked} pre-existing time entr${linked === 1 ? "y" : "ies"} to their bills`);
  }
  return linked;
}
