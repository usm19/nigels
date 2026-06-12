"use client";

import { Menu, RefreshCw } from "lucide-react";
import { clockTime, refreshTimer } from "@/lib/format";
import { useNow } from "./TickContext";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { btnPrimary } from "./ui";

interface TopBarProps {
  lastRefreshedAt: number | null;
  refreshing: boolean;
  cooldownUntil: number;
  onRefresh: () => void;
  /** Opens the mobile navigation drawer. */
  onMenuClick: () => void;
}

export function TopBar({
  lastRefreshedAt,
  refreshing,
  cooldownUntil,
  onRefresh,
  onMenuClick,
}: TopBarProps) {
  const now = useNow();
  const mounted = now !== 0;

  const timerText = !mounted
    ? "…"
    : lastRefreshedAt
      ? `Last refreshed ${refreshTimer(lastRefreshedAt, now)} ago`
      : "Not refreshed yet";
  const clock = mounted ? clockTime(now) : "";

  const cooldownLeft = mounted ? Math.max(0, cooldownUntil - now) : 0;
  const disabled = refreshing || cooldownLeft > 0;
  const label = refreshing
    ? "Refreshing…"
    : cooldownLeft > 0
      ? `Refresh (${Math.ceil(cooldownLeft / 1000)})`
      : "Refresh";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
        >
          <Menu size={20} aria-hidden />
        </button>
        <Logo />
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <div className="hidden flex-col items-end leading-tight sm:flex">
            <span className="text-sm font-medium tabular-nums text-ink">
              {timerText}
            </span>
            <span className="text-xs tabular-nums text-ink-soft">{clock}</span>
          </div>
          <ThemeToggle />
          <button
            type="button"
            onClick={onRefresh}
            disabled={disabled}
            aria-busy={refreshing}
            className={`${btnPrimary} min-h-11 px-4 py-2.5 sm:px-5`}
          >
            <RefreshCw
              size={17}
              className={refreshing ? "animate-spin" : ""}
              aria-hidden
            />
            <span className="tabular-nums">{label}</span>
          </button>
        </div>
      </div>
      <div className="-mt-1 flex justify-between px-4 pb-2 text-xs tabular-nums text-ink-soft sm:hidden">
        <span>{timerText}</span>
        <span>{clock}</span>
      </div>
    </header>
  );
}
