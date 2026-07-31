import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

type RiskSignals = {
  level?: "ok" | "watch" | "danger";
  reasons?: string[];
  companyName?: string;
} | null;

export default async function PayersPage() {
  const user = await requireUser();
  const db = await getDb();
  const payers = await db
    .select({
      id: schema.payers.id,
      name: schema.payers.name,
      companyNumber: schema.payers.companyNumber,
      signals: schema.payerWatch.signals,
      lastCheckedAt: schema.payerWatch.lastCheckedAt,
    })
    .from(schema.payers)
    .leftJoin(
      schema.payerWatch,
      eq(schema.payers.companyNumber, schema.payerWatch.companyNumber),
    )
    .where(eq(schema.payers.organisationId, user.organisationId))
    .orderBy(desc(schema.payers.createdAt));

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Payers (main contractors)</h1>
        <Link
          href="/payers/new"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Add payer
        </Link>
      </div>
      {payers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No payers yet. Add the main contractors you work for — each one with
          a company number is watched for insolvency warning signs.
        </p>
      ) : (
        <ul className="space-y-2">
          {payers.map((p) => {
            const s = p.signals as RiskSignals;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 p-4"
              >
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-sm text-neutral-500">
                    {p.companyNumber
                      ? `Company no. ${p.companyNumber}`
                      : "No company number — not watched"}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {!p.companyNumber ? (
                    <span className="text-neutral-400">unwatched</span>
                  ) : s?.level === "danger" ? (
                    <span className="rounded-full bg-red-50 px-3 py-1 font-medium text-red-700">
                      Risk: {s.reasons?.[0] ?? "signals found"}
                    </span>
                  ) : s?.level === "watch" ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
                      Watch: {s.reasons?.[0] ?? "minor signals"}
                    </span>
                  ) : s?.level === "ok" ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                      No warning signs
                    </span>
                  ) : (
                    <span className="text-neutral-400">not yet checked</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
