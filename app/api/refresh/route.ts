import { NextResponse } from "next/server";
import { z } from "zod";
import type { Job, RefreshRequest, RefreshResponse } from "@/lib/types";
import { CONTRACT_TYPES, EMPLOYMENT_TYPES } from "@/lib/types";
import { isExpiredByPosting } from "@/lib/format";
import { runRefresh } from "@/lib/server/refresh";
import { getSupabase } from "@/lib/server/supabase";
import { londonTodayEpochDays } from "@/lib/server/time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Every field falls back to a safe default, so a missing or malformed body
// simply means "search everything".
const RefreshBodySchema = z.object({
  terms: z
    .array(z.string().trim().toLowerCase().min(1).max(60))
    .max(20)
    .catch([]),
  searchDescriptions: z.boolean().catch(false),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).max(4).catch([]),
  contractTypes: z.array(z.enum(CONTRACT_TYPES)).max(2).catch([]),
  salaryMin: z.number().min(0).max(10_000_000).nullable().catch(null),
  salaryMax: z.number().min(0).max(10_000_000).nullable().catch(null),
});

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => ({}));
  const parsed = RefreshBodySchema.safeParse(raw);
  const search: RefreshRequest = parsed.success
    ? parsed.data
    : RefreshBodySchema.parse({});

  try {
    const result = await runRefresh(search);
    return NextResponse.json(result);
  } catch {
    // Never crash the UI: fall back to whatever is already stored.
    const fallback: RefreshResponse = {
      ok: false,
      live: false,
      refreshedAt: new Date().toISOString(),
      jobs: [],
      newJobs: 0,
      newJobIds: [],
      removedJobs: 0,
      sourceStatus: { adzuna: "error", reed: "error" },
      message:
        "Couldn't reach the sources just now — showing your most recent results.",
    };
    try {
      const sb = getSupabase();
      const { data } = await sb
        .from("jobs")
        .select("*")
        .order("source_posted_date", { ascending: false, nullsFirst: false })
        .order("first_seen_at", { ascending: false });
      const nowMs = Date.now();
      const todayDays = londonTodayEpochDays();
      fallback.jobs = ((data ?? []) as Job[]).filter(
        (j) => j.status === "applied" || !isExpiredByPosting(j, nowMs, todayDays)
      );
    } catch {
      fallback.message =
        "Couldn't refresh right now. Please try again in a minute.";
    }
    return NextResponse.json(fallback);
  }
}
