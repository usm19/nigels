import { NextResponse } from "next/server";
import type { Job, JobsResponse } from "@/lib/types";
import { isExpiredByPosting } from "@/lib/format";
import { getSupabase } from "@/lib/server/supabase";
import { isExcluded } from "@/lib/server/exclude";
import { londonTodayEpochDays } from "@/lib/server/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stored jobs for the initial page load: applied ones plus anything still
 * inside the 24-hour window measured from its REAL posting time.
 */
export async function GET() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("jobs")
      .select("*")
      .order("source_posted_date", { ascending: false, nullsFirst: false })
      .order("first_seen_at", { ascending: false });
    if (error) throw new Error(error.message);

    const nowMs = Date.now();
    const todayDays = londonTodayEpochDays();
    // Read-time pass of the always-on exclusion, plus the 24h freshness rule.
    const jobs = ((data ?? []) as Job[]).filter(
      (j) =>
        !isExcluded(j) &&
        (j.status === "applied" || !isExpiredByPosting(j, nowMs, todayDays))
    );

    const body: JobsResponse = { jobs };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { error: "Could not load jobs." },
      { status: 500 }
    );
  }
}
