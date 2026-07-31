"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { syncMoieties } from "@/lib/moieties";
import type { PaymentTerms, RetentionTerms } from "@/lib/engine/types";

// ---------- shared helpers ----------

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.coerce
  .number()
  .min(0)
  .max(1_000_000_000)
  .transform((gbpAmount) => Math.round(gbpAmount * 100)); // form takes £, DB stores pence

/** Confirm the contract belongs to the caller's organisation; return it. */
async function ownContract(contractId: string, organisationId: string) {
  const db = await getDb();
  const [contract] = await db
    .select()
    .from(schema.contracts)
    .where(
      and(
        eq(schema.contracts.id, contractId),
        eq(schema.contracts.organisationId, organisationId),
      ),
    )
    .limit(1);
  return contract ?? null;
}

// ---------- create contract ----------

const contractSchema = z.object({
  title: z.string().trim().min(2).max(200),
  payerId: z.string().uuid(),
  valueGbp: money,
  applicationDayOfMonth: z.coerce.number().int().min(1).max(28),
  daysToDueDate: z.coerce.number().int().min(0).max(60).optional(),
  daysDueToFinal: z.coerce.number().int().min(1).max(90).optional(),
  payLessNoticeDaysBeforeFinal: z.coerce.number().int().min(1).max(30).optional(),
  retentionPercent: z.coerce.number().min(0).max(10).default(0),
  defectsPeriodMonths: z.coerce.number().int().min(0).max(36).default(12),
  practicalCompletion: isoDate.optional().or(z.literal("")),
});

export async function createContract(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const raw = Object.fromEntries(
    [...formData.entries()].filter(([, v]) => v !== ""),
  );
  const parsed = contractSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Check the form — a required field is missing or out of range." };
  }
  const d = parsed.data;
  const db = await getDb();

  // The payer must belong to this organisation.
  const [payer] = await db
    .select({ id: schema.payers.id })
    .from(schema.payers)
    .where(
      and(
        eq(schema.payers.id, d.payerId),
        eq(schema.payers.organisationId, user.organisationId),
      ),
    )
    .limit(1);
  if (!payer) return { error: "Unknown payer." };

  const paymentTerms: PaymentTerms = {
    applicationDayOfMonth: d.applicationDayOfMonth,
    ...(d.daysToDueDate !== undefined && { daysToDueDate: d.daysToDueDate }),
    ...(d.daysDueToFinal !== undefined && { daysDueToFinal: d.daysDueToFinal }),
    ...(d.payLessNoticeDaysBeforeFinal !== undefined && {
      payLessNoticeDaysBeforeFinal: d.payLessNoticeDaysBeforeFinal,
    }),
  };
  const retentionTerms: RetentionTerms | null =
    d.retentionPercent > 0
      ? {
          percent: d.retentionPercent,
          contractValuePence: d.valueGbp,
          defectsPeriodMonths: d.defectsPeriodMonths,
        }
      : null;

  const [contract] = await db
    .insert(schema.contracts)
    .values({
      organisationId: user.organisationId,
      payerId: d.payerId,
      title: d.title,
      valuePence: d.valueGbp,
      paymentTerms,
      retentionTerms,
      practicalCompletion: d.practicalCompletion || null,
    })
    .returning({ id: schema.contracts.id });

  await syncMoieties(contract.id);
  revalidatePath("/contracts");
  redirect(`/contracts/${contract.id}`);
}

// ---------- set practical completion ----------

export async function setPracticalCompletion(formData: FormData): Promise<void> {
  const user = await requireUser();
  const contractId = z.string().uuid().parse(formData.get("contractId"));
  const date = isoDate.parse(formData.get("date"));
  const contract = await ownContract(contractId, user.organisationId);
  if (!contract) return;
  const db = await getDb();
  await db
    .update(schema.contracts)
    .set({ practicalCompletion: date })
    .where(eq(schema.contracts.id, contractId));
  await syncMoieties(contractId);
  revalidatePath(`/contracts/${contractId}`);
}

// ---------- cycles ----------

const newCycleSchema = z.object({
  contractId: z.string().uuid(),
  applicationDate: isoDate,
  appliedGbp: money,
});

export async function createCycle(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = newCycleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter the application date and amount." };
  const contract = await ownContract(parsed.data.contractId, user.organisationId);
  if (!contract) return { error: "Unknown contract." };
  const db = await getDb();
  await db.insert(schema.cycles).values({
    contractId: contract.id,
    applicationDate: parsed.data.applicationDate,
    appliedPence: parsed.data.appliedGbp,
  });
  revalidatePath(`/contracts/${contract.id}`);
  return {};
}

const noticeSchema = z.object({
  contractId: z.string().uuid(),
  cycleId: z.string().uuid(),
  kind: z.enum(["payment-notice", "pay-less-notice", "payment"]),
  date: isoDate.optional().or(z.literal("")),
  amountGbp: money,
});

/** Record what the payer did: a payment notice, a pay-less notice, or money received. */
export async function recordCycleEvent(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = noticeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the date and amount." };
  const d = parsed.data;
  const contract = await ownContract(d.contractId, user.organisationId);
  if (!contract) return { error: "Unknown contract." };

  const db = await getDb();
  const [cycle] = await db
    .select({ id: schema.cycles.id, paidPence: schema.cycles.paidPence })
    .from(schema.cycles)
    .where(
      and(
        eq(schema.cycles.id, d.cycleId),
        eq(schema.cycles.contractId, contract.id),
      ),
    )
    .limit(1);
  if (!cycle) return { error: "Unknown cycle." };

  if (d.kind === "payment") {
    await db
      .update(schema.cycles)
      .set({ paidPence: cycle.paidPence + d.amountGbp })
      .where(eq(schema.cycles.id, cycle.id));
  } else if (d.kind === "payment-notice") {
    if (!d.date) return { error: "The notice date is required." };
    await db
      .update(schema.cycles)
      .set({ paymentNoticeDate: d.date, paymentNoticePence: d.amountGbp })
      .where(eq(schema.cycles.id, cycle.id));
  } else {
    if (!d.date) return { error: "The notice date is required." };
    await db
      .update(schema.cycles)
      .set({ payLessNoticeDate: d.date, payLessNoticePence: d.amountGbp })
      .where(eq(schema.cycles.id, cycle.id));
  }
  revalidatePath(`/contracts/${contract.id}`);
  return {};
}

// ---------- moiety release ----------

export async function markMoietyReleased(formData: FormData): Promise<void> {
  const user = await requireUser();
  const moietyId = z.string().uuid().parse(formData.get("moietyId"));
  const db = await getDb();
  const [row] = await db
    .select({
      id: schema.moieties.id,
      contractId: schema.moieties.contractId,
      orgId: schema.contracts.organisationId,
    })
    .from(schema.moieties)
    .innerJoin(
      schema.contracts,
      eq(schema.moieties.contractId, schema.contracts.id),
    )
    .where(eq(schema.moieties.id, moietyId))
    .limit(1);
  if (!row || row.orgId !== user.organisationId) return;
  await db
    .update(schema.moieties)
    .set({ status: "released" })
    .where(eq(schema.moieties.id, moietyId));
  revalidatePath(`/contracts/${row.contractId}`);
}
