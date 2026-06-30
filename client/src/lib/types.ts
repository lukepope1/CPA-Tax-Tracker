export type FormType = "FORM_1040" | "FORM_1065" | "FORM_1120S" | "FORM_1120" | "FORM_990";

export type EngagementStatus =
  | "NOT_STARTED"
  | "INFORMATION_RECEIVED"
  | "MISSING_ITEMS"
  | "IN_PREP"
  | "OPEN_FOR_QUESTIONS"
  | "IN_REVIEW"
  | "REVIEW_NOTES"
  | "SECOND_REVIEW"
  | "READY_FOR_DELIVERY"
  | "AWAITING_CLIENT_APPROVAL"
  | "COMPLETED";

export const ENGAGEMENT_STATUSES: EngagementStatus[] = [
  "NOT_STARTED",
  "INFORMATION_RECEIVED",
  "MISSING_ITEMS",
  "IN_PREP",
  "OPEN_FOR_QUESTIONS",
  "IN_REVIEW",
  "REVIEW_NOTES",
  "SECOND_REVIEW",
  "READY_FOR_DELIVERY",
  "AWAITING_CLIENT_APPROVAL",
  "COMPLETED",
];

export type DueDateType =
  | "ORIGINAL_FILING"
  | "EXTENDED_FILING"
  | "ESTIMATE_Q1"
  | "ESTIMATE_Q2"
  | "ESTIMATE_Q3"
  | "ESTIMATE_Q4";

export const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming", "District of Columbia",
];

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  FORM_1040: "1040 - Individual",
  FORM_1065: "1065 - Partnership",
  FORM_1120S: "1120-S - S Corporation",
  FORM_1120: "1120 - C Corporation",
  FORM_990: "990 - Exempt Organization",
};

export const DUE_DATE_TYPE_LABELS: Record<DueDateType, string> = {
  ORIGINAL_FILING: "Original Filing Deadline",
  EXTENDED_FILING: "Extended Filing Deadline",
  ESTIMATE_Q1: "Estimated Payment Q1",
  ESTIMATE_Q2: "Estimated Payment Q2",
  ESTIMATE_Q3: "Estimated Payment Q3",
  ESTIMATE_Q4: "Estimated Payment Q4",
};

export const ENGAGEMENT_STATUS_LABELS: Record<EngagementStatus, string> = {
  NOT_STARTED: "Not Started",
  INFORMATION_RECEIVED: "Information Received",
  MISSING_ITEMS: "Missing Items",
  IN_PREP: "In Prep",
  OPEN_FOR_QUESTIONS: "Open for Questions",
  IN_REVIEW: "In Review",
  REVIEW_NOTES: "Review Notes",
  SECOND_REVIEW: "2nd Review",
  READY_FOR_DELIVERY: "Ready for Delivery",
  AWAITING_CLIENT_APPROVAL: "Awaiting Client Approval",
  COMPLETED: "Completed",
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "STAFF";
  billableRate?: number | null;
}

export type ClientType =
  | "Corporation"
  | "Individual"
  | "Sch. E"
  | "Estate"
  | "Trust"
  | "Partnership"
  | "S Corporation"
  | "Non-Profit";

export const CLIENT_TYPES: ClientType[] = [
  "Corporation",
  "Individual",
  "Sch. E",
  "Estate",
  "Trust",
  "Partnership",
  "S Corporation",
  "Non-Profit",
];

export interface Client {
  id: string;
  name: string;
  clientType?: ClientType;
  firstName?: string | null;
  lastName?: string | null;
  spouseName?: string | null;
  clientCode: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  notes: string | null;
  deletedAt?: string | null;
  _count?: { engagements: number };
  engagements?: Engagement[];
}

export interface DueDate {
  id: string;
  type: DueDateType;
  dueDate: string;
  completed: boolean;
  completedDate: string | null;
  notes: string | null;
  engagementId: string;
  engagement?: Engagement;
}

export function engagementLabel(e: { formType: FormType; taxYear: number; jurisdiction?: string | null }): string {
  const base = `${FORM_TYPE_LABELS[e.formType]} (${e.taxYear})`;
  return e.jurisdiction && e.jurisdiction !== "Federal" ? `${base} — ${e.jurisdiction}` : base;
}

export interface Engagement {
  id: string;
  clientId: string;
  client?: { id: string; name: string };
  formType: FormType;
  jurisdiction?: string;
  taxYear: number;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  status: EngagementStatus;
  extensionFiled: boolean;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string } | null;
  notes: string | null;
  dueDates: DueDate[];
  projectedFee?: number | null;
  priorYearFee?: number | null;
  priorYearHours?: number | null;
  priorBilled?: number | null;
  billed?: boolean;
  billedDate?: string | null;
  billedAmount?: number | null;
  timeEntries?: { hours: number; rate?: number | null; user?: { billableRate?: number | null } | null }[];
}

export interface TimeEntry {
  id: string;
  userId: string;
  user?: { id: string; name: string; billableRate?: number | null };
  clientId: string;
  client?: { id: string; name: string };
  engagementId: string | null;
  engagement?: { id: string; formType: FormType; taxYear: number; jurisdiction?: string } | null;
  date: string;
  hours: number;
  description: string;
  billable: boolean;
  rate?: number | null;
}
