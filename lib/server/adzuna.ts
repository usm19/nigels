import "server-only";
import type { FetchedJob } from "@/lib/types";
import { env } from "./env";
import { htmlToText } from "./sanitize";
import { detectHybrid, detectRemote, isBirminghamLocation } from "./filters";

// Adzuna GB job search. Docs: https://developer.adzuna.com/
// Note: Adzuna's `description` is a snippet, NOT the full advert — the full
// text lives on the external page at `redirect_url`.

interface AdzunaApiJob {
  id?: number | string;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  contract_time?: string;
  salary_min?: number;
  salary_max?: number;
}

const TIMEOUT_MS = 20_000;

/**
 * Search Adzuna for Birmingham jobs.
 * @param keyword search words (an alert tag, optionally with "remote"/"hybrid" added)
 * @param flag pushes full-time/part-time down to the API itself
 */
export async function searchAdzuna(
  keyword: string | null,
  flag: "full" | "part" | null
): Promise<FetchedJob[]> {
  const params = new URLSearchParams({
    app_id: env.adzunaAppId,
    app_key: env.adzunaAppKey,
    "content-type": "application/json",
    results_per_page: "50",
    where: "Birmingham",
    distance: "5",
    sort_by: "date",
  });
  if (keyword) params.set("what", keyword);
  if (flag === "full") params.set("full_time", "1");
  if (flag === "part") params.set("part_time", "1");

  const res = await fetch(
    `https://api.adzuna.com/v1/api/jobs/gb/search/1?${params.toString()}`,
    { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!res.ok) {
    throw new Error(`Adzuna responded with HTTP ${res.status}`);
  }
  const data = (await res.json()) as { results?: AdzunaApiJob[] };
  const results = Array.isArray(data.results) ? data.results : [];

  const jobs: FetchedJob[] = [];
  for (const r of results) {
    if (r.id === undefined || r.id === null || !r.redirect_url || !r.title) {
      continue;
    }

    // Strict Birmingham post-filter on the location text (display name + area).
    const locationText = [
      r.location?.display_name ?? "",
      ...(Array.isArray(r.location?.area) ? r.location.area : []),
    ].join(", ");
    if (!isBirminghamLocation(locationText)) continue;

    const title = htmlToText(r.title);
    const description = htmlToText(r.description);
    const haystack = `${title} ${description}`;

    const apiContract =
      r.contract_time === "full_time" || r.contract_time === "part_time"
        ? r.contract_time
        : null;
    // If the API was asked for only full-time (or only part-time) jobs, trust
    // that for results missing the field.
    const implied =
      flag === "full" ? "full_time" : flag === "part" ? "part_time" : null;

    const posted =
      r.created && !Number.isNaN(Date.parse(r.created))
        ? new Date(r.created).toISOString()
        : null;

    jobs.push({
      source: "adzuna",
      source_job_id: String(r.id),
      title,
      company: r.company?.display_name?.trim() || null,
      location: r.location?.display_name?.trim() || null,
      description: description || null,
      url: r.redirect_url,
      contract_time: apiContract ?? implied,
      is_remote: detectRemote(haystack),
      is_hybrid: detectHybrid(haystack),
      salary_min:
        typeof r.salary_min === "number" && r.salary_min > 0
          ? r.salary_min
          : null,
      salary_max:
        typeof r.salary_max === "number" && r.salary_max > 0
          ? r.salary_max
          : null,
      source_posted_date: posted,
    });
  }
  return jobs;
}
