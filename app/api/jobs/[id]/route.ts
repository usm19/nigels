import { NextResponse } from "next/server";
import type { Job, JobDetailResponse } from "@/lib/types";
import { getSupabase } from "@/lib/server/supabase";
import { fetchReedFullDescriptionHtml } from "@/lib/server/reed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Job detail. For Reed jobs this also fetches the FULL description live from
 * Reed's details endpoint (the search API only returns a truncated one).
 * Adzuna only ever provides a snippet — the full advert is on the external
 * page, which the UI says clearly.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("jobs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    const job = data as Job;

    let fullDescriptionHtml: string | null = null;
    if (job.source === "reed") {
      try {
        fullDescriptionHtml = await fetchReedFullDescriptionHtml(
          job.source_job_id
        );
      } catch {
        // Quietly fall back to the stored snippet — the UI explains this.
        fullDescriptionHtml = null;
      }
    }

    const body: JobDetailResponse = { job, fullDescriptionHtml };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { error: "Could not load this job." },
      { status: 500 }
    );
  }
}
