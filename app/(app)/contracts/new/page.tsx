import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ContractForm } from "./form";

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const db = await getDb();
  const payers = await db
    .select({ id: schema.payers.id, name: schema.payers.name })
    .from(schema.payers)
    .where(eq(schema.payers.organisationId, user.organisationId));

  // The AI import flow pre-fills the form via query params.
  const sp = await searchParams;
  const prefill = {
    title: typeof sp.title === "string" ? sp.title : "",
    valueGbp: typeof sp.valueGbp === "string" ? sp.valueGbp : "",
    applicationDayOfMonth:
      typeof sp.applicationDayOfMonth === "string" ? sp.applicationDayOfMonth : "25",
    daysToDueDate: typeof sp.daysToDueDate === "string" ? sp.daysToDueDate : "",
    daysDueToFinal: typeof sp.daysDueToFinal === "string" ? sp.daysDueToFinal : "",
    payLessNoticeDaysBeforeFinal:
      typeof sp.payLessNoticeDaysBeforeFinal === "string"
        ? sp.payLessNoticeDaysBeforeFinal
        : "",
    retentionPercent:
      typeof sp.retentionPercent === "string" ? sp.retentionPercent : "0",
    defectsPeriodMonths:
      typeof sp.defectsPeriodMonths === "string" ? sp.defectsPeriodMonths : "12",
  };

  return (
    <main className="max-w-xl">
      <h1 className="mb-2 text-xl font-semibold">Add a contract</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Leave the deadline fields blank to use the legal defaults (the Scheme
        for Construction Contracts), which apply whenever a contract is silent.
      </p>
      <ContractForm payers={payers} prefill={prefill} />
    </main>
  );
}
