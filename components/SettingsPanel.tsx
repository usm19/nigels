"use client";

import { useEffect, useState } from "react";
import { Check, LogOut, Moon, Sun } from "lucide-react";
import { btnGhost } from "./ui";

// Theme + general preferences only. The halal/haram and commission-only
// filters are PERMANENT and intentionally have no control here or anywhere.

type ThemeChoice = "light" | "dark";

function applyTheme(choice: ThemeChoice) {
  document.documentElement.classList.toggle("dark", choice === "dark");
  try {
    localStorage.setItem("nigels-theme", choice);
  } catch {
    // Private browsing — the choice just won't be remembered.
  }
}

export function SettingsPanel({
  userEmail,
  onSignOut,
}: {
  userEmail?: string;
  onSignOut?: () => void | Promise<void>;
}) {
  const [theme, setTheme] = useState<ThemeChoice | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
  }, []);

  function choose(choice: ThemeChoice) {
    setTheme(choice);
    applyTheme(choice);
  }

  const options: Array<{ value: ThemeChoice; label: string; sub: string; icon: typeof Sun }> = [
    { value: "light", label: "Royal", sub: "Light · ivory & gold", icon: Sun },
    { value: "dark", label: "Galaxy", sub: "Dark · deep space", icon: Moon },
  ];

  return (
    <div className="space-y-5">
      {onSignOut && (
        <section className="card-shadow rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold text-ink">Account</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {userEmail ? (
              <>
                Signed in as{" "}
                <span className="font-medium text-ink">{userEmail}</span>. Your
                saved searches and applied jobs are private to your account.
              </>
            ) : (
              "Your saved searches and applied jobs are private to your account."
            )}
          </p>
          <button
            type="button"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await onSignOut();
              } finally {
                setSigningOut(false);
              }
            }}
            className={`${btnGhost} mt-4 min-h-11 px-4 py-2`}
          >
            <LogOut size={16} aria-hidden />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </section>
      )}

      <section className="card-shadow rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Theme</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Pick the look. Your choice is remembered on this device.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {options.map(({ value, label, sub, icon: Icon }) => {
            const selected = theme === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => choose(value)}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all duration-150 ${
                  selected
                    ? "border-gold-bright bg-surface-2 shadow"
                    : "border-line hover:border-gold-bright/60 hover:bg-surface-2"
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-brand to-brand-2 text-on-brand">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="flex-1">
                  <span className="block font-medium text-ink">{label}</span>
                  <span className="block text-xs text-ink-soft">{sub}</span>
                </span>
                {selected && <Check size={18} className="text-gold" aria-hidden />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="card-shadow rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-ink">
          How Nigel&rsquo;s works
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-soft sm:text-base">
          <li>
            <span className="font-medium text-ink">Sources:</span> Adzuna, Reed,
            Jooble and JSearch — Birmingham, UK only.
          </li>
          <li>
            <span className="font-medium text-ink">Freshness:</span> jobs are
            shown by their real posting time on the source site and removed 24
            hours after they were posted (applied jobs are kept).
          </li>
          <li>
            <span className="font-medium text-ink">Always-on filtering:</span>{" "}
            roles that don&rsquo;t fit a halal framework (interest-based
            finance, alcohol, gambling, pork, and so on) and commission-only
            roles are permanently excluded everywhere. This is built in and has
            no on/off switch by design. It&rsquo;s strong keyword and employer
            matching — very reliable, but not perfect.
          </li>
        </ul>
      </section>
    </div>
  );
}
