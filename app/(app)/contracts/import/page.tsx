"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Extraction = {
  title?: string | null;
  payerName?: string | null;
  valueGbp?: number | null;
  applicationDayOfMonth?: number | null;
  daysToDueDate?: number | null;
  daysDueToFinal?: number | null;
  payLessNoticeDaysBeforeFinal?: number | null;
  retentionPercent?: number | null;
  defectsPeriodMonths?: number | null;
  notes?: string | null;
};

export default function ImportContractPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/extract", { method: "POST", body: formData });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Extraction failed.");
      return;
    }
    setExtraction(data.extraction);
  }

  function continueToForm() {
    if (!extraction) return;
    const params = new URLSearchParams();
    const set = (k: string, v: unknown) => {
      if (v !== null && v !== undefined && v !== "") params.set(k, String(v));
    };
    set("title", extraction.title);
    set("valueGbp", extraction.valueGbp);
    set("applicationDayOfMonth", extraction.applicationDayOfMonth);
    set("daysToDueDate", extraction.daysToDueDate);
    set("daysDueToFinal", extraction.daysDueToFinal);
    set("payLessNoticeDaysBeforeFinal", extraction.payLessNoticeDaysBeforeFinal);
    set("retentionPercent", extraction.retentionPercent);
    set("defectsPeriodMonths", extraction.defectsPeriodMonths);
    router.push(`/contracts/new?${params.toString()}`);
  }

  return (
    <main className="max-w-xl">
      <h1 className="mb-2 text-xl font-semibold">Import a contract from PDF</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Upload the subcontract order. The key payment terms are read for you,
        then shown on a form to check before anything is saved — nothing is
        stored without your confirmation.
      </p>

      {!extraction ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <input
            type="file"
            name="file"
            accept="application/pdf"
            required
            className="block w-full rounded-lg border border-neutral-300 p-3 text-sm"
          />
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}
          <button
            disabled={busy}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Reading the contract…" : "Read the contract"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 rounded-xl border border-neutral-200 p-4 text-sm">
            {Object.entries({
              "Job title": extraction.title,
              Payer: extraction.payerName,
              "Value (£)": extraction.valueGbp,
              "Application day": extraction.applicationDayOfMonth,
              "Days to due date": extraction.daysToDueDate,
              "Due → final days": extraction.daysDueToFinal,
              "Pay-less days before final": extraction.payLessNoticeDaysBeforeFinal,
              "Retention %": extraction.retentionPercent,
              "Defects period (months)": extraction.defectsPeriodMonths,
            }).map(([k, v]) => (
              <div key={k}>
                <dt className="text-neutral-500">{k}</dt>
                <dd className="font-medium">{v ?? "not stated"}</dd>
              </div>
            ))}
          </dl>
          {extraction.notes && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              {extraction.notes}
            </p>
          )}
          {extraction.payerName && (
            <p className="text-sm text-neutral-500">
              If <span className="font-medium">{extraction.payerName}</span> is
              not in your payers list yet, add them first so you can pick them
              on the next screen.
            </p>
          )}
          <button
            onClick={continueToForm}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            Looks right — continue to confirm
          </button>
        </div>
      )}
    </main>
  );
}
