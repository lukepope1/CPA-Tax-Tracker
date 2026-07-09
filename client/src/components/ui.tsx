import { ReactNode, useMemo, useState } from "react";
import { ENGAGEMENT_STATUS_LABELS, EngagementStatus } from "../lib/types";

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

/** Friendly empty state. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const STATUS_STYLES: Record<EngagementStatus, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-600",
  INFORMATION_RECEIVED: "bg-blue-100 text-blue-700",
  MISSING_ITEMS: "bg-red-100 text-red-700",
  IN_PREP: "bg-indigo-100 text-indigo-700",
  OPEN_FOR_QUESTIONS: "bg-orange-100 text-orange-700",
  IN_REVIEW: "bg-amber-100 text-amber-700",
  REVIEW_NOTES: "bg-yellow-100 text-yellow-700",
  SECOND_REVIEW: "bg-amber-100 text-amber-800",
  READY_FOR_DELIVERY: "bg-purple-100 text-purple-700",
  AWAITING_CLIENT_APPROVAL: "bg-teal-100 text-teal-700",
  COMPLETED: "bg-green-100 text-green-700",
};

/** Color classes for a status (for badges or colored selects). */
export function statusClasses(status: EngagementStatus): string {
  return STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600";
}

/** Color-coded engagement status pill. */
export function StatusBadge({ status }: { status: EngagementStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
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
