"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { runScan } from "@/lib/scan";

export async function runChecksNow(): Promise<void> {
  const user = await requireUser();
  await runScan(user.organisationId);
  revalidatePath("/alerts");
  revalidatePath("/letters");
  revalidatePath("/dashboard");
}

export async function acknowledgeAlert(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = z.string().uuid().parse(formData.get("alertId"));
  const db = await getDb();
  await db
    .update(schema.alerts)
    .set({ acknowledgedAt: new Date() })
    .where(
      and(
        eq(schema.alerts.id, id),
        eq(schema.alerts.organisationId, user.organisationId),
      ),
    );
  revalidatePath("/alerts");
}
