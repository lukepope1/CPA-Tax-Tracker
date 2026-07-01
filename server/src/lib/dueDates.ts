export type FormType =
  | "FORM_1040"
  | "FORM_1065"
  | "FORM_1120S"
  | "FORM_1120"
  | "FORM_990"
  | "FORM_709"
  | "FORM_706"
  | "SCH_E"
  | "SCH_C"
  | "OTHER";

export type DueDateType =
  | "ORIGINAL_FILING"
  | "EXTENDED_FILING"
  | "ESTIMATE_Q1"
  | "ESTIMATE_Q2"
  | "ESTIMATE_Q3"
  | "ESTIMATE_Q4";

export interface GeneratedDueDate {
  type: DueDateType;
  dueDate: Date;
}

/**
 * Returns the date that is the 15th day of the Nth month following the
 * close of a fiscal year ending on (fyeMonth, fyeDay) in `taxYear`.
 * e.g. fyeMonth=12 (Dec 31), n=4 -> April 15 of taxYear+1 (1040/1120 original due date).
 */
function nthMonthAfterFYE(fyeMonth: number, taxYear: number, n: number, day = 15): Date {
  const totalMonth = fyeMonth + n; // 1-indexed month count from January of taxYear
  const yearOffset = Math.floor((totalMonth - 1) / 12);
  const month = ((totalMonth - 1) % 12) + 1;
  // Use UTC midnight so the calendar date is unambiguous regardless of server TZ.
  return new Date(Date.UTC(taxYear + yearOffset, month - 1, day));
}

/**
 * Returns the date that is the 15th day of the Nth month of a fiscal tax
 * year ending on (fyeMonth, fyeDay) in `taxYear`. Used for corporate
 * estimated tax payments, which are due during the tax year itself.
 */
function nthMonthOfTaxYear(fyeMonth: number, taxYear: number, n: number, day = 15): Date {
  // The tax year starts the month after the prior fiscal year end.
  const startMonth = fyeMonth === 12 ? 1 : fyeMonth + 1;
  const startYear = fyeMonth === 12 ? taxYear : taxYear - 1;
  const totalMonth = startMonth + (n - 1);
  const yearOffset = Math.floor((totalMonth - 1) / 12);
  const month = ((totalMonth - 1) % 12) + 1;
  return new Date(Date.UTC(startYear + yearOffset, month - 1, day));
}

/**
 * Generates the filing deadlines (original + extended) and, where
 * applicable, quarterly estimated tax payment due dates for an engagement.
 *
 * taxYear convention: the calendar year in which the fiscal year ENDS.
 * For calendar-year filers, fyeMonth=12, fyeDay=31, and taxYear is the
 * tax year itself (e.g. 2025 return covering Jan 1 - Dec 31, 2025).
 */
export function generateDueDates(
  formType: FormType,
  taxYear: number,
  fyeMonth: number,
  fyeDay: number,
  includeEstimates = true
): GeneratedDueDate[] {
  const dates: GeneratedDueDate[] = [];

  switch (formType) {
    case "FORM_1040":
    case "SCH_E":
    case "SCH_C": {
      // Filed on the individual 1040 — calendar-year, same deadlines.
      dates.push({ type: "ORIGINAL_FILING", dueDate: new Date(Date.UTC(taxYear + 1, 3, 15)) }); // Apr 15
      dates.push({ type: "EXTENDED_FILING", dueDate: new Date(Date.UTC(taxYear + 1, 9, 15)) }); // Oct 15
      if (includeEstimates) {
        // Estimates set up while preparing this return are for the FOLLOWING tax
        // year (a 2025 return's estimates are the 2026 estimates).
        dates.push({ type: "ESTIMATE_Q1", dueDate: new Date(Date.UTC(taxYear + 1, 3, 15)) }); // Apr 15
        dates.push({ type: "ESTIMATE_Q2", dueDate: new Date(Date.UTC(taxYear + 1, 5, 15)) }); // Jun 15
        dates.push({ type: "ESTIMATE_Q3", dueDate: new Date(Date.UTC(taxYear + 1, 8, 15)) }); // Sep 15
        dates.push({ type: "ESTIMATE_Q4", dueDate: new Date(Date.UTC(taxYear + 2, 0, 15)) }); // Jan 15
      }
      break;
    }

    case "FORM_709": {
      // Gift tax return — due Apr 15 of the following year (extends to Oct 15).
      dates.push({ type: "ORIGINAL_FILING", dueDate: new Date(Date.UTC(taxYear + 1, 3, 15)) });
      dates.push({ type: "EXTENDED_FILING", dueDate: new Date(Date.UTC(taxYear + 1, 9, 15)) });
      break;
    }

    case "FORM_706":
    case "OTHER": {
      // 706 estate returns are due 9 months after date of death (not tracked
      // here); special projects have no standard deadline. Both use an optional
      // manual due date instead.
      break;
    }

    case "FORM_1065":
    case "FORM_1120S": {
      // 15th day of the 3rd month after fiscal year end, 6-month extension.
      dates.push({ type: "ORIGINAL_FILING", dueDate: nthMonthAfterFYE(fyeMonth, taxYear, 3, fyeDay > 15 ? 15 : 15) });
      dates.push({ type: "EXTENDED_FILING", dueDate: nthMonthAfterFYE(fyeMonth, taxYear, 9) });
      // Pass-through entities generally don't make entity-level estimates.
      break;
    }

    case "FORM_1120": {
      // 15th day of the 4th month after fiscal year end.
      dates.push({ type: "ORIGINAL_FILING", dueDate: nthMonthAfterFYE(fyeMonth, taxYear, 4) });
      // Standard 6-month extension, except June 30 FYE corps get 7 months.
      const extensionMonths = fyeMonth === 6 && fyeDay === 30 ? 11 : 10;
      dates.push({ type: "EXTENDED_FILING", dueDate: nthMonthAfterFYE(fyeMonth, taxYear, extensionMonths) });
      if (includeEstimates) {
        // Estimated payments due the 15th day of the 4th, 6th, 9th, and 12th
        // months of the tax year.
        dates.push({ type: "ESTIMATE_Q1", dueDate: nthMonthOfTaxYear(fyeMonth, taxYear, 4) });
        dates.push({ type: "ESTIMATE_Q2", dueDate: nthMonthOfTaxYear(fyeMonth, taxYear, 6) });
        dates.push({ type: "ESTIMATE_Q3", dueDate: nthMonthOfTaxYear(fyeMonth, taxYear, 9) });
        dates.push({ type: "ESTIMATE_Q4", dueDate: nthMonthOfTaxYear(fyeMonth, taxYear, 12) });
      }
      break;
    }

    case "FORM_990": {
      // 15th day of the 5th month after fiscal year end, 6-month extension.
      dates.push({ type: "ORIGINAL_FILING", dueDate: nthMonthAfterFYE(fyeMonth, taxYear, 5) });
      dates.push({ type: "EXTENDED_FILING", dueDate: nthMonthAfterFYE(fyeMonth, taxYear, 11) });
      break;
    }
  }

  return dates;
}

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  FORM_1040: "1040 - Individual",
  FORM_1065: "1065 - Partnership",
  FORM_1120S: "1120-S - S Corporation",
  FORM_1120: "1120 - C Corporation",
  FORM_990: "990 - Exempt Organization",
  FORM_709: "709 - Gift Tax",
  FORM_706: "706 - Estate Tax",
  SCH_E: "Sch E",
  SCH_C: "Sch C",
  OTHER: "Other / Special Project",
};

export const DUE_DATE_TYPE_LABELS: Record<DueDateType, string> = {
  ORIGINAL_FILING: "Original Filing Deadline",
  EXTENDED_FILING: "Extended Filing Deadline",
  ESTIMATE_Q1: "Estimated Payment - Q1",
  ESTIMATE_Q2: "Estimated Payment - Q2",
  ESTIMATE_Q3: "Estimated Payment - Q3",
  ESTIMATE_Q4: "Estimated Payment - Q4",
};
