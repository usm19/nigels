"use client";

import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { Logo } from "./Logo";
import { Notice, Spinner, btnPrimary } from "./ui";

type Mode = "signin" | "signup";

/** Turn a raw Supabase auth error into a friendly, plain-English message. */
function friendlyError(message: string, mode: Mode): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) {
    return "That email and password don't match. Please check them and try again.";
  }
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "There's already an account with that email — switch to “Sign in” instead.";
  }
  if (m.includes("password") && m.includes("least")) {
    return "Please choose a password with at least 8 characters.";
  }
  if (m.includes("unable to validate email") || m.includes("invalid")) {
    return "That email address doesn't look right — please check it.";
  }
  return mode === "signup"
    ? "Couldn't create your account just now — please try again in a moment."
    : "Couldn't sign you in just now — please try again in a moment.";
}

/** Email + password sign-in / sign-up. No emails are sent (instant access). */
export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim();
    if (!addr || password.length < 8) {
      setError("Please enter your email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const { error: authError } =
        mode === "signup"
          ? await supabase.auth.signUp({ email: addr, password })
          : await supabase.auth.signInWithPassword({ email: addr, password });
      if (authError) throw authError;
      // On success the session is set; AuthGate's onAuthStateChange shows the app.
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "", mode));
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card-shadow w-full max-w-md rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 text-center font-display text-2xl font-semibold text-ink">
          {isSignup ? "Create your account" : "Sign in to Nigel’s"}
        </h1>
        <p className="mt-2 text-center text-sm text-ink-soft">
          {isSignup
            ? "Pick an email and password. Your saved searches and applied jobs stay private to you."
            : "Welcome back. Sign in to see your saved searches and applied jobs."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Email</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-line bg-background px-4 py-3 text-ink placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">
              Password
            </span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              className="w-full rounded-xl border border-line bg-background px-4 py-3 text-ink placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
            />
          </label>

          {error && <Notice kind="error" text={error} />}

          <button
            type="submit"
            disabled={busy}
            className={`${btnPrimary} min-h-12 w-full px-5 py-3`}
          >
            {busy ? (
              <Spinner />
            ) : isSignup ? (
              <UserPlus size={17} aria-hidden />
            ) : (
              <LogIn size={17} aria-hidden />
            )}
            {busy
              ? isSignup
                ? "Creating account…"
                : "Signing in…"
              : isSignup
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-soft">
          {isSignup ? "Already have an account?" : "New to Nigel’s?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(isSignup ? "signin" : "signup");
              setError(null);
            }}
            className="font-medium text-brand underline underline-offset-4 hover:text-brand-2"
          >
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </p>
      </div>
    </div>
  );
}
