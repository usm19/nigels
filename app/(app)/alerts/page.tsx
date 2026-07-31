import Link from "next/link";
import { desc, eq, isNull, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { acknowledgeAlert, runChecksNow } from "./actions";

const KIND_STYLES: Record<string, string> = {
  "smash-and-grab": "bg-red-50 text-red-700",
  "payer-risk": "bg-red-50 text-red-700",
  "moiety-due": "bg-amber-50 text-amber-700",
  "deadline-approaching": "bg-amber-50 text-amber-700",
};

const KIND_LABELS: Record<string, string> = {
  "smash-and-grab": "Notice missed",
  "payer-risk": "Payer risk",
  "moiety-due": "Retention due",
  "deadline-approaching": "Deadline",
};

export default async function AlertsPage() {
  const user = await requireUser();
  const db = await getDb();
  const alerts = await db
    .select()
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.organisationId, user.organisationId),
        isNull(schema.alerts.acknowledgedAt),
      ),
    )
    .orderBy(desc(schema.alerts.createdAt));

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Alerts</h1>
        <form action={runChecksNow}>
          <button className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium">
            Run checks now
          </button>
        </form>
      </div>
      {alerts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Nothing needs your attention. Checks run automatically every day.
        </p>
      ) : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a.id} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span
                    className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${KIND_STYLES[a.kind] ?? "bg-neutral-100 text-neutral-600"}`}
                  >
                    {KIND_LABELS[a.kind] ?? a.kind}
                  </span>
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-1 text-sm text-neutral-600">{a.detail}</p>
                  {a.contractId && (
                    <Link
                      href={`/contracts/${a.contractId}`}
                      className="mt-1 inline-block text-sm underline"
                    >
                      Open contract
                    </Link>
                  )}
                </div>
                <form action={acknowledgeAlert}>
                  <input type="hidden" name="alertId" value={a.id} />
                  <button className="text-sm text-neutral-500 underline">
                    Dismiss
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
