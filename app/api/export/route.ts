// "Your data, always with you": full-fidelity export of everything the
// organisation owns. GET /api/export?format=json for the complete record,
// or ?format=csv&table=contracts|cycles|moieties|letters for spreadsheets.

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/auth";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const db = await getDb();
  const orgId = user.organisationId;

  const payers = await db
    .select()
    .from(schema.payers)
    .where(eq(schema.payers.organisationId, orgId));
  const contracts = await db
    .select()
    .from(schema.contracts)
    .where(eq(schema.contracts.organisationId, orgId));
  const contractIds = new Set(contracts.map((c) => c.id));

  const allCycles = await db.select().from(schema.cycles);
  const cycles = allCycles.filter((c) => contractIds.has(c.contractId));
  const allMoieties = await db.select().from(schema.moieties);
  const moieties = allMoieties.filter((m) => contractIds.has(m.contractId));
  const moietyIds = new Set(moieties.map((m) => m.id));
  const cycleIds = new Set(cycles.map((c) => c.id));
  const allChase = await db.select().from(schema.chaseActions);
  const letters = allChase.filter(
    (l) =>
      (l.moietyId && moietyIds.has(l.moietyId)) ||
      (l.cycleId && cycleIds.has(l.cycleId)),
  );
  const alerts = await db
    .select()
    .from(schema.alerts)
    .where(eq(schema.alerts.organisationId, orgId));

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const table = url.searchParams.get("table") ?? "contracts";
    const data: Record<string, Record<string, unknown>[]> = {
      payers,
      contracts: contracts.map((c) => ({
        ...c,
        paymentTerms: JSON.stringify(c.paymentTerms),
        retentionTerms: JSON.stringify(c.retentionTerms),
      })),
      cycles,
      moieties,
      letters,
      alerts,
    };
    const rows = data[table];
    if (!rows) return NextResponse.json({ error: "unknown table" }, { status: 400 });
    return new NextResponse(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="moiety-${table}-${stamp}.csv"`,
      },
    });
  }

  const full = {
    exportedAt: new Date().toISOString(),
    organisation: { id: orgId, name: user.organisationName },
    payers,
    contracts,
    cycles,
    moieties,
    letters,
    alerts,
  };
  return new NextResponse(JSON.stringify(full, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="moiety-full-export-${stamp}.json"`,
    },
  });
}
