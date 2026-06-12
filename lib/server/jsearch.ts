import "server-only";
import type {
  ContractType,
  FetchedJob,
  SourceQuery,
} from "@/lib/types";
import { env } from "./env";
import { htmlToText } from "./sanitize";
import { detectHybrid, detectRemote, mentionsBirmingham } from "./filters";
import { classifyExperience, classifySector } from "./classify";

// JSearch (Google for Jobs aggregator). Provider is selectable:
//  - openwebninja: GET https://api.openwebninja.com/jsearch/search-v2
//                  header  x-api-key
//  - rapidapi:     GET https://jsearch.p.rapidapi.com/search
//                  headers X-RapidAPI-Key + X-RapidAPI-Host
// Verified live shape (openwebninja search-v2): jobs are at data[0].jobs.
//
// HONEST LIMITATIONS:
//  - Quota is 200 requests/month (hard) — guarded by jsearch-quota.ts; this
//    client just performs ONE request (one page) per allowed call.
//  - Posting-time precision VARIES: many listings only resolve to day-level
//    (datetime at midnight UTC) because that is all Google for Jobs exposes.
//    Those are flagged date_only; only true intra-day timestamps are "exact".
//  - job_city is often null, so the Birmingham gate scans location + title +
//    description (the query is already "<term> in birmingham", country=uk).

interface JSearchApiJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string | null;
  job_apply_link?: string | null;
  job_description?: string | null;
  job_is_remote?: boolean | null;
  job_posted_at_datetime_utc?: string | null;
  job_employment_types?: string[] | null;
  job_employment_type?: string | null;
  job_location?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_period?: string | null;
}

const TIMEOUT_MS = 25_000;
const DESCRIPTION_LIMIT = 6000;

/** Map the "posted within" window to JSearch's coarse date_posted filter. */
function mapDatePosted(hours: number | null): string {
  if (hours === null) return "3days";
  if (hours <= 24) return "today";
  if (hours <= 72) return "3days";
  if (hours <= 168) return "week";
  return "month";
}

function mapEmploymentTime(
  types: string[] | null | undefined,
  single: string | null | undefined
): "full_time" | "part_time" | null {
  const all = [...(types ?? []), single ?? ""].join(",").toUpperCase();
  if (all.includes("FULLTIME")) return "full_time";
  if (all.includes("PARTTIME")) return "part_time";
  return null;
}

function mapContractType(
  types: string[] | null | undefined
): ContractType | null {
  const all = (types ?? []).join(",").toUpperCase();
  if (all.includes("CONTRACTOR")) return "contract";
  return null;
}

/**
 * Posting precision: JSearch frequently sets the time to exactly midnight UTC
 * (day-level only). Treat midnight as date_only; any real intra-day time is
 * exact.
 */
function precisionFor(iso: string): "exact" | "date_only" {
  const d = new Date(iso);
  const midnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0;
  return midnight ? "date_only" : "exact";
}

export async function searchJSearch(q: SourceQuery): Promise<FetchedJob[]> {
  const apiKey = env.jsearchApiKey;
  if (!apiKey) return [];

  const queryText = `${q.keyword ?? "jobs"} in birmingham`.trim();
  const params = new URLSearchParams({
    query: queryText,
    country: "uk",
    date_posted: mapDatePosted(q.postedWithinHours),
    page: "1",
  });
  const empTypes: string[] = [];
  if (q.flag === "full") empTypes.push("FULLTIME");
  if (q.flag === "part") empTypes.push("PARTTIME");
  if (q.contractFlag === "contract") empTypes.push("CONTRACTOR");
  if (empTypes.length > 0) params.set("employment_types", empTypes.join(","));

  const provider = env.jsearchProvider;
  const url =
    provider === "rapidapi"
      ? `https://jsearch.p.rapidapi.com/search?${params.toString()}`
      : `https://api.openwebninja.com/jsearch/search-v2?${params.toString()}`;
  const headers: Record<string, string> =
    provider === "rapidapi"
      ? {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        }
      : { "x-api-key": apiKey };

  const res = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`JSearch responded with HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    data?: unknown;
  };

  // search-v2 nests jobs under data[0].jobs; classic /search returns data[].
  let raw: JSearchApiJob[] = [];
  if (Array.isArray(body.data)) {
    const first = body.data[0] as { jobs?: JSearchApiJob[] } | undefined;
    if (first && Array.isArray(first.jobs)) {
      raw = first.jobs;
    } else {
      raw = body.data as JSearchApiJob[];
    }
  }

  const jobs: FetchedJob[] = [];
  for (const r of raw) {
    if (!r.job_id || !r.job_title || !r.job_apply_link) continue;

    const title = htmlToText(r.job_title);
    const description = (r.job_description ?? "")
      .replace(/\s+\n/g, "\n")
      .trim()
      .slice(0, DESCRIPTION_LIMIT);
    const company = r.employer_name?.trim() || null;

    const locationText = [
      r.job_location ?? "",
      r.job_city ?? "",
      r.job_state ?? "",
    ]
      .filter(Boolean)
      .join(", ");
    if (!mentionsBirmingham(locationText, title)) continue;

    const posted =
      r.job_posted_at_datetime_utc &&
      !Number.isNaN(Date.parse(r.job_posted_at_datetime_utc))
        ? new Date(r.job_posted_at_datetime_utc).toISOString()
        : null;
    const haystack = `${title} ${description}`;

    jobs.push({
      source: "jsearch",
      source_job_id: String(r.job_id),
      title,
      company,
      location: locationText || "Birmingham",
      description: description || null,
      url: r.job_apply_link,
      contract_time: mapEmploymentTime(r.job_employment_types, r.job_employment_type),
      is_remote: r.job_is_remote === true || detectRemote(haystack),
      is_hybrid: detectHybrid(haystack),
      salary_min:
        typeof r.job_min_salary === "number" && r.job_min_salary > 0
          ? r.job_min_salary
          : null,
      salary_max:
        typeof r.job_max_salary === "number" && r.job_max_salary > 0
          ? r.job_max_salary
          : null,
      source_posted_date: posted,
      posted_time_precision: posted ? precisionFor(posted) : "date_only",
      is_government: classifySector(company, title) === "government",
      sector: classifySector(company, title),
      experience_level: classifyExperience(title),
      contract_type: mapContractType(r.job_employment_types) ?? q.contractFlag,
    });
  }
  return jobs;
}
