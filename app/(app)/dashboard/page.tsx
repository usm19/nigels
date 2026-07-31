import Link from "next/link";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { assessCycle } from "@/lib/engine/deadlines";
import type { PaymentTerms } from "@/lib/engine/types";
import { gbp, todayISO, ukDate } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await getDb();
  const today = todayISO();

  const contracts = await db
    .select({
      id: schema.contracts.id,
      title: schema.contracts.title,
      paymentTerms: schema.contracts.paymentTerms,
      payerName: schema.payers.name,
    })
    .from(schema.contracts)
    .innerJoin(schema.payers, eq(schema.contracts.payerId, schema.payers.id))
    .where(
      and(
        eq(schema.contracts.organisationId, user.organisationId),
        eq(schema.contracts.archived, false),
      ),
    );

  let shortfallTotal = 0;
  let overdueTotal = 0;
  const contractSummaries: {
    id: string;
    title: string;
    payerName: string;
    shortfall: number;
    worstBadge: "smash" | "overdue" | "ok" | "none";
  }[] = [];

  for (const contract of contracts) {
    const cycles = await db
      .select()
      .from(schema.cycles)
      .where(eq(schema.cycles.contractId, contract.id));
    let shortfall = 0;
    let worst: "smash" | "overdue" | "ok" | "none" = cycles.length
      ? "ok"
      : "none";
    for (const c of cycles) {
      const a = assessCycle(
        c.applicationDate,
        contract.paymentTerms as PaymentTerms,
        {
          appliedPence: c.appliedPence,
          paymentNotice:
            c.paymentNoticeDate && c.paymentNoticePence !== null
              ? { date: c.paymentNoticeDate, amountPence: c.paymentNoticePence }
              : undefined,
          payLessNotice:
            c.payLessNoticeDate && c.payLessNoticePence !== null
              ? { date: c.payLessNoticeDate, amountPence: c.payLessNoticePence }
              : undefined,
          paidPence: c.paidPence,
        },
      );
      shortfall += a.shortfallPence;
      if (a.smashAndGrab) worst = "smash";
      else if (a.overdue(today) && worst !== "smash") worst = "overdue";
      if (a.overdue(today)) overdueTotal += a.shortfallPence;
    }
    shortfallTotal += shortfall;
    contractSummaries.push({
      id: contract.id,
      title: contract.title,
      payerName: contract.payerName,
      shortfall,
      worstBadge: worst,
    });
  }

  // Retention held (not yet released or written off)
  const moieties = await db
    .select({
      amountPence: schema.moieties.amountPence,
      status: schema.moieties.status,
      releaseDate: schema.moieties.releaseDate,
      contractId: schema.moieties.contractId,
      title: schema.contracts.title,
    })
    .from(schema.moieties)
    .innerJoin(
      schema.contracts,
      eq(schema.moieties.contractId, schema.contracts.id),
    )
    .where(
      and(
        eq(schema.contracts.organisationId, user.organisationId),
        ne(schema.moieties.status, "released"),
        ne(schema.moieties.status, "written-off"),
      ),
    );
  const retentionHeld = moieties.reduce((s, m) => s + m.amountPence, 0);
  const retentionDue = moieties
    .filter((m) => m.releaseDate && m.releaseDate <= today)
    .reduce((s, m) => s + m.amountPence, 0);

  const liveAlerts = await db
    .select()
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.organisationId, user.organisationId),
        isNull(schema.alerts.acknowledgedAt),
      ),
    )
    .orderBy(desc(schema.alerts.createdAt))
    .limit(5);

  const upcoming: { date: string; label: string; contractId: string }[] = [];
  for (const m of moieties) {
    if (m.releaseDate && m.releaseDate > today) {
      upcoming.push({
        date: m.releaseDate,
        label: `Retention release — ${m.title}`,
        contractId: m.contractId,
      });
    }
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Dashboard</h1>

      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 p-6">
          <p className="text-sm text-neutral-500">Held or unpaid right now</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {gbp(shortfallTotal + retentionHeld)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-6">
          <p className="text-sm text-neutral-500">Retention releasable now</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {gbp(retentionDue)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-6">
          <p className="text-sm text-neutral-500">Overdue past final date</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">
            {gbp(overdueTotal)}
          </p>
        </div>
      </section>

      {liveAlerts.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
              Needs attention
            </h2>
            <Link href="/alerts" className="text-sm underline">
              All alerts
            </Link>
          </div>
          <ul className="space-y-2">
            {liveAlerts.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-neutral-200 p-4 text-sm"
              >
                <p className="font-medium">{a.title}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Contracts
          </h2>
          <Link href="/contracts" className="text-sm underline">
            All contracts
          </Link>
        </div>
        {contractSummaries.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
            Add your first contract to start tracking money.{" "}
            <Link href="/contracts/new" className="underline">
              Add contract
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {contractSummaries.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/contracts/${c.id}`}
                  className="flex items-center justify-between rounded-xl border border-neutral-200 p-4 hover:bg-neutral-50"
                >
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-sm text-neutral-500">{c.payerName}</p>
                  </div>
                  <div className="text-right text-sm">
                    {c.worstBadge === "smash" ? (
                      <span className="rounded-full bg-red-50 px-3 py-1 font-medium text-red-700">
                        Notice missed
                      </span>
                    ) : c.worstBadge === "overdue" ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">
                        Overdue {gbp(c.shortfall)}
                      </span>
                    ) : c.worstBadge === "ok" ? (
                      <span className="text-neutral-500 tabular-nums">
                        {c.shortfall > 0 ? `${gbp(c.shortfall)} outstanding` : "Settled"}
                      </span>
                    ) : (
                      <span className="text-neutral-400">no applications yet</span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Coming up
          </h2>
          <ul className="space-y-1 text-sm">
            {upcoming.slice(0, 6).map((u, i) => (
              <li key={i} className="flex justify-between rounded-lg px-1 py-1.5">
                <Link href={`/contracts/${u.contractId}`} className="hover:underline">
                  {u.label}
                </Link>
                <span className="tabular-nums text-neutral-500">
                  {ukDate(u.date)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
