"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Light = "Royal", dark = "Galaxy". The choice is remembered in localStorage
 * and applied before paint by the inline script in layout.tsx.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !(dark ?? false);
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("nigels-theme", next ? "dark" : "light");
    } catch {
      // Private browsing — the theme just won't be remembered.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        dark
          ? "Switch to the Royal (light) theme"
          : "Switch to the Galaxy (dark) theme"
      }
      title={dark ? "Royal theme" : "Galaxy theme"}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-ink-soft transition-all duration-150 hover:border-gold-bright/60 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
    >
      {dark === null ? (
        <Moon size={19} className="opacity-0" aria-hidden />
      ) : dark ? (
        <Sun size={19} aria-hidden />
      ) : (
        <Moon size={19} aria-hidden />
      )}
    </button>
  );
}
