import { requireUser } from "@/lib/auth";

export default async function ExportPage() {
  await requireUser();
  const tables = ["payers", "contracts", "cycles", "moieties", "letters", "alerts"];
  return (
    <main className="max-w-xl">
      <h1 className="mb-2 text-xl font-semibold">Your data, always with you</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Everything your firm holds in Moiety, in open formats you keep
        yourself. Download these regularly (or after any big change) — if this
        service is ever unreachable, your complete money trail is still in
        your hands. Each contract also has a printable evidence pack on its
        own page.
      </p>

      <section className="mb-8 rounded-xl border border-neutral-200 p-5">
        <h2 className="font-medium">Complete record (JSON)</h2>
        <p className="mb-3 mt-1 text-sm text-neutral-500">
          Every payer, contract, application, retention, letter, and alert in
          one machine-readable file.
        </p>
        <a
          href="/api/export?format=json"
          className="inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
        >
          Download full export
        </a>
      </section>

      <section className="rounded-xl border border-neutral-200 p-5">
        <h2 className="font-medium">Spreadsheets (CSV)</h2>
        <p className="mb-3 mt-1 text-sm text-neutral-500">
          Per-table files that open directly in Excel.
        </p>
        <div className="flex flex-wrap gap-2">
          {tables.map((t) => (
            <a
              key={t}
              href={`/api/export?format=csv&table=${t}`}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
            >
              {t}.csv
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
