/**
 * Non-chargeable work categories. Time logged under one of these is firm time:
 * it never reaches WIP, a bill, or realization, but it does count on the time
 * reports, so a staff member's day still adds up to their full hours.
 *
 * A client is optional on these — "Billing" and "Engagement Letters" are
 * usually done for someone in particular, while "Education" and "Professional
 * Reading" generally aren't.
 */
export const NON_CHARGE_CATEGORIES = [
  "Billing",
  "Engagement Letters",
  "Travel",
  "Business Development",
  "Administrative",
  "Education",
  "Professional Reading",
] as const;

export type NonChargeCategory = (typeof NON_CHARGE_CATEGORIES)[number];

export function isNonChargeCategory(v: unknown): v is NonChargeCategory {
  return typeof v === "string" && (NON_CHARGE_CATEGORIES as readonly string[]).includes(v);
}
