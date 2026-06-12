import { NextResponse } from "next/server";
import { z } from "zod";
import type { Alert, AlertsResponse } from "@/lib/types";
import { CONTRACT_TYPES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS } from "@/lib/types";
import { getSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// A saved search: name + the full search-bar filter state.
const AlertInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  tags: z
    .array(z.string().trim().toLowerCase().min(1).max(60))
    .max(20)
    .transform((tags) => [...new Set(tags)]),
  employment_types: z
    .array(z.enum(EMPLOYMENT_TYPES))
    .max(4)
    .transform((types) => [...new Set(types)]),
  keywords: z.string().trim().max(2000).nullable().optional().default(null),
  salary_min: z.number().min(0).max(10_000_000).nullable().optional().default(null),
  salary_max: z.number().min(0).max(10_000_000).nullable().optional().default(null),
  government_only: z.boolean().optional().default(false),
  experience_levels: z
    .array(z.enum(EXPERIENCE_LEVELS))
    .max(3)
    .transform((v) => [...new Set(v)])
    .optional()
    .default([]),
  contract_types: z
    .array(z.enum(CONTRACT_TYPES))
    .max(2)
    .transform((v) => [...new Set(v)])
    .optional()
    .default([]),
  is_active: z.boolean().optional().default(true),
});

export async function GET() {
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const body: AlertsResponse = { alerts: (data ?? []) as Alert[] };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { error: "Could not load saved searches." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let input: z.infer<typeof AlertInputSchema>;
  try {
    const raw: unknown = await request.json();
    input = AlertInputSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "That saved search doesn't look right — check the name." },
      { status: 400 }
    );
  }
  try {
    const sb = getSupabase();
    const { data, error } = await sb
      .from("alerts")
      .insert(input)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ alert: data as Alert }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Could not save the search." },
      { status: 500 }
    );
  }
}
