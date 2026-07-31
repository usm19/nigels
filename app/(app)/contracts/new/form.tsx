"use client";

import { useActionState } from "react";
import { createContract } from "../actions";

export function ContractForm({
  payers,
  prefill,
}: {
  payers: { id: string; name: string }[];
  prefill: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(createContract, undefined);

  if (payers.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-sm text-neutral-500">
        Add a payer first — every contract belongs to a main contractor.
      </p>
    );
  }

  const input =
    "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm">
        Job title
        <input
          name="title"
          required
          defaultValue={prefill.title}
          placeholder="Walsall depot rewire"
          className={input}
        />
      </label>
      <label className="block text-sm">
        Payer
        <select name="payerId" required className={input}>
          {payers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Contract value (£)
        <input
          name="valueGbp"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={prefill.valueGbp}
          className={input}
        />
      </label>

      <fieldset className="rounded-xl border border-neutral-200 p-4">
        <legend className="px-1 text-sm font-medium">Payment terms</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Application day of month
            <input
              name="applicationDayOfMonth"
              type="number"
              min="1"
              max="28"
              required
              defaultValue={prefill.applicationDayOfMonth}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Days to due date{" "}
            <span className="text-neutral-400">(default 7)</span>
            <input
              name="daysToDueDate"
              type="number"
              min="0"
              max="60"
              defaultValue={prefill.daysToDueDate}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Due date → final date{" "}
            <span className="text-neutral-400">(default 17)</span>
            <input
              name="daysDueToFinal"
              type="number"
              min="1"
              max="90"
              defaultValue={prefill.daysDueToFinal}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Pay-less notice, days before final{" "}
            <span className="text-neutral-400">(default 7)</span>
            <input
              name="payLessNoticeDaysBeforeFinal"
              type="number"
              min="1"
              max="30"
              defaultValue={prefill.payLessNoticeDaysBeforeFinal}
              className={input}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="rounded-xl border border-neutral-200 p-4">
        <legend className="px-1 text-sm font-medium">Retention</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            Retention % <span className="text-neutral-400">(0 = none held)</span>
            <input
              name="retentionPercent"
              type="number"
              step="0.5"
              min="0"
              max="10"
              defaultValue={prefill.retentionPercent}
              className={input}
            />
          </label>
          <label className="block text-sm">
            Defects period (months)
            <input
              name="defectsPeriodMonths"
              type="number"
              min="0"
              max="36"
              defaultValue={prefill.defectsPeriodMonths}
              className={input}
            />
          </label>
        </div>
      </fieldset>

      {state?.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save contract"}
      </button>
    </form>
  );
}
