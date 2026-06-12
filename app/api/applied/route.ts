import { NextResponse } from "next/server";
import { z } from "zod";
import type { AppliedResponse, Job } from "@/lib/types";
import { JOB_SOURCES } from "@/lib/types";
import { getServerSupabase } from "@/lib/supabase/server";
import { getSupabase } from "@/lib/server/supabase";
import { isExcluded } from "@/lib/server/exclude";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Per-user applied jobs. Each applied job is a SNAPSHOT (its own row in
// applied_jobs) so it survives the shared job's 24-hour expiry. Row-level
// security ties every row to the signed-in user, so people only ever see and
// change their own. We shape rows as Job (status = "applied") so they render in
// the existing cards/detail with no changes.

const BodySchema = z.object({
  source: z.enum(JOB_SOURCES),
  sourceJobId: z.string().min(1).max(200),
});

type Row = Record<string, unknown>;

function rowToJob(r: Row): Job {
  const applied = r.applied_at as string;
  return {
    id: r.id as string,
    source: r.source as Job["source"],
    source_job_id: r.source_job_id as string,
    title: r.title as string,
    company: (r.company as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    url: r.url as string,
    contract_time: (r.contract_time as Job["contract_time"]) ?? null,
    is_remote: Boolean(r.is_remote),
    is_hybrid: Boolean(r.is_hybrid),
    salary_min: (r.salary_min as number | null) ?? null,
    salary_max: (r.salary_max as number | null) ?? null,
    source_posted_date: (r.source_posted_date as string | null) ?? null,
    posted_time_precision: (r.posted_time_precision as Job["posted_time_precision"]) ?? "exact",
    first_seen_at: applied,
    status: "applied",
    applied_at: applied,
    is_government: Boolean(r.is_government),
    sector: (r.sector as Job["sector"]) ?? "private",
    experience_level: (r.experience_level as Job["experience_level"]) ?? null,
    contract_type: (r.contract_type as Job["contract_type"]) ?? null,
  };
}

export async function GET() {
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data, error } = await sb
    .from("applied_jobs")
    .select("*")
    .order("applied_at", { ascending: false });
  if (error) {
    return NextResponse.json(
      { error: "Could not load your applied jobs." },
      { status: 500 }
    );
  }
  // Read-time safety net for the always-on exclusion.
  const applied = ((data ?? []) as Row[])
    .filter((r) => !isExcluded(r as unknown as Job))
    .map(rowToJob);
  return NextResponse.json({ applied } satisfies AppliedResponse);
}

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Snapshot the authoritative job from the shared pool (service role).
  const admin = getSupabase();
  const { data: jobRow, error: jobErr } = await admin
    .from("jobs")
    .select("*")
    .eq("source", body.source)
    .eq("source_job_id", body.sourceJobId)
    .maybeSingle();
  if (jobErr) {
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
  if (!jobRow || isExcluded(jobRow as Job)) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  const j = jobRow as Job;
  const snapshot = {
    user_id: user.id,
    source: j.source,
    source_job_id: j.source_job_id,
    title: j.title,
    company: j.company,
    location: j.location,
    description: j.description,
    url: j.url,
    contract_time: j.contract_time,
    is_remote: j.is_remote,
    is_hybrid: j.is_hybrid,
    salary_min: j.salary_min,
    salary_max: j.salary_max,
    source_posted_date: j.source_posted_date,
    posted_time_precision: j.posted_time_precision,
    is_government: j.is_government,
    sector: j.sector,
    experience_level: j.experience_level,
    contract_type: j.contract_type,
    applied_at: new Date().toISOString(),
  };

  const { data: row, error: insErr } = await sb
    .from("applied_jobs")
    .insert(snapshot)
    .select("*")
    .single();
  if (insErr) {
    // Already applied — return the existing snapshot (idempotent).
    if (insErr.code === "23505") {
      const { data: existing } = await sb
        .from("applied_jobs")
        .select("*")
        .eq("source", body.source)
        .eq("source_job_id", body.sourceJobId)
        .maybeSingle();
      if (existing) {
        return NextResponse.json({
          applied: [rowToJob(existing as Row)],
        } satisfies AppliedResponse);
      }
    }
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
  return NextResponse.json(
    { applied: [rowToJob(row as Row)] } satisfies AppliedResponse,
    { status: 201 }
  );
}

export async function DELETE(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const sb = await getServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  // RLS scopes the delete to this user's own applied rows.
  const { error } = await sb
    .from("applied_jobs")
    .delete()
    .eq("source", body.source)
    .eq("source_job_id", body.sourceJobId);
  if (error) {
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
