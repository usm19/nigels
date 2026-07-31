import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { assessCycle, resolveTerms } from "@/lib/engine/deadlines";
import type { PaymentTerms, RetentionTerms } from "@/lib/engine/types";
import { gbpExact, todayISO, ukDate } from "@/lib/format";
import { PrintButton } from "./print-button";

export default async function EvidencePackPage({
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
      payerCompanyNumber: schema.payers.companyNumber,
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
    .orderBy(asc(schema.cycles.applicationDate));
  const moieties = await db
    .select()
    .from(schema.moieties)
    .where(eq(schema.moieties.contractId, contract.id));
  const moietyLetters = await db
    .select({
      stage: schema.chaseActions.stage,
      scheduledFor: schema.chaseActions.scheduledFor,
      sentAt: schema.chaseActions.sentAt,
      bodyMarkdown: schema.chaseActions.bodyMarkdown,
    })
    .from(schema.chaseActions)
    .innerJoin(schema.moieties, eq(schema.chaseActions.moietyId, schema.moieties.id))
    .where(eq(schema.moieties.contractId, contract.id));
  const cycleLetters = await db
    .select({
      stage: schema.chaseActions.stage,
      scheduledFor: schema.chaseActions.scheduledFor,
      sentAt: schema.chaseActions.sentAt,
      bodyMarkdown: schema.chaseActions.bodyMarkdown,
    })
    .from(schema.chaseActions)
    .innerJoin(schema.cycles, eq(schema.chaseActions.cycleId, schema.cycles.id))
    .where(eq(schema.cycles.contractId, contract.id));
  const letters = [...moietyLetters, ...cycleLetters].sort((a, b) =>
    a.scheduledFor < b.scheduledFor ? -1 : 1,
  );

  const terms = resolveTerms(contract.paymentTerms as PaymentTerms);
  const retention = contract.retentionTerms as RetentionTerms | null;
  const today = todayISO();

  return (
    <main className="mx-auto max-w-3xl text-sm leading-relaxed">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <p className="text-neutral-500">
          Print this page (or save as PDF) for your records or an adjudicator.
        </p>
        <PrintButton />
      </div>

      <h1 className="text-xl font-semibold">
        Payment evidence pack — {contract.title}
      </h1>
      <p className="mb-6 text-neutral-600">
        {user.organisationName} · Payer: {contract.payerName}
        {contract.payerCompanyNumber && ` (Co. no. ${contract.payerCompanyNumber})`}{" "}
        · Prepared {ukDate(today)}
      </p>

      <h2 className="mb-2 mt-6 font-semibold">1. Contract terms as recorded</h2>
      <table className="w-full border-collapse [&_td]:border [&_td]:border-neutral-300 [&_td]:px-2 [&_td]:py-1">
        <tbody>
          <tr><td>Contract sum</td><td>{gbpExact(contract.valuePence)}</td></tr>
          <tr><td>Application day of month</td><td>{terms.applicationDayOfMonth}</td></tr>
          <tr><td>Days from application to due date</td><td>{terms.daysToDueDate}</td></tr>
          <tr><td>Days from due date to final date</td><td>{terms.daysDueToFinal}</td></tr>
          <tr><td>Payment notice period after due date</td><td>{terms.paymentNoticeDays} days</td></tr>
          <tr><td>Pay-less notice deadline before final date</td><td>{terms.payLessNoticeDaysBeforeFinal} days</td></tr>
          {retention && (
            <>
              <tr><td>Retention</td><td>{retention.percent}%</td></tr>
              <tr><td>Defects period</td><td>{retention.defectsPeriodMonths} months</td></tr>
            </>
          )}
          <tr>
            <td>Practical completion</td>
            <td>{contract.practicalCompletion ? ukDate(contract.practicalCompletion) : "not yet certified"}</td>
          </tr>
        </tbody>
      </table>

      <h2 className="mb-2 mt-6 font-semibold">2. Applications for payment</h2>
      {cycles.length === 0 && <p>No applications recorded.</p>}
      {cycles.map((c) => {
        const a = assessCycle(c.applicationDate, contract.paymentTerms as PaymentTerms, {
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
        });
        return (
          <div key={c.id} className="mb-4 rounded border border-neutral-300 p-3">
            <p className="font-medium">
              Application dated {ukDate(c.applicationDate)} — {gbpExact(c.appliedPence)}
            </p>
            <ul className="mt-1 list-inside list-disc">
              <li>Payment due date: {ukDate(a.timeline.dueDate)}</li>
              <li>
                Payment notice deadline: {ukDate(a.timeline.paymentNoticeDeadline)} —{" "}
                {c.paymentNoticeDate
                  ? `notice received ${ukDate(c.paymentNoticeDate)} for ${gbpExact(c.paymentNoticePence ?? 0)}`
                  : "no payment notice received"}
              </li>
              <li>
                Pay-less notice deadline: {ukDate(a.timeline.payLessNoticeDeadline)} —{" "}
                {c.payLessNoticeDate
                  ? `notice received ${ukDate(c.payLessNoticeDate)} for ${gbpExact(c.payLessNoticePence ?? 0)}`
                  : "no pay-less notice received"}
              </li>
              <li>Final date for payment: {ukDate(a.timeline.finalDateForPayment)}</li>
              <li>
                Notified sum: {gbpExact(a.notifiedSumPence)} (basis: {a.basis}
                {a.smashAndGrab && " — no valid notice served in time; the application stands as the notified sum under s.110B HGCRA 1996"})
              </li>
              <li>Paid to date: {gbpExact(c.paidPence)}; outstanding: {gbpExact(a.shortfallPence)}</li>
            </ul>
          </div>
        );
      })}

      {moieties.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-semibold">3. Retention</h2>
          <table className="w-full border-collapse [&_td]:border [&_td]:border-neutral-300 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-neutral-300 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
            <thead>
              <tr><th>Moiety</th><th>Amount</th><th>Release date</th><th>Status</th></tr>
            </thead>
            <tbody>
              {moieties.map((m) => (
                <tr key={m.id}>
                  <td>{m.kind === "first" ? "First half" : "Second half"}</td>
                  <td>{gbpExact(m.amountPence)}</td>
                  <td>{m.releaseDate ? ukDate(m.releaseDate) : "awaits practical completion"}</td>
                  <td>{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {letters.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-semibold">4. Correspondence generated</h2>
          {letters.map((l, i) => (
            <div key={i} className="mb-4 rounded border border-neutral-300 p-3">
              <p className="mb-1 text-neutral-500">
                {l.stage} · scheduled {ukDate(l.scheduledFor)}
                {l.sentAt && ` · sent ${l.sentAt.toISOString().slice(0, 10)}`}
              </p>
              <pre className="whitespace-pre-wrap font-sans">
                {l.bodyMarkdown.replaceAll("**", "")}
              </pre>
            </div>
          ))}
        </>
      )}
    </main>
  );
}
