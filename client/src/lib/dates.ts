/**
 * Due dates mean a calendar *day*, not an instant: they're stored as UTC
 * midnight and shown with timeZone "UTC" throughout. So something due today is
 * due, not late — it only turns red once the day is over. Comparing a due date
 * against `new Date()` marked everything due today as past due from midnight.
 */

/** UTC midnight of the viewer's current date, the cut-off for "late". */
export function startOfToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

/** True when a due date has already passed — yesterday or earlier. */
export function isOverdue(dueDate?: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < startOfToday();
}

/** Whole days a due date is past — 1 the day after it was due. */
export function daysPastDue(dueDate: string): number {
  const diff = startOfToday().getTime() - new Date(dueDate).getTime();
  return Math.max(0, Math.round(diff / 86400000));
}
