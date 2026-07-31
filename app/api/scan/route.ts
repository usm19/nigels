// Cron entry point: POST /api/scan with "Authorization: Bearer $SCAN_TOKEN".
// Point any scheduler (Render cron, GitHub Action, cron-job.org) at this daily.

import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/scan";

export async function POST(req: NextRequest) {
  const token = process.env.SCAN_TOKEN;
  const auth = req.headers.get("authorization");
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  const result = await runScan();
  return NextResponse.json(result);
}
