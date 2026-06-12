"use client";

import { useState } from "react";
import {
  BookmarkPlus,
  ChevronDown,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type {
  ContractType,
  EmploymentType,
  ExperienceLevel,
  SearchScope,
  SearchState,
  SectorFilter,
  SortOption,
} from "@/lib/types";
import {
  CONTRACT_TYPES,
  CONTRACT_TYPE_LABELS,
  DEFAULT_SEARCH,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVELS,
  EXPERIENCE_LEVEL_LABELS,
} from "@/lib/types";
import { activeFilterCount } from "@/lib/search";
import { TagInput } from "./TagInput";
import { Spinner, btnGhost, btnPrimary } from "./ui";

interface SearchBarProps {
  scope: SearchScope;
  search: SearchState;
  onChange: (next: SearchState) => void;
  onSaveSearch: (name: string) => Promise<boolean>;
  savingSearch: boolean;
  /** How many jobs currently match (null while loading). */
  resultCount: number | null;
}

const POSTED_WITHIN_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Any time" },
  { value: "1", label: "Last hour" },
  { value: "3", label: "Last 3 hours" },
  { value: "8", label: "Last 8 hours" },
  { value: "24", label: "Last 24 hours" },
];

const SECTOR_FILTER_OPTIONS: Array<{ value: SectorFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "public_sector", label: "Public sector" },
  { value: "private", label: "Private" },
];

function FilterPill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`min-h-10 rounded-xl border px-3.5 text-sm font-medium transition-all duration-150 ${
        on
          ? "border-transparent bg-gradient-to-r from-brand to-brand-2 text-on-brand shadow"
          : "border-line bg-background text-ink-soft hover:border-gold-bright/60 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function parseMoney(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10_000_000) : null;
}

/** The main search bar — used for both the Jobs and Government tabs. */
export function SearchBar({
  scope,
  search,
  onChange,
  onSaveSearch,
  savingSearch,
  resultCount,
}: SearchBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");

  const filterCount = activeFilterCount(search);
  const isGov = scope === "government";

  function patch(p: Partial<SearchState>) {
    onChange({ ...search, ...p });
  }

  function toggleIn<T>(list: T[], item: T): T[] {
    return list.includes(item)
      ? list.filter((x) => x !== item)
      : [...list, item];
  }

  async function submitSave() {
    const name = saveName.trim() || "My search";
    const ok = await onSaveSearch(name);
    if (ok) {
      setSaveOpen(false);
      setSaveName("");
    }
  }

  return (
    <section
      aria-label={isGov ? "Government job search" : "Job search"}
      className="card-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <Search size={20} className="shrink-0 text-gold" aria-hidden />
        <h2 className="font-display text-base font-semibold text-ink sm:text-lg">
          {isGov
            ? "Search Birmingham government jobs"
            : "Search Birmingham jobs"}
        </h2>
      </div>

      <div className="mt-3">
        <TagInput
          value={search.terms}
          onChange={(terms) => patch({ terms })}
          placeholder={
            isGov
              ? "Job title — e.g. policy advisor, caseworker…"
              : "Job title — e.g. administrator, barista, software engineer…"
          }
          ariaLabel="Search job titles"
          hint="Suggestions appear as you type. Titles only — press Refresh to pull fresh jobs."
        />
      </div>

      {/* Jobs tab: clean separation of public sector vs private. */}
      {!isGov && (
        <div className="mt-3">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Sector
          </span>
          <div
            role="radiogroup"
            aria-label="Sector"
            className="flex flex-wrap gap-2"
          >
            {SECTOR_FILTER_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={search.sectorFilter === o.value}
                onClick={() => patch({ sectorFilter: o.value })}
                className={`min-h-10 rounded-xl border px-3.5 text-sm font-medium transition-all duration-150 ${
                  search.sectorFilter === o.value
                    ? "border-transparent bg-gradient-to-r from-brand to-brand-2 text-on-brand shadow"
                    : "border-line bg-background text-ink-soft hover:border-gold-bright/60 hover:text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="search-filters"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`${btnGhost} min-h-10 px-3.5 py-2 text-sm`}
        >
          <SlidersHorizontal size={15} aria-hidden />
          Filters
          {filterCount > 0 && (
            <span className="rounded-full bg-gold-bright/20 px-1.5 text-xs font-semibold tabular-nums text-gold">
              {filterCount}
            </span>
          )}
          <ChevronDown
            size={15}
            aria-hidden
            className={`transition-transform duration-150 ${filtersOpen ? "rotate-180" : ""}`}
          />
        </button>

        <label className="flex items-center gap-1.5 text-sm text-ink-soft">
          Sort
          <select
            value={search.sort}
            onChange={(e) => patch({ sort: e.target.value as SortOption })}
            className="input !w-auto !py-1.5 text-sm"
          >
            <option value="newest">Newest first</option>
            <option value="salary">Salary: high to low</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => setSaveOpen((v) => !v)}
          className={`${btnGhost} min-h-10 px-3.5 py-2 text-sm`}
        >
          <BookmarkPlus size={15} aria-hidden /> Save search
        </button>

        {resultCount !== null && (
          <span
            className="ml-auto text-sm tabular-nums text-ink-soft"
            role="status"
          >
            {resultCount} job{resultCount === 1 ? "" : "s"} match
          </span>
        )}
      </div>

      {saveOpen && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-gold-bright/40 bg-background p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submitSave();
          }}
        >
          <label className="flex-1 min-w-[200px]">
            <span className="sr-only">Name for this saved search</span>
            <input
              type="text"
              className="input"
              placeholder="Name this search — e.g. Morning admin hunt"
              maxLength={100}
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={savingSearch}
            className={`${btnPrimary} min-h-10 px-4 py-2 text-sm`}
          >
            {savingSearch && <Spinner />} Save
          </button>
          <button
            type="button"
            onClick={() => setSaveOpen(false)}
            className={`${btnGhost} min-h-10 px-4 py-2 text-sm`}
          >
            Cancel
          </button>
        </form>
      )}

      {filtersOpen && (
        <div
          id="search-filters"
          className="mt-4 grid gap-4 border-t border-line pt-4"
        >
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">
              Employment type
            </legend>
            <div className="flex flex-wrap gap-2">
              {EMPLOYMENT_TYPES.map((t: EmploymentType) => (
                <FilterPill
                  key={t}
                  on={search.employmentTypes.includes(t)}
                  onClick={() =>
                    patch({
                      employmentTypes: toggleIn(search.employmentTypes, t),
                    })
                  }
                >
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </FilterPill>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink">
                Contract
              </legend>
              <div className="flex flex-wrap gap-2">
                {CONTRACT_TYPES.map((t: ContractType) => (
                  <FilterPill
                    key={t}
                    on={search.contractTypes.includes(t)}
                    onClick={() =>
                      patch({ contractTypes: toggleIn(search.contractTypes, t) })
                    }
                  >
                    {CONTRACT_TYPE_LABELS[t]}
                  </FilterPill>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink">
                Experience
              </legend>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_LEVELS.map((t: ExperienceLevel) => (
                  <FilterPill
                    key={t}
                    on={search.experienceLevels.includes(t)}
                    onClick={() =>
                      patch({
                        experienceLevels: toggleIn(search.experienceLevels, t),
                      })
                    }
                  >
                    {EXPERIENCE_LEVEL_LABELS[t]}
                  </FilterPill>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink">
                Salary (per year)
              </legend>
              <div className="flex items-center gap-2">
                <label className="flex-1">
                  <span className="sr-only">Minimum salary</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input"
                    placeholder="Min £"
                    value={search.salaryMin ?? ""}
                    onChange={(e) =>
                      patch({ salaryMin: parseMoney(e.target.value) })
                    }
                  />
                </label>
                <span className="text-ink-soft">–</span>
                <label className="flex-1">
                  <span className="sr-only">Maximum salary</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="input"
                    placeholder="Max £"
                    value={search.salaryMax ?? ""}
                    onChange={(e) =>
                      patch({ salaryMax: parseMoney(e.target.value) })
                    }
                  />
                </label>
              </div>
              <p className="mt-1.5 text-xs text-ink-soft">
                Listings with no salary stated are hidden while this is set.
              </p>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink">
                Posted within
              </legend>
              <select
                className="input"
                value={
                  search.postedWithinHours === null
                    ? ""
                    : String(search.postedWithinHours)
                }
                onChange={(e) =>
                  patch({
                    postedWithinHours:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                aria-label="Posted within"
              >
                {POSTED_WITHIN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-ink-soft">
                Under 24 hours uses to-the-minute times (Adzuna, Jooble);
                Reed and some JSearch listings give the date only.
              </p>
            </fieldset>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">
              Exclude words from titles
            </legend>
            <TagInput
              value={search.excludeTerms}
              onChange={(excludeTerms) => patch({ excludeTerms })}
              suggest={false}
              compact
              placeholder="e.g. apprentice, weekend…"
              ariaLabel="Words to exclude from job titles"
              hint={null}
            />
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--brand)]"
                checked={search.searchDescriptions}
                onChange={(e) =>
                  patch({ searchDescriptions: e.target.checked })
                }
              />
              Also search inside descriptions
              <span className="text-xs text-ink-soft">
                (off = titles only, much tighter results)
              </span>
            </label>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...DEFAULT_SEARCH,
                  terms: search.terms,
                  sort: search.sort,
                  sectorFilter: search.sectorFilter,
                })
              }
              className="ml-auto text-sm font-medium text-brand underline underline-offset-4 hover:text-brand-2"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
