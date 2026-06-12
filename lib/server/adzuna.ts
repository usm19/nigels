import "server-only";
import type { FetchedJob, SourceQuery } from "@/lib/types";
import { env } from "./env";
import { htmlToText } from "./sanitize";
import { detectHybrid, detectRemote, isBirminghamLocation } from "./filters";
import { classifyExperience, classifySector } from "./classify";
import { fetchJsonWithRetry } from "./http";

// Adzuna GB job search. Docs: https://developer.adzuna.com/
// Notes:
//  - `description` is a snippet, NOT the full advert — the full text lives on
//    the external page at `redirect_url`.
//  - `created` is a real, full ISO 8601 posting timestamp — this is what the
//    displayed job age is calculated from (posted_time_precision = "exact").

interface AdzunaApiJob {
  id?: number | string;
  title?: string;
  description?: string;
  created?: string;
  redirect_url?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  contract_time?: string;
  contract_type?: string;
  salary_min?: number;
  salary_max?: number;
}

const TIMEOUT_MS = 20_000;

export async function searchAdzuna(q: SourceQuery): Promise<FetchedJob[]> {
  const params = new URLSearchParams({
    app_id: env.adzunaAppId,
    app_key: env.adzunaAppKey,
    "content-type": "application/json",
    results_per_page: "50",
    where: "Birmingham",
    distance: "5",
    sort_by: "date",
    // Nigel's only keeps jobs for 24h after posting, so let the API
    // pre-trim to the last two days (small buffer for clock differences).
    max_days_old: "2",
  });
  if (q.keyword) params.set("what", q.keyword);
  if (q.flag === "full") params.set("full_time", "1");
  if (q.flag === "part") params.set("part_time", "1");
  if (q.contractFlag === "permanent") params.set("permanent", "1");
  if (q.contractFlag === "contract") params.set("contract", "1");
  if (q.salaryMin !== null) params.set("salary_min", String(Math.floor(q.salaryMin)));
  if (q.salaryMax !== null) params.set("salary_max", String(Math.ceil(q.salaryMax)));
  // Tighten the window when the user wants very fresh jobs (we keep ≤24h anyway).
  if (q.postedWithinHours !== null && q.postedWithinHours <= 24) {
    params.set("max_days_old", "1");
  }

  const data = (await fetchJsonWithRetry(
    `https://api.adzuna.com/v1/api/jobs/gb/search/1?${params.toString()}`,
    {},
    TIMEOUT_MS,
    "Adzuna"
  )) as { results?: AdzunaApiJob[] };
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
    const company = r.company?.display_name?.trim() || null;

    const apiContractTime =
      r.contract_time === "full_time" || r.contract_time === "part_time"
        ? r.contract_time
        : null;
    const impliedTime =
      q.flag === "full" ? "full_time" : q.flag === "part" ? "part_time" : null;

    const apiContractType =
      r.contract_type === "permanent" || r.contract_type === "contract"
        ? r.contract_type
        : null;

    const posted =
      r.created && !Number.isNaN(Date.parse(r.created))
        ? new Date(r.created).toISOString()
        : null;

    jobs.push({
      source: "adzuna",
      source_job_id: String(r.id),
      title,
      company,
      location: r.location?.display_name?.trim() || null,
      description: description || null,
      url: r.redirect_url,
      contract_time: apiContractTime ?? impliedTime,
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
      posted_time_precision: "exact",
      is_government: classifySector(company, title) === "government",
      sector: classifySector(company, title),
      experience_level: classifyExperience(title),
      contract_type: apiContractType ?? q.contractFlag,
    });
  }
  return jobs;
}
