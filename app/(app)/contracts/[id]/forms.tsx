"use client";

import { useActionState, useState } from "react";
import { createCycle, recordCycleEvent } from "../actions";

const input =
  "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export function NewCycleForm({ contractId }: { contractId: string }) {
  const [state, action, pending] = useActionState(createCycle, undefined);
  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-neutral-300 p-4"
    >
      <input type="hidden" name="contractId" value={contractId} />
      <label className="text-sm">
        Application date
        <input type="date" name="applicationDate" required className={input} />
      </label>
      <label className="text-sm">
        Amount applied for (£)
        <input
          type="number"
          name="appliedGbp"
          step="0.01"
          min="0"
          required
          className={input}
        />
      </label>
      <button
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Adding…" : "Log application"}
      </button>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}

export function CycleForms({
  contractId,
  cycleId,
}: {
  contractId: string;
  cycleId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(recordCycleEvent, undefined);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-neutral-500 underline"
      >
        Record notice or payment
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-neutral-50 p-3"
    >
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="cycleId" value={cycleId} />
      <label className="text-sm">
        What happened
        <select name="kind" className={input}>
          <option value="payment-notice">They sent a payment notice</option>
          <option value="pay-less-notice">They sent a pay-less notice</option>
          <option value="payment">Money received</option>
        </select>
      </label>
      <label className="text-sm">
        Date on the notice
        <input type="date" name="date" className={input} />
      </label>
      <label className="text-sm">
        Amount (£)
        <input
          type="number"
          name="amountGbp"
          step="0.01"
          min="0"
          required
          className={input}
        />
      </label>
      <button
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
    </form>
  );
}
