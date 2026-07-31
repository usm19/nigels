import { assessCycle } from "@/lib/engine/deadlines";
import { computeMoieties } from "@/lib/engine/retention";

// Demo data wired through the real engine so the dashboard shell exercises
// the actual domain logic. Replaced by database queries once auth lands.
const demo = {
  contracts: [
    {
      title: "Walsall depot rewire",
      payer: "BuildCo Midlands Ltd",
      cycle: assessCycle("2026-06-25", { applicationDayOfMonth: 25 }, {
        appliedPence: 6_100_000,
        paymentNotice: { date: "2026-07-08", amountPence: 5_400_000 }, // late
        paidPence: 5_400_000,
      }),
      retention: computeMoieties({
        percent: 3,
        contractValuePence: 22_000_000,
        practicalCompletion: undefined,
        defectsPeriodMonths: 12,
      }),
    },
    {
      title: "Coventry school block B",
      payer: "Marchmont Construction",
      cycle: assessCycle("2026-06-25", { applicationDayOfMonth: 25 }, {
        appliedPence: 3_200_000,
        paymentNotice: { date: "2026-07-03", amountPence: 3_200_000 },
        paidPence: 3_200_000,
      }),
      retention: computeMoieties({
        percent: 5,
        contractValuePence: 9_600_000,
        practicalCompletion: "2025-07-10",
        defectsPeriodMonths: 12,
      }),
    },
  ],
};

const gbp = (pence: number) =>
  (pence / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });

export default function Dashboard() {
  const shortfall = demo.contracts.reduce(
    (sum, c) => sum + c.cycle.shortfallPence,
    0,
  );
  const retentionHeld = demo.contracts.reduce(
    (sum, c) => sum + c.retention.totalRetentionPence,
    0,
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl p-8 font-sans">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight">Moiety</h1>
        <p className="text-sm text-neutral-500">
          Payment control for subcontractors — foundation build
        </p>
      </header>

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 p-6">
          <p className="text-sm text-neutral-500">Held or unpaid right now</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums">
            {gbp(shortfall + retentionHeld)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-6">
          <p className="text-sm text-neutral-500">Of which retention</p>
          <p className="mt-1 text-4xl font-semibold tabular-nums">
            {gbp(retentionHeld)}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-neutral-500">
          Live contracts
        </h2>
        <ul className="space-y-3">
          {demo.contracts.map((c) => (
            <li
              key={c.title}
              className="rounded-xl border border-neutral-200 p-5"
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="font-medium">{c.title}</p>
                  <p className="text-sm text-neutral-500">{c.payer}</p>
                </div>
                <div className="text-right">
                  {c.cycle.smashAndGrab ? (
                    <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                      Notice missed — full {gbp(c.cycle.notifiedSumPence)}{" "}
                      payable
                    </span>
                  ) : c.cycle.overdue(today) ? (
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      Overdue {gbp(c.cycle.shortfallPence)}
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      On track
                    </span>
                  )}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-neutral-500">Final date</dt>
                  <dd className="tabular-nums">
                    {c.cycle.timeline.finalDateForPayment}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Notified sum</dt>
                  <dd className="tabular-nums">{gbp(c.cycle.notifiedSumPence)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Retention held</dt>
                  <dd className="tabular-nums">
                    {gbp(c.retention.totalRetentionPence)}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-500">2nd moiety due</dt>
                  <dd className="tabular-nums">
                    {c.retention.secondMoiety.releaseDate ?? "—"}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
