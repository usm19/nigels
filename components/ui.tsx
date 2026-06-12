"use client";

import { X } from "lucide-react";
import type { JobSource } from "@/lib/types";

// Shared building blocks + button styles so every control looks consistent.

export const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium " +
  "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-gold-bright focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-background disabled:opacity-50 disabled:pointer-events-none";

export const btnPrimary =
  btnBase +
  " bg-gradient-to-r from-brand to-brand-2 text-on-brand shadow-md " +
  "hover:shadow-lg hover:brightness-110 active:scale-[0.98]";

export const btnGhost =
  btnBase +
  " border border-line bg-surface text-ink hover:border-gold-bright/60 hover:bg-surface-2";

export const btnDanger =
  btnBase +
  " border border-danger/40 bg-surface text-danger hover:bg-danger/10";

type BadgeTone = "gold" | "brand" | "purple" | "green" | "neutral";

const badgeTones: Record<BadgeTone, string> = {
  gold: "bg-gold-bright/15 text-gold border-gold-bright/40",
  brand: "bg-brand/10 text-brand border-brand/30",
  purple: "bg-brand-2/10 text-brand-2 border-brand-2/30",
  green: "bg-success/10 text-success border-success/30",
  neutral: "bg-surface-2 text-ink-soft border-line",
};

/** A distinct badge colour per job source. */
export function sourceTone(source: JobSource): BadgeTone {
  switch (source) {
    case "adzuna":
      return "brand";
    case "reed":
      return "purple";
    case "jooble":
      return "green";
    case "jsearch":
      return "neutral";
  }
}

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Notice({
  kind,
  text,
  onDismiss,
}: {
  kind: "info" | "error";
  text: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm sm:text-base ${
        kind === "error"
          ? "border-danger/40 bg-danger/10 text-danger"
          : "border-brand/30 bg-brand/10 text-ink"
      }`}
    >
      <span className="flex-1">{text}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-shadow rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <h3 className="font-display text-lg font-semibold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-ink-soft">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function SkeletonCards() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="card-shadow animate-pulse rounded-2xl border border-line bg-surface p-5"
        >
          <div className="h-5 w-2/3 rounded bg-surface-2" />
          <div className="mt-3 h-4 w-1/2 rounded bg-surface-2" />
          <div className="mt-4 flex gap-2">
            <div className="h-5 w-16 rounded-full bg-surface-2" />
            <div className="h-5 w-20 rounded-full bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
