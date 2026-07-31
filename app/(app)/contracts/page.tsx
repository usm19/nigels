import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { gbp } from "@/lib/format";

export default async function ContractsPage() {
  const user = await requireUser();
  const db = await getDb();
  const contracts = await db
    .select({
      id: schema.contracts.id,
      title: schema.contracts.title,
      valuePence: schema.contracts.valuePence,
      payerName: schema.payers.name,
      archived: schema.contracts.archived,
    })
    .from(schema.contracts)
    .innerJoin(schema.payers, eq(schema.contracts.payerId, schema.payers.id))
    .where(eq(schema.contracts.organisationId, user.organisationId))
    .orderBy(desc(schema.contracts.createdAt));

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contracts</h1>
        <div className="flex gap-3">
          <Link
            href="/contracts/import"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium"
          >
            Import from PDF
          </Link>
          <Link
            href="/contracts/new"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Add contract
          </Link>
        </div>
      </div>
      {contracts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          No contracts yet. Add your live jobs — payment deadlines and
          retentions are tracked from the moment a contract exists.
        </p>
      ) : (
        <ul className="space-y-2">
          {contracts
            .filter((c) => !c.archived)
            .map((c) => (
              <li key={c.id}>
                <Link
                  href={`/contracts/${c.id}`}
                  className="flex items-center justify-between rounded-xl border border-neutral-200 p-4 hover:bg-neutral-50"
                >
                  <div>
                    <p className="font-medium">{c.title}</p>
                    <p className="text-sm text-neutral-500">{c.payerName}</p>
                  </div>
                  <p className="text-sm tabular-nums text-neutral-600">
                    {gbp(c.valuePence)}
                  </p>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </main>
  );
}
