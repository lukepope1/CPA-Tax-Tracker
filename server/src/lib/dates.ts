/**
 * Due dates — both the filing deadlines generated in lib/dueDates.ts and the
 * dates typed into tasks — are stored as UTC midnight of a calendar day, and
 * displayed with timeZone "UTC". They mean a *day*, not an instant.
 *
 * So "overdue" has to be decided by comparing days: something due today is due,
 * not late, and only becomes late once the day is over. Comparing against
 * `new Date()` made everything due today read as past due from midnight onward.
 *
 * Which day it currently is depends on where the firm is, not on where the
 * server happens to run — Render runs in UTC, which rolls over in the early
 * evening Central time. FIRM_TIMEZONE sets it; the default suits this firm.
 */
const FIRM_TIMEZONE = process.env.FIRM_TIMEZONE || "America/Chicago";

/** UTC midnight of today's date in the firm's timezone. */
export function startOfToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: FIRM_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

/** UTC midnight `days` after today in the firm's timezone. */
export function daysFromToday(days: number): Date {
  const d = startOfToday();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
