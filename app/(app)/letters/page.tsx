import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { todayISO, ukDate } from "@/lib/format";
import { markLetterSent } from "./actions";

export default async function LettersPage() {
  const user = await requireUser();
  const db = await getDb();

  // All chase actions for this organisation, via either parent.
  const viaMoiety = await db
    .select({
      id: schema.chaseActions.id,
      stage: schema.chaseActions.stage,
      scheduledFor: schema.chaseActions.scheduledFor,
      sentAt: schema.chaseActions.sentAt,
      bodyMarkdown: schema.chaseActions.bodyMarkdown,
      contractTitle: schema.contracts.title,
    })
    .from(schema.chaseActions)
    .innerJoin(schema.moieties, eq(schema.chaseActions.moietyId, schema.moieties.id))
    .innerJoin(schema.contracts, eq(schema.moieties.contractId, schema.contracts.id))
    .where(eq(schema.contracts.organisationId, user.organisationId));
  const viaCycle = await db
    .select({
      id: schema.chaseActions.id,
      stage: schema.chaseActions.stage,
      scheduledFor: schema.chaseActions.scheduledFor,
      sentAt: schema.chaseActions.sentAt,
      bodyMarkdown: schema.chaseActions.bodyMarkdown,
      contractTitle: schema.contracts.title,
    })
    .from(schema.chaseActions)
    .innerJoin(schema.cycles, eq(schema.chaseActions.cycleId, schema.cycles.id))
    .innerJoin(schema.contracts, eq(schema.cycles.contractId, schema.contracts.id))
    .where(eq(schema.contracts.organisationId, user.organisationId))
    .orderBy(desc(schema.chaseActions.scheduledFor));

  const all = [...viaMoiety, ...viaCycle].sort((a, b) =>
    a.scheduledFor < b.scheduledFor ? 1 : -1,
  );
  const today = todayISO();
  const ready = all.filter((l) => !l.sentAt && l.scheduledFor <= today);
  const upcoming = all.filter((l) => !l.sentAt && l.scheduledFor > today);
  const sent = all.filter((l) => l.sentAt);

  const STAGE_LABELS: Record<string, string> = {
    reminder: "Reminder",
    "formal-demand": "Formal demand",
    "notice-before-action": "Notice before action",
  };

  const renderSection = (
    title: string,
    letters: typeof all,
    showSend: boolean,
  ) =>
    letters.length === 0 ? null : (
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          {title}
        </h2>
        <ul className="space-y-3">
          {letters.map((l) => (
            <li key={l.id} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {STAGE_LABELS[l.stage] ?? l.stage} — {l.contractTitle}
                </p>
                <p className="text-sm text-neutral-500">
                  {l.sentAt
                    ? `Sent ${l.sentAt.toISOString().slice(0, 10)}`
                    : `Scheduled ${ukDate(l.scheduledFor)}`}
                </p>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-neutral-500">
                  View letter
                </summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-neutral-50 p-4 font-sans text-sm">
                  {l.bodyMarkdown.replaceAll("**", "")}
                </pre>
              </details>
              {showSend && (
                <form action={markLetterSent} className="mt-3">
                  <input type="hidden" name="chaseActionId" value={l.id} />
                  <button className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
                    Mark as sent
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <main>
      <h1 className="mb-6 text-xl font-semibold">Chase letters</h1>
      {all.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No letters yet. Letters are prepared automatically when retentions
          fall due or a payer misses a statutory deadline.
        </p>
      )}
      {renderSection("Ready to send", ready, true)}
      {renderSection("Upcoming", upcoming, false)}
      {renderSection("Sent", sent, false)}
    </main>
  );
}
