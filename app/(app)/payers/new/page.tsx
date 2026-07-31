"use client";

import { useActionState } from "react";
import { createPayer } from "../actions";

export default function NewPayerPage() {
  const [state, action, pending] = useActionState(createPayer, undefined);
  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-xl font-semibold">Add a payer</h1>
      <form action={action} className="space-y-4">
        <label className="block text-sm">
          Company name
          <input
            name="name"
            required
            placeholder="BuildCo Midlands Ltd"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Companies House number{" "}
          <span className="text-neutral-400">(optional, enables the risk radar)</span>
          <input
            name="companyNumber"
            placeholder="01234567"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
        {state?.error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save payer"}
        </button>
      </form>
    </main>
  );
}
