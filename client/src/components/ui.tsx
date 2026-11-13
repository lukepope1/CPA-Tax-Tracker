import { ReactNode, useMemo, useState } from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { ENGAGEMENT_STATUS_LABELS, EngagementStatus } from "../lib/types";
import { startOfToday } from "../lib/dates";

/** Small inline loading spinner. */
export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/** Full-width centered loading row for tables/sections. */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
      <Spinner className="text-brand-600" />
      {label}
    </div>
  );
}

/**
 * Friendly empty state. An icon and a short prompt make an empty section read
 * as "nothing here yet" rather than "something failed to load".
 */
export function EmptyState({
  title,
  hint,
  icon: Icon = Inbox,
  compact = false,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  /** Smaller, left-aligned variant for use inside cards. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2.5">
        <Icon className="h-5 w-5 shrink-0 text-brand-400" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700">{title}</p>
          {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="py-10 text-center">
      <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50">
        <Icon className="h-5 w-5 text-brand-500" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/** Shimmering block shown in place of a value while it loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block animate-pulse rounded bg-gray-200 ${className}`} />;
}

/**
 * Status colours follow the workflow so a list reads as progress: cool blues
 * while work is being gathered and prepared, warm tones through review, teal
 * and cyan heading out the door, green when done. The two "stuck" states —
 * missing items and open questions — are red/rose so they stand out from the
 * flow. Written out in full so Tailwind generates every class.
 */
const STATUS_STYLES: Record<EngagementStatus, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300",
  INFORMATION_RECEIVED: "bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-300",
  MISSING_ITEMS: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-300",
  IN_PREP: "bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-300",
  OPEN_FOR_QUESTIONS: "bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-300",
  IN_REVIEW: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300",
  REVIEW_NOTES: "bg-yellow-100 text-yellow-800 ring-1 ring-inset ring-yellow-300",
  SECOND_REVIEW: "bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-300",
  READY_FOR_DELIVERY: "bg-teal-100 text-teal-800 ring-1 ring-inset ring-teal-300",
  AWAITING_CLIENT_APPROVAL: "bg-cyan-100 text-cyan-800 ring-1 ring-inset ring-cyan-300",
  COMPLETED: "bg-green-100 text-green-800 ring-1 ring-inset ring-green-300",
};

/** Solid version of each status colour, for bars and chart segments. */
export const STATUS_FILL: Record<EngagementStatus, string> = {
  NOT_STARTED: "bg-slate-400",
  INFORMATION_RECEIVED: "bg-sky-500",
  MISSING_ITEMS: "bg-red-500",
  IN_PREP: "bg-blue-500",
  OPEN_FOR_QUESTIONS: "bg-rose-500",
  IN_REVIEW: "bg-amber-500",
  REVIEW_NOTES: "bg-yellow-400",
  SECOND_REVIEW: "bg-orange-500",
  READY_FOR_DELIVERY: "bg-teal-500",
  AWAITING_CLIENT_APPROVAL: "bg-cyan-500",
  COMPLETED: "bg-green-500",
};

/** Hex equivalents of STATUS_FILL, for charts drawn outside Tailwind. */
export const STATUS_HEX: Record<EngagementStatus, string> = {
  NOT_STARTED: "#94a3b8",
  INFORMATION_RECEIVED: "#0ea5e9",
  MISSING_ITEMS: "#ef4444",
  IN_PREP: "#3b82f6",
  OPEN_FOR_QUESTIONS: "#f43f5e",
  IN_REVIEW: "#f59e0b",
  REVIEW_NOTES: "#facc15",
  SECOND_REVIEW: "#f97316",
  READY_FOR_DELIVERY: "#14b8a6",
  AWAITING_CLIENT_APPROVAL: "#06b6d4",
  COMPLETED: "#22c55e",
};

/**
 * A due date as a colour-coded chip, so urgency reads without reading the date:
 * red once it's past, amber within a week, teal within a month, grey beyond.
 * Due dates are calendar days, so "today" is measured with startOfToday — a
 * deadline due today is amber, not red.
 */
export function DueChip({ date, suffix }: { date: string; suffix?: string }) {
  const days = Math.round((new Date(date).getTime() - startOfToday().getTime()) / 86400000);
  const tone =
    days < 0
      ? "bg-red-100 text-red-800 ring-red-300"
      : days <= 7
      ? "bg-amber-100 text-amber-800 ring-amber-300"
      : days <= 30
      ? "bg-brand-50 text-brand-800 ring-brand-200"
      : "bg-gray-100 text-gray-700 ring-gray-300";
  const when =
    days < 0 ? `${-days}d overdue` : days === 0 ? "today" : days === 1 ? "tomorrow" : days <= 30 ? `in ${days}d` : null;
  const label = new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {label}
      {when && <span className="font-semibold">· {when}</span>}
      {suffix && <span className="font-normal opacity-80">{suffix}</span>}
    </span>
  );
}

/** Color classes for a status (for badges or colored selects). */
export function statusClasses(status: EngagementStatus): string {
  return STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
}

/** Color-coded engagement status pill. */
export function StatusBadge({ status }: { status: EngagementStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
      {ENGAGEMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Sortable-table hook. Returns sorted rows plus a header helper. */
export function useSort<T>(rows: T[], initialKey: keyof T, initialDir: "asc" | "desc" = "asc") {
  const [sortKey, setSortKey] = useState<keyof T>(initialKey);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp: number;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = 1;
      else if (bv == null) cmp = -1;
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, dir]);

  function toggle(key: keyof T) {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("asc");
    }
  }

  return { sorted, sortKey, dir, toggle };
}

/** Clickable sortable <th>. */
export function SortTh<T>({
  field,
  label,
  sort,
  align = "left",
  className = "",
}: {
  field: keyof T;
  label: string;
  sort: { sortKey: keyof T; dir: "asc" | "desc"; toggle: (k: keyof T) => void };
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.sortKey === field;
  return (
    <th
      className={`py-2 px-4 cursor-pointer select-none hover:text-gray-700 ${align === "right" ? "text-right" : "text-left"} ${className}`}
      onClick={() => sort.toggle(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <span className={`text-[10px] ${active ? "text-brand-600" : "text-gray-300"}`}>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}
        </span>
      </span>
    </th>
  );
}

/** Generic small badge. */
export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "amber" | "green" | "red" | "brand" }) {
  const tones: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600",
    amber: "bg-amber-100 text-amber-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    brand: "bg-brand-100 text-brand-700",
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
