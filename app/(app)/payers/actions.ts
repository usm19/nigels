"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

const payerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  companyNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,8}$/)
    .optional()
    .or(z.literal("")),
});

export async function createPayer(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser();
  const parsed = payerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      error:
        "Name is required. Company number, if given, must be the 8-character Companies House number.",
    };
  }
  const db = await getDb();
  const companyNumber = parsed.data.companyNumber || null;
  await db.insert(schema.payers).values({
    organisationId: user.organisationId,
    name: parsed.data.name,
    companyNumber,
  });
  if (companyNumber) {
    await db
      .insert(schema.payerWatch)
      .values({ companyNumber })
      .onConflictDoNothing();
  }
  revalidatePath("/payers");
  redirect("/payers");
}
