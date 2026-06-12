import { NextResponse } from "next/server";
import { z } from "zod";
import type { Alert } from "@/lib/types";
import { CONTRACT_TYPES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS } from "@/lib/types";
import { getSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AlertPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    tags: z
      .array(z.string().trim().toLowerCase().min(1).max(60))
      .max(20)
      .transform((tags) => [...new Set(tags)]),
    employment_types: z
      .array(z.enum(EMPLOYMENT_TYPES))
      .max(4)
      .transform((types) => [...new Set(types)]),
    keywords: z.string().trim().max(300).nullable(),
    salary_min: z.number().min(0).max(10_000_000).nullable(),
    salary_max: z.number().min(0).max(10_000_000).nullable(),
    government_only: z.boolean(),
    experience_levels: z
      .array(z.enum(EXPERIENCE_LEVELS))
      .max(3)
      .transform((v) => [...new Set(v)]),
    contract_types: z
      .array(z.enum(CONTRACT_TYPES))
      .max(2)
      .transform((v) => [...new Set(v)]),
    is_active: z.boolean(),
  })
  .partial();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Saved search not found." }, { status: 404 });
  }
  let patch: z.infer<typeof AlertPatchSchema>;
  try {
    const raw: unknown = await request.json();
    patch = AlertPatchSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "That change doesn't look right." },
      { status: 400 }
    );
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("alerts")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Saved search not found." }, { status: 404 });
    }
    return NextResponse.json({ alert: data as Alert });
  } catch {
    return NextResponse.json(
      { error: "Could not update the saved search." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Saved search not found." }, { status: 404 });
  }
  try {
    const sb = getSupabase();
    const { error } = await sb.from("alerts").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not delete the saved search." },
      { status: 500 }
    );
  }
}
