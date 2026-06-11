import { NextResponse } from "next/server";
import { z } from "zod";
import type { Alert, AlertsResponse } from "@/lib/types";
import { EMPLOYMENT_TYPES } from "@/lib/types";
import { getSupabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      { error: "Could not load alerts." },
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
      { error: "That alert doesn't look right — check the name and tags." },
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
      { error: "Could not save the alert." },
      { status: 500 }
    );
  }
}
