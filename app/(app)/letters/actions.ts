"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

/** Confirm the chase action belongs to the caller's organisation. */
async function ownedChaseAction(chaseActionId: string, organisationId: string) {
  const db = await getDb();
  // A chase action hangs off either a moiety or a cycle; both roads lead to a contract.
  const viaMoiety = await db
    .select({ id: schema.chaseActions.id, orgId: schema.contracts.organisationId })
    .from(schema.chaseActions)
    .innerJoin(schema.moieties, eq(schema.chaseActions.moietyId, schema.moieties.id))
    .innerJoin(schema.contracts, eq(schema.moieties.contractId, schema.contracts.id))
    .where(eq(schema.chaseActions.id, chaseActionId))
    .limit(1);
  const viaCycle = await db
    .select({ id: schema.chaseActions.id, orgId: schema.contracts.organisationId })
    .from(schema.chaseActions)
    .innerJoin(schema.cycles, eq(schema.chaseActions.cycleId, schema.cycles.id))
    .innerJoin(schema.contracts, eq(schema.cycles.contractId, schema.contracts.id))
    .where(eq(schema.chaseActions.id, chaseActionId))
    .limit(1);
  const row = viaMoiety[0] ?? viaCycle[0];
  return row && row.orgId === organisationId ? row : null;
}

export async function markLetterSent(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("chaseActionId"));
  const owned = await ownedChaseAction(id, user.organisationId);
  if (!owned) return;
  const db = await getDb();
  await db
    .update(schema.chaseActions)
    .set({ sentAt: new Date() })
    .where(eq(schema.chaseActions.id, id));
  revalidatePath("/letters");
}
