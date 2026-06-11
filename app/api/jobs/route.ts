import { NextResponse } from "next/server";
import type { Job, JobsResponse } from "@/lib/types";
import { JOB_TTL_MS } from "@/lib/format";
import { getSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Stored jobs for the initial page load: applied ones plus anything under 24h. */
export async function GET() {
  try {
    const sb = getSupabase();
    const cutoffIso = new Date(Date.now() - JOB_TTL_MS).toISOString();
    const { data, error } = await sb
      .from("jobs")
      .select("*")
      .or(`status.eq.applied,first_seen_at.gte.${cutoffIso}`)
      .order("first_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    const body: JobsResponse = { jobs: (data ?? []) as Job[] };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { error: "Could not load jobs." },
      { status: 500 }
    );
  }
}
