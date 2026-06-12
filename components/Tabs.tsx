"use client";

import { useRef } from "react";

export type TabId = "jobs" | "applied" | "saved";

interface TabsProps {
  tab: TabId;
  counts: Record<TabId, number | null>;
  onChange: (tab: TabId) => void;
}

const TAB_DEFS: Array<{ id: TabId; label: string }> = [
  { id: "jobs", label: "Jobs" },
  { id: "applied", label: "Applied" },
  { id: "saved", label: "Saved" },
];

export function Tabs({ tab, counts, onChange }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Standard tablist keyboard behaviour: left/right arrows move between tabs.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const index = TAB_DEFS.findIndex((d) => d.id === tab);
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % TAB_DEFS.length
        : (index - 1 + TAB_DEFS.length) % TAB_DEFS.length;
    onChange(TAB_DEFS[next].id);
    const buttons = listRef.current?.querySelectorAll("button");
    buttons?.[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Sections"
      onKeyDown={onKeyDown}
      className="card-shadow flex gap-1 rounded-2xl border border-line bg-surface p-1"
    >
      {TAB_DEFS.map((d) => {
        const selected = tab === d.id;
        const count = counts[d.id];
        return (
          <button
            key={d.id}
            id={`tab-${d.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${d.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(d.id)}
            className={`min-h-11 flex-1 rounded-xl px-3 text-sm font-medium transition-colors duration-150 sm:text-base ${
              selected
                ? "bg-gradient-to-r from-brand to-brand-2 text-on-brand shadow"
                : "text-ink-soft hover:bg-surface-2 hover:text-ink"
            }`}
          >
            {d.label}
            {typeof count === "number" && (
              <span
                className={`ml-1.5 inline-block rounded-full px-1.5 text-xs tabular-nums ${
                  selected ? "bg-on-brand/20" : "bg-surface-2 text-ink-soft"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
