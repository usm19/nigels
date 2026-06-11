import { NextResponse } from "next/server";
import { z } from "zod";
import type { Job } from "@/lib/types";
import { getSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({ applied: z.boolean() });

/**
 * Mark a job as applied (kept forever, exempt from the 24-hour cleanup) or
 * un-apply it (back to the normal lifecycle).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let applied: boolean;
  try {
    const body: unknown = await request.json();
    applied = BodySchema.parse(body).applied;
  } catch {
    return NextResponse.json(
      { error: "Expected { applied: true | false }." },
      { status: 400 }
    );
  }

  try {
    const sb = getSupabase();
    const patch = applied
      ? { status: "applied", applied_at: new Date().toISOString() }
      : { status: "active", applied_at: null };
    const { data, error } = await sb
      .from("jobs")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    return NextResponse.json({ job: data as Job });
  } catch {
    return NextResponse.json(
      { error: "Could not update this job." },
      { status: 500 }
    );
  }
}
