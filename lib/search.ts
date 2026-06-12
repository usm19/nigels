// Client-side display filtering and sorting for the main search bar, plus
// mapping between the search state and saved searches (the alerts table).
import type { Alert, Job, SearchState, SortOption } from "./types";
import { DEFAULT_SEARCH } from "./types";
import {
  matchesAnyTerm,
  matchesEmploymentTypes,
  matchesSalary,
} from "./match";
import {
  effectivePrecision,
  localTodayEpochDays,
  postedDateEpochDays,
} from "./format";

function postedMs(job: Job): number | null {
  if (!job.source_posted_date) return null;
  const ms = Date.parse(job.source_posted_date);
  return Number.isNaN(ms) ? null : ms;
}

/** Apply every search filter to the (already fresh, active) job list. */
export function applySearchFilters(
  jobs: Job[],
  s: SearchState,
  nowMs: number
): Job[] {
  const filtered = jobs.filter((job) => {
    if (s.terms.length > 0) {
      const inTitle = matchesAnyTerm(job.title, s.terms);
      const inDescription =
        s.searchDescriptions && job.description
          ? matchesAnyTerm(job.description, s.terms)
          : false;
      if (!inTitle && !inDescription) return false;
    }
    if (s.excludeTerms.length > 0 && matchesAnyTerm(job.title, s.excludeTerms)) {
      return false;
    }
    if (!matchesEmploymentTypes(job, s.employmentTypes)) return false;
    // Exactly one contract type is a real constraint. Selecting BOTH means
    // "either is fine" and must not hide jobs whose contract type is unknown
    // (Reed never states it unless the search itself was contract-filtered).
    if (
      s.contractTypes.length === 1 &&
      job.contract_type !== s.contractTypes[0]
    ) {
      return false;
    }
    if (s.governmentOnly && !job.is_government) return false;
    if (
      s.experienceLevels.length > 0 &&
      (!job.experience_level ||
        !s.experienceLevels.includes(job.experience_level))
    ) {
      return false;
    }
    if (!matchesSalary(job, s.salaryMin, s.salaryMax)) return false;

    if (s.postedWithinHours !== null) {
      if (!job.source_posted_date) return false;
      if (effectivePrecision(job) === "date_only") {
        // A date-only source can't honestly satisfy a sub-day window.
        if (s.postedWithinHours < 24) return false;
        const posted = postedDateEpochDays(job.source_posted_date);
        if (posted === null) return false;
        if (localTodayEpochDays(nowMs) - posted >= 1) return false;
      } else {
        const ms = postedMs(job);
        if (ms === null) return false;
        if (nowMs - ms > s.postedWithinHours * 3_600_000) return false;
      }
    }
    return true;
  });

  const bySalary = (job: Job) => job.salary_max ?? job.salary_min ?? -1;
  return filtered.sort((a, b) => {
    if (s.sort === "salary") {
      const diff = bySalary(b) - bySalary(a);
      if (diff !== 0) return diff;
    }
    const pa = postedMs(a) ?? -1;
    const pb = postedMs(b) ?? -1;
    if (pb !== pa) return pb - pa;
    return Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at);
  });
}

/** How many filters differ from the defaults (for the Filters badge). */
export function activeFilterCount(s: SearchState): number {
  let n = 0;
  if (s.employmentTypes.length > 0) n++;
  if (s.contractTypes.length > 0) n++;
  if (s.experienceLevels.length > 0) n++;
  if (s.governmentOnly) n++;
  if (s.salaryMin !== null || s.salaryMax !== null) n++;
  if (s.postedWithinHours !== null) n++;
  if (s.excludeTerms.length > 0) n++;
  if (s.searchDescriptions) n++;
  return n;
}

// The filter state that has no dedicated column rides along as JSON in the
// schema's free-text `keywords` column, so saved searches restore the FULL
// search bar (exclude words, posted-within, description toggle, sort).
interface SavedSearchExtras {
  exclude?: string[];
  postedWithinHours?: number | null;
  searchDescriptions?: boolean;
  sort?: SortOption;
}

/** Turn a saved search (alert row) back into search-bar state. */
export function searchFromAlert(alert: Alert): SearchState {
  let extras: SavedSearchExtras = {};
  let keywordTerms: string[] = [];
  const raw = (alert.keywords ?? "").trim();
  if (raw.startsWith("{")) {
    try {
      extras = JSON.parse(raw) as SavedSearchExtras;
    } catch {
      // Unreadable extras — fall back to defaults.
    }
  } else if (raw) {
    // Legacy/manual value: treat as comma-separated extra terms.
    keywordTerms = raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }
  return {
    ...DEFAULT_SEARCH,
    terms: [...new Set([...alert.tags, ...keywordTerms])],
    excludeTerms: Array.isArray(extras.exclude)
      ? extras.exclude.filter((t) => typeof t === "string")
      : [],
    searchDescriptions: extras.searchDescriptions === true,
    postedWithinHours:
      typeof extras.postedWithinHours === "number"
        ? extras.postedWithinHours
        : null,
    sort: extras.sort === "salary" ? "salary" : "newest",
    employmentTypes: alert.employment_types,
    contractTypes: alert.contract_types,
    experienceLevels: alert.experience_levels,
    governmentOnly: alert.government_only,
    salaryMin: alert.salary_min,
    salaryMax: alert.salary_max,
  };
}

/** The fields stored when saving the current search. */
export function alertFieldsFromSearch(s: SearchState) {
  const extras: SavedSearchExtras = {
    exclude: s.excludeTerms,
    postedWithinHours: s.postedWithinHours,
    searchDescriptions: s.searchDescriptions,
    sort: s.sort,
  };
  return {
    tags: s.terms,
    keywords: JSON.stringify(extras),
    employment_types: s.employmentTypes,
    contract_types: s.contractTypes,
    experience_levels: s.experienceLevels,
    government_only: s.governmentOnly,
    salary_min: s.salaryMin,
    salary_max: s.salaryMax,
  };
}
