"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup } from "../actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-8">
      <h1 className="mb-1 text-2xl font-semibold">Moiety</h1>
      <p className="mb-8 text-sm text-neutral-500">
        Create your firm&apos;s account
      </p>
      <form action={action} className="space-y-4">
        <label className="block text-sm">
          Company name
          <input
            name="organisation"
            required
            placeholder="Mills Electrical Ltd"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Your name
          <input
            name="name"
            required
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password (10+ characters)
          <input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
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
          className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-sm text-neutral-500">
        Already set up?{" "}
        <Link className="font-medium text-neutral-900 underline" href="/login">
          Log in
        </Link>
      </p>
    </main>
  );
}
