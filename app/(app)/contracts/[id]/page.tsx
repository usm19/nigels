import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { assessCycle } from "@/lib/engine/deadlines";
import type { PaymentTerms, RetentionTerms } from "@/lib/engine/types";
import { gbp, todayISO, ukDate } from "@/lib/format";
import { markMoietyReleased, setPracticalCompletion } from "../actions";
import { CycleForms, NewCycleForm } from "./forms";

export default async function ContractPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const db = await getDb();

  const [contract] = await db
    .select({
      id: schema.contracts.id,
      title: schema.contracts.title,
      valuePence: schema.contracts.valuePence,
      paymentTerms: schema.contracts.paymentTerms,
      retentionTerms: schema.contracts.retentionTerms,
      practicalCompletion: schema.contracts.practicalCompletion,
      payerName: schema.payers.name,
    })
    .from(schema.contracts)
    .innerJoin(schema.payers, eq(schema.contracts.payerId, schema.payers.id))
    .where(
      and(
        eq(schema.contracts.id, id),
        eq(schema.contracts.organisationId, user.organisationId),
      ),
    )
    .limit(1);
  if (!contract) notFound();

  const cycles = await db
    .select()
    .from(schema.cycles)
    .where(eq(schema.cycles.contractId, contract.id))
    .orderBy(desc(schema.cycles.applicationDate));

  const moieties = await db
    .select()
    .from(schema.moieties)
    .where(eq(schema.moieties.contractId, contract.id));

  const terms = contract.paymentTerms as PaymentTerms;
  const retention = contract.retentionTerms as RetentionTerms | null;
  const today = todayISO();

  const assessed = cycles.map((c) => ({
    cycle: c,
    a: assessCycle(c.applicationDate, terms, {
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
    }),
  }));

  return (
    <main>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{contract.title}</h1>
          <p className="text-sm text-neutral-500">
            {contract.payerName} · {gbp(contract.valuePence)}
            {retention && ` · ${retention.percent}% retention`}
          </p>
        </div>
        <Link
          href={`/contracts/${contract.id}/pack`}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
        >
          Evidence pack
        </Link>
      </div>

      {/* Practical completion */}
      <section className="mb-8 rounded-xl border border-neutral-200 p-4">
        {contract.practicalCompletion ? (
          <p className="text-sm">
            Practical completion:{" "}
            <span className="font-medium">
              {ukDate(contract.practicalCompletion)}
            </span>
          </p>
        ) : (
          <form
            action={setPracticalCompletion}
            className="flex items-end gap-3 text-sm"
          >
            <input type="hidden" name="contractId" value={contract.id} />
            <label>
              Practical completion date (sets retention release dates)
              <input
                type="date"
                name="date"
                required
                className="mt-1 block rounded-lg border border-neutral-300 px-3 py-2"
              />
            </label>
            <button className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white">
              Set
            </button>
          </form>
        )}
      </section>

      {/* Retention moieties */}
      {moieties.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
            Retention
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {moieties.map((m) => (
              <li key={m.id} className="rounded-xl border border-neutral-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-neutral-500">
                    {m.kind === "first" ? "First half" : "Second half"}
                  </p>
                  <span
                    className={
                      m.status === "released"
                        ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
                        : m.releaseDate && m.releaseDate <= today
                          ? "rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                          : "rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600"
                    }
                  >
                    {m.status === "released"
                      ? "Released"
                      : m.releaseDate && m.releaseDate <= today
                        ? "DUE — chase running"
                        : m.releaseDate
                          ? `Due ${ukDate(m.releaseDate)}`
                          : "Accruing"}
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {gbp(m.amountPence)}
                </p>
                {m.status !== "released" && (
                  <form action={markMoietyReleased} className="mt-2">
                    <input type="hidden" name="moietyId" value={m.id} />
                    <button className="text-xs text-neutral-500 underline">
                      Mark as released (paid)
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Cycles */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Applications for payment
          </h2>
        </div>
        <NewCycleForm contractId={contract.id} />
        <ul className="mt-4 space-y-3">
          {assessed.map(({ cycle, a }) => (
            <li key={cycle.id} className="rounded-xl border border-neutral-200 p-5">
              <div className="flex items-baseline justify-between">
                <p className="font-medium">
                  Applied {ukDate(cycle.applicationDate)} —{" "}
                  {gbp(cycle.appliedPence)}
                </p>
                {a.smashAndGrab ? (
                  <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                    No valid notice — full {gbp(a.notifiedSumPence)} payable
                  </span>
                ) : a.overdue(today) ? (
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                    Overdue {gbp(a.shortfallPence)}
                  </span>
                ) : a.shortfallPence > 0 ? (
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                    {gbp(a.shortfallPence)} outstanding, final date{" "}
                    {ukDate(a.timeline.finalDateForPayment)}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Settled
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-neutral-500">Due date</dt>
                  <dd className="tabular-nums">{ukDate(a.timeline.dueDate)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Their notice deadline</dt>
                  <dd className="tabular-nums">
                    {ukDate(a.timeline.paymentNoticeDeadline)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Pay-less deadline</dt>
                  <dd className="tabular-nums">
                    {ukDate(a.timeline.payLessNoticeDeadline)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Final date</dt>
                  <dd className="tabular-nums">
                    {ukDate(a.timeline.finalDateForPayment)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Notified sum</dt>
                  <dd className="tabular-nums">
                    {gbp(a.notifiedSumPence)}{" "}
                    <span className="text-neutral-400">({a.basis})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Paid</dt>
                  <dd className="tabular-nums">{gbp(cycle.paidPence)}</dd>
                </div>
              </dl>
              <CycleForms contractId={contract.id} cycleId={cycle.id} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
