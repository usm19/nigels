// Keeps a contract's two retention moiety rows in step with its retention
// terms and practical-completion date. Called after every contract edit.

import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { computeMoieties } from "@/lib/engine/retention";
import type { RetentionTerms } from "@/lib/engine/types";

export async function syncMoieties(contractId: string): Promise<void> {
  const db = await getDb();
  const [contract] = await db
    .select()
    .from(schema.contracts)
    .where(eq(schema.contracts.id, contractId))
    .limit(1);
  if (!contract) return;

  const terms = contract.retentionTerms as RetentionTerms | null;
  if (!terms || terms.percent <= 0) return;

  const schedule = computeMoieties({
    ...terms,
    contractValuePence: contract.valuePence,
    practicalCompletion: contract.practicalCompletion ?? undefined,
  });

  for (const kind of ["first", "second"] as const) {
    const m =
      kind === "first" ? schedule.firstMoiety : schedule.secondMoiety;
    const existing = await db
      .select()
      .from(schema.moieties)
      .where(
        and(
          eq(schema.moieties.contractId, contractId),
          eq(schema.moieties.kind, kind),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.moieties).values({
        contractId,
        kind,
        amountPence: m.amountPence,
        releaseDate: m.releaseDate ?? null,
        status: "accruing",
      });
    } else if (
      existing[0].status === "accruing" ||
      existing[0].status === "due"
    ) {
      // Released / chasing / written-off rows are never silently rewritten.
      await db
        .update(schema.moieties)
        .set({ amountPence: m.amountPence, releaseDate: m.releaseDate ?? null })
        .where(eq(schema.moieties.id, existing[0].id));
    }
  }
}
