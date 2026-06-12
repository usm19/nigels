"use client";

import { useEffect, useRef } from "react";
import {
  Bookmark,
  Briefcase,
  CheckCircle2,
  Landmark,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { Logo } from "./Logo";

export type TabId = "jobs" | "government" | "applied" | "saved" | "settings";

interface SidebarProps {
  tab: TabId;
  counts: Partial<Record<TabId, number | null>>;
  onChange: (tab: TabId) => void;
  /** Mobile drawer open state (ignored on desktop). */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const NAV: Array<{ id: TabId; label: string; icon: typeof Briefcase }> = [
  { id: "jobs", label: "Jobs", icon: Briefcase },
  { id: "government", label: "Government", icon: Landmark },
  { id: "applied", label: "Applied", icon: CheckCircle2 },
  { id: "saved", label: "Saved", icon: Bookmark },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function NavList({
  tab,
  counts,
  onChange,
}: Pick<SidebarProps, "tab" | "counts" | "onChange">) {
  return (
    <nav aria-label="Sections" className="flex flex-col gap-1">
      {NAV.map(({ id, label, icon: Icon }) => {
        const selected = tab === id;
        const count = counts[id];
        return (
          <button
            key={id}
            type="button"
            aria-current={selected ? "page" : undefined}
            onClick={() => onChange(id)}
            className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium transition-colors duration-150 sm:text-base ${
              selected
                ? "bg-gradient-to-r from-brand to-brand-2 text-on-brand shadow"
                : "text-ink-soft hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <Icon size={18} aria-hidden />
            <span className="flex-1 text-left">{label}</span>
            {typeof count === "number" && (
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  selected ? "bg-on-brand/20" : "bg-surface-2 text-ink-soft"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export function Sidebar({
  tab,
  counts,
  onChange,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Mobile drawer accessibility: Escape closes; focus moves into the drawer
  // on open; Tab is trapped inside it; body scroll is locked; and focus is
  // restored to the menu trigger on close.
  useEffect(() => {
    if (!mobileOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const drawer = drawerRef.current;
    const focusables = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => !el.hasAttribute("disabled"));

    focusables()[0]?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onMobileClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop: persistent sidebar. */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface/60 px-3 py-5 lg:block">
        <div className="sticky top-20">
          <NavList tab={tab} counts={counts} onChange={onChange} />
        </div>
      </aside>

      {/* Mobile: slide-in drawer + backdrop. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Close menu"
            onClick={onMobileClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div
            ref={drawerRef}
            className="absolute left-0 top-0 flex h-full w-72 max-w-[82%] flex-col gap-4 border-r border-line bg-surface px-3 py-4 shadow-2xl"
          >
            <div className="flex items-center justify-between px-1">
              <Logo />
              <button
                type="button"
                aria-label="Close menu"
                onClick={onMobileClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-ink-soft hover:bg-surface-2"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <NavList
              tab={tab}
              counts={counts}
              onChange={(t) => {
                onChange(t);
                onMobileClose();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
