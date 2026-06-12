import "server-only";
import { getSupabase } from "./supabase";

// JSearch's free tier is 200 requests/month — a HARD limit. We protect it
// with a persistent guard (survives server restarts) that enforces:
//  - a monthly cap well below 200 (safety margin), and
//  - a per-query cooldown so the same search can't burn calls repeatedly.
// Between live calls, JSearch jobs already stored in the database keep
// showing, so the user still benefits without spending quota.

const MONTHLY_CAP = 150;
const PER_QUERY_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours
const GLOBAL_KEY = "jsearch:global";

function currentMonth(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7); // "YYYY-MM"
}

interface UsageRow {
  key: string;
  last_called_at: string | null;
  calls_this_month: number;
  month: string | null;
}

async function readRow(key: string): Promise<UsageRow | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("api_usage")
    .select("*")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as UsageRow | null) ?? null;
}

export interface QuotaDecision {
  allowed: boolean;
  /** "ok" | "cooldown" | "monthly_cap" — for honest UI messaging. */
  reason: "ok" | "cooldown" | "monthly_cap";
}

/**
 * May we spend a JSearch call for this query right now? Read-only — call
 * recordJSearchCall() after a successful live call.
 */
export async function canCallJSearch(
  queryKey: string,
  nowMs: number
): Promise<QuotaDecision> {
  try {
    const global = await readRow(GLOBAL_KEY);
    const month = currentMonth(nowMs);
    const used = global && global.month === month ? global.calls_this_month : 0;
    if (used >= MONTHLY_CAP) {
      return { allowed: false, reason: "monthly_cap" };
    }
    const perQuery = await readRow(`jsearch:q:${queryKey}`);
    if (perQuery?.last_called_at) {
      const last = Date.parse(perQuery.last_called_at);
      if (!Number.isNaN(last) && nowMs - last < PER_QUERY_COOLDOWN_MS) {
        return { allowed: false, reason: "cooldown" };
      }
    }
    return { allowed: true, reason: "ok" };
  } catch {
    // If the guard itself can't be read, fail CLOSED (don't risk the quota).
    return { allowed: false, reason: "cooldown" };
  }
}

/** Record that a live JSearch call was made (bumps the month + per-query rows). */
export async function recordJSearchCall(
  queryKey: string,
  nowMs: number
): Promise<void> {
  const sb = getSupabase();
  const month = currentMonth(nowMs);
  const nowIso = new Date(nowMs).toISOString();
  try {
    const global = await readRow(GLOBAL_KEY);
    const used = global && global.month === month ? global.calls_this_month : 0;
    await sb.from("api_usage").upsert(
      {
        key: GLOBAL_KEY,
        last_called_at: nowIso,
        calls_this_month: used + 1,
        month,
      },
      { onConflict: "key" }
    );
    await sb.from("api_usage").upsert(
      { key: `jsearch:q:${queryKey}`, last_called_at: nowIso, month },
      { onConflict: "key" }
    );
  } catch {
    // Best-effort accounting; a failed write just means the next call may be
    // allowed slightly sooner. The monthly cap still bounds total spend.
  }
}
