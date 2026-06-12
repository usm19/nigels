// Client-safe formatting and lifecycle helpers.
//
// THE GOLDEN RULE OF NIGEL'S: a job's displayed age and its 24-hour
// lifecycle come from the REAL posting time on the source site
// (source_posted_date), NEVER from when Nigel's first saw it
// (first_seen_at). first_seen_at exists only for the "NEW" badge.
import { format, parseISO } from "date-fns";
import type { Job, PostedTimePrecision } from "./types";

/** How long a job stays after it was POSTED on its source: 24 hours. */
export const JOB_TTL_MS = 24 * 60 * 60 * 1000;

// --- Posting-time precision -------------------------------------------------

/**
 * Reed's API only ever provides a date (DD/MM/YYYY, no time of day), so Reed
 * jobs are always treated as date-only regardless of what's stored — this
 * also covers rows written before the precision column existed.
 */
export function effectivePrecision(job: {
  source: string;
  posted_time_precision?: PostedTimePrecision | null;
}): PostedTimePrecision {
  if (job.source === "reed") return "date_only";
  return job.posted_time_precision === "date_only" ? "date_only" : "exact";
}

// --- Calendar-day arithmetic for date-only sources ---------------------------

/** Days since epoch for the LOCAL calendar date of the given moment. */
export function localTodayEpochDays(nowMs: number): number {
  const d = new Date(nowMs);
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000
  );
}

/**
 * Days since epoch for a stored date-only value. Date-only posting dates are
 * stored at midnight UTC, so the UTC date parts ARE the source's date.
 */
export function postedDateEpochDays(iso: string): number | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

// --- The displayed age --------------------------------------------------------

/**
 * Honest "posted X ago" text from the REAL posting time.
 * - Exact sources (Adzuna): "30 seconds ago", "12 minutes ago", "5 hours ago".
 * - Date-only sources (Reed): "today", "yesterday", "X days ago".
 * Returns null when the source provided no posting time at all.
 */
export function postedAgo(job: Job, nowMs: number): string | null {
  if (!job.source_posted_date) return null;

  if (effectivePrecision(job) === "date_only") {
    const posted = postedDateEpochDays(job.source_posted_date);
    if (posted === null) return null;
    const days = localTodayEpochDays(nowMs) - posted;
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  }

  const postedMs = Date.parse(job.source_posted_date);
  if (Number.isNaN(postedMs)) return null;
  const diff = Math.max(0, nowMs - postedMs);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return secs <= 5 ? "just now" : `${secs} seconds ago`;
  const mins = Math.floor(secs / 60);
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

// --- 24-hour lifecycle ----------------------------------------------------------

/**
 * True when an active job has fallen out of the 24-hour window, measured
 * from its REAL posting time. Date-only jobs (Reed) count as fresh on the
 * day they were posted and expired from the next day. Jobs whose source
 * gave no posting time fall back to first_seen_at for lifecycle ONLY (their
 * age is displayed as unknown, never invented).
 *
 * todayEpochDays is overridable so the server can use Europe/London's
 * calendar rather than the server's own timezone.
 */
export function isExpiredByPosting(
  job: Job,
  nowMs: number,
  todayEpochDays: number = localTodayEpochDays(nowMs)
): boolean {
  if (job.status === "applied") return false;

  if (!job.source_posted_date) {
    const seen = Date.parse(job.first_seen_at);
    return !Number.isNaN(seen) && nowMs - seen > JOB_TTL_MS;
  }

  if (effectivePrecision(job) === "date_only") {
    const posted = postedDateEpochDays(job.source_posted_date);
    if (posted === null) return false;
    return todayEpochDays - posted >= 1;
  }

  const postedMs = Date.parse(job.source_posted_date);
  if (Number.isNaN(postedMs)) return false;
  return nowMs - postedMs > JOB_TTL_MS;
}

// --- General formatting -----------------------------------------------------------

/** Generic "X ago" used for applied dates and the NEW-badge tooltip — NOT for posted age. */
export function timeAgo(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, nowMs - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Ticking "0:42" style timer for the time since the last refresh. */
export function refreshTimer(lastMs: number, nowMs: number): string {
  const total = Math.max(0, Math.floor((nowMs - lastMs) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function clockTime(nowMs: number): string {
  return format(nowMs, "HH:mm:ss");
}

export function formatSalary(
  min: number | null,
  max: number | null
): string | null {
  const f = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");
  const lo = typeof min === "number" && min > 0 ? min : null;
  const hi = typeof max === "number" && max > 0 ? max : null;
  if (lo !== null && hi !== null && Math.round(lo) !== Math.round(hi)) {
    return `${f(lo)} – ${f(hi)}`;
  }
  const single = hi ?? lo;
  return single !== null ? f(single) : null;
}

export function formatDateNice(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return "";
  }
}

export function formatDateTimeNice(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy, HH:mm");
  } catch {
    return "";
  }
}

export function contractTimeLabel(
  contractTime: Job["contract_time"]
): string | null {
  if (contractTime === "full_time") return "Full-time";
  if (contractTime === "part_time") return "Part-time";
  return null;
}
