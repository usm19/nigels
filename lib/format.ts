// Client-safe formatting helpers.
import { format, parseISO } from "date-fns";
import type { Job } from "./types";

/** How long an active job is kept before it is removed: 24 hours. */
export const JOB_TTL_MS = 24 * 60 * 60 * 1000;

/** "posted X minutes ago" / "X hours ago", measured from when Nigel's first saw the job. */
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

export function contractLabel(
  contractTime: Job["contract_time"]
): string | null {
  if (contractTime === "full_time") return "Full-time";
  if (contractTime === "part_time") return "Part-time";
  return null;
}

/** True when an active job has passed the 24-hour window (UI backup for the server cleanup). */
export function isExpired(job: Job, nowMs: number): boolean {
  if (job.status === "applied") return false;
  const seen = Date.parse(job.first_seen_at);
  if (Number.isNaN(seen)) return false;
  return nowMs - seen > JOB_TTL_MS;
}
