import { NextResponse } from "next/server";
import type { Job, RefreshResponse } from "@/lib/types";
import { JOB_TTL_MS } from "@/lib/format";
import { runRefresh } from "@/lib/server/refresh";
import { getSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await runRefresh();
    return NextResponse.json(result);
  } catch {
    // Never crash the UI: fall back to whatever is already stored.
    const fallback: RefreshResponse = {
      ok: false,
      live: false,
      refreshedAt: new Date().toISOString(),
      jobs: [],
      newJobs: 0,
      removedJobs: 0,
      sourceStatus: { adzuna: "error", reed: "error" },
      message:
        "Couldn't reach the sources just now — showing your most recent results.",
    };
    try {
      const sb = getSupabase();
      const cutoffIso = new Date(Date.now() - JOB_TTL_MS).toISOString();
      const { data } = await sb
        .from("jobs")
        .select("*")
        .or(`status.eq.applied,first_seen_at.gte.${cutoffIso}`)
        .order("first_seen_at", { ascending: false });
      fallback.jobs = (data ?? []) as Job[];
    } catch {
      fallback.message =
        "Couldn't refresh right now. Please try again in a minute.";
    }
    return NextResponse.json(fallback);
  }
}
