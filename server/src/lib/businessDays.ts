/**
 * IRC §7503: when a federal filing or payment deadline falls on a Saturday,
 * Sunday or legal holiday, it moves to the next day that is none of those.
 *
 * "Legal holiday" here means the federal holidays (5 U.S.C. §6103) on their
 * observed dates, plus District of Columbia Emancipation Day (April 16). The
 * IRS is in DC and honours it, which is why an April 15 deadline sometimes
 * lands on the 17th or 18th — e.g. 2022 (Emancipation Day observed Friday the
 * 15th) and 2023 (the 15th a Saturday, Emancipation Day observed Monday the
 * 17th) were both due April 18.
 *
 * All dates are UTC midnight of a calendar day, matching how due dates are
 * stored everywhere else.
 */

const DAY_MS = 86_400_000;

function utc(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

/** The nth (1-based) given weekday of a month; n = -1 for the last one. */
function nthWeekday(year: number, month0: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = utc(year, month0, 1);
    const offset = (weekday - first.getUTCDay() + 7) % 7;
    return utc(year, month0, 1 + offset + (n - 1) * 7);
  }
  const last = utc(year, month0 + 1, 0);
  const back = (last.getUTCDay() - weekday + 7) % 7;
  return utc(year, month0, last.getUTCDate() - back);
}

/** A fixed-date holiday moved to the weekday it's observed on. */
function observed(d: Date): Date {
  const dow = d.getUTCDay();
  if (dow === 6) return new Date(d.getTime() - DAY_MS); // Saturday -> Friday
  if (dow === 0) return new Date(d.getTime() + DAY_MS); // Sunday -> Monday
  return d;
}

function holidaysForYear(year: number): Date[] {
  const list = [
    observed(utc(year, 0, 1)), // New Year's Day
    nthWeekday(year, 0, 1, 3), // Martin Luther King Jr. Day — 3rd Monday of January
    nthWeekday(year, 1, 1, 3), // Washington's Birthday — 3rd Monday of February
    observed(utc(year, 3, 16)), // DC Emancipation Day
    nthWeekday(year, 4, 1, -1), // Memorial Day — last Monday of May
    nthWeekday(year, 8, 1, 1), // Labor Day — 1st Monday of September
    nthWeekday(year, 9, 1, 2), // Columbus Day — 2nd Monday of October
    observed(utc(year, 10, 11)), // Veterans Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving — 4th Thursday of November
    observed(utc(year, 11, 25)), // Christmas Day
  ];
  if (year >= 2021) list.push(observed(utc(year, 5, 19))); // Juneteenth, a federal holiday from 2021
  list.push(observed(utc(year, 6, 4))); // Independence Day
  return list;
}

const cache = new Map<number, Set<number>>();

function holidaySet(year: number): Set<number> {
  let set = cache.get(year);
  if (!set) {
    // A Saturday New Year's Day is observed on December 31 of the year before,
    // so neighbouring years' holidays are folded in too.
    set = new Set(
      [year - 1, year, year + 1].flatMap(holidaysForYear).map((d) => d.getTime())
    );
    cache.set(year, set);
  }
  return set;
}

export function isBusinessDay(d: Date): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !holidaySet(d.getUTCFullYear()).has(utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime());
}

/** The date itself if it's a business day, otherwise the next one that is. */
export function nextBusinessDay(d: Date): Date {
  let day = utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  while (!isBusinessDay(day)) day = new Date(day.getTime() + DAY_MS);
  return day;
}
