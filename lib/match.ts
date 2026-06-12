// Title/term matching shared by the server (storage gate) and the client
// (display filtering) so the two can never drift apart.
import type { EmploymentType } from "./types";

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Word-boundary-aware, case-insensitive title matching. The term must start
 * at a word boundary, so "admin" matches "Admin Assistant" and
 * "Administrator" but NOT "badminton". Multi-word terms match as a phrase.
 */
export function titleMatchesTerm(title: string, term: string): boolean {
  const t = normalise(term);
  if (!t) return false;
  return new RegExp(`\\b${escapeRegExp(t)}`, "i").test(normalise(title));
}

/** True if the text matches at least one of the terms. */
export function matchesAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => titleMatchesTerm(text, term));
}

/**
 * Employment-type gate with OR semantics: the job must satisfy at least one
 * selected type. An empty selection means "no preference".
 */
export function matchesEmploymentTypes(
  job: {
    contract_time: "full_time" | "part_time" | null;
    is_remote: boolean;
    is_hybrid: boolean;
  },
  selected: EmploymentType[]
): boolean {
  if (selected.length === 0) return true;
  return selected.some((type) => {
    switch (type) {
      case "full_time":
        return job.contract_time === "full_time";
      case "part_time":
        return job.contract_time === "part_time";
      case "remote":
        return job.is_remote;
      case "hybrid":
        return job.is_hybrid;
    }
  });
}

/**
 * Salary filter. With no bounds set, everything passes. With a bound set,
 * jobs that state no salary at all are excluded (we can't know they qualify).
 */
export function matchesSalary(
  job: { salary_min: number | null; salary_max: number | null },
  min: number | null,
  max: number | null
): boolean {
  if (min === null && max === null) return true;
  const lo = job.salary_min;
  const hi = job.salary_max ?? job.salary_min;
  if (lo === null && hi === null) return false;
  if (min !== null && (hi ?? lo ?? 0) < min) return false;
  if (max !== null && (lo ?? hi ?? 0) > max) return false;
  return true;
}
