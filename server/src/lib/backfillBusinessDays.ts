import { prisma } from "./prisma";
import { isBusinessDay, nextBusinessDay } from "./businessDays";

/**
 * Deadlines generated before the weekend/holiday rule (IRC §7503) was applied
 * were stored on their nominal date — e.g. a 1065 due Sunday March 15 rather
 * than Monday the 16th. This moves every still-open one forward to the next
 * business day.
 *
 * Completed deadlines are left as they were (they're history), and "Other /
 * Special Project" returns are skipped because their date is whatever was
 * typed in, not a tax deadline.
 *
 * Idempotent: a date it has moved is a business day, so it never matches again.
 */
export async function backfillBusinessDays(): Promise<number> {
  const rows = await prisma.dueDate.findMany({
    where: { completed: false, engagement: { is: { formType: { not: "OTHER" } } } },
    select: { id: true, dueDate: true },
  });

  const moves = rows.filter((r) => !isBusinessDay(r.dueDate));
  for (const r of moves) {
    await prisma.dueDate.update({ where: { id: r.id }, data: { dueDate: nextBusinessDay(r.dueDate) } });
  }

  if (moves.length > 0) {
    console.log(
      `[due-dates] moved ${moves.length} deadline${moves.length === 1 ? "" : "s"} off a weekend/holiday to the next business day`
    );
  }
  return moves.length;
}
