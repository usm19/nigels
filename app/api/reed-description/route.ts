import { NextResponse } from "next/server";
import { fetchReedFullDescriptionHtml } from "@/lib/server/reed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Full Reed advert description by Reed job id. Used by the detail view for both
 * live and applied Reed jobs (Reed's search API only returns a truncated
 * description). Public job data, no auth needed. Returns { html: null } on any
 * problem — the UI falls back to the stored snippet.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^\d{3,}$/.test(id)) {
    return NextResponse.json({ html: null });
  }
  try {
    const html = await fetchReedFullDescriptionHtml(id);
    return NextResponse.json({ html });
  } catch {
    return NextResponse.json({ html: null });
  }
}
