import "server-only";
import type { FetchedJob } from "@/lib/types";
import { env } from "./env";
import { htmlToText, sanitizeJobHtml } from "./sanitize";
import { detectHybrid, detectRemote, isBirminghamLocation } from "./filters";

// Reed Jobseeker API. Docs: https://www.reed.co.uk/developers/jobseeker
// Auth is HTTP Basic with the API key as the username and an empty password.
// The search response only carries a truncated description and a date-only
// posting date (DD/MM/YYYY); the details endpoint returns the full description.

interface ReedApiJob {
  jobId?: number;
  jobTitle?: string;
  employerName?: string;
  locationName?: string;
  minimumSalary?: number | null;
  maximumSalary?: number | null;
  date?: string;
  jobDescription?: string;
  jobUrl?: string;
}

const TIMEOUT_MS = 20_000;

function reedAuthHeader(): string {
  return "Basic " + Buffer.from(`${env.reedApiKey}:`).toString("base64");
}

/** Reed dates are DD/MM/YYYY with no time. Midnight UTC stands in for the time. */
function parseReedDate(value: string | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * Search Reed for Birmingham jobs.
 * @param keyword search words (an alert tag, optionally with "remote"/"hybrid" added)
 * @param flag pushes full-time/part-time down to the API itself
 */
export async function searchReed(
  keyword: string | null,
  flag: "full" | "part" | null
): Promise<FetchedJob[]> {
  const params = new URLSearchParams({
    locationName: "Birmingham",
    distanceFromLocation: "5",
    resultsToTake: "100",
  });
  if (keyword) params.set("keywords", keyword);
  if (flag === "full") params.set("fullTime", "true");
  if (flag === "part") params.set("partTime", "true");

  const res = await fetch(
    `https://www.reed.co.uk/api/1.0/search?${params.toString()}`,
    {
      headers: { Authorization: reedAuthHeader() },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    throw new Error(`Reed responded with HTTP ${res.status}`);
  }
  const data = (await res.json()) as { results?: ReedApiJob[] };
  const results = Array.isArray(data.results) ? data.results : [];

  const jobs: FetchedJob[] = [];
  for (const r of results) {
    if (r.jobId === undefined || r.jobId === null || !r.jobUrl || !r.jobTitle) {
      continue;
    }

    // Strict Birmingham post-filter. Reed often reports a raw "B" postcode
    // (e.g. "B4 6AJ") instead of the word Birmingham; both count.
    if (!isBirminghamLocation(r.locationName)) continue;

    const title = htmlToText(r.jobTitle);
    const description = htmlToText(r.jobDescription);
    const haystack = `${title} ${description}`;

    // Reed's search response has no contract-time field, so the only honest
    // signal is the flag the API call itself was filtered by.
    const implied =
      flag === "full" ? "full_time" : flag === "part" ? "part_time" : null;

    jobs.push({
      source: "reed",
      source_job_id: String(r.jobId),
      title,
      company: r.employerName?.trim() || null,
      location: r.locationName?.trim() || null,
      description: description || null,
      url: r.jobUrl,
      contract_time: implied,
      is_remote: detectRemote(haystack),
      is_hybrid: detectHybrid(haystack),
      salary_min:
        typeof r.minimumSalary === "number" && r.minimumSalary > 0
          ? r.minimumSalary
          : null,
      salary_max:
        typeof r.maximumSalary === "number" && r.maximumSalary > 0
          ? r.maximumSalary
          : null,
      source_posted_date: parseReedDate(r.date),
    });
  }
  return jobs;
}

// --- Full description (details endpoint) -----------------------------------

const detailsCache = new Map<string, { html: string; at: number }>();
const DETAILS_TTL_MS = 10 * 60 * 1000;

/**
 * Fetch the full job description for a Reed job and return it as sanitised
 * HTML. Cached in memory for a few minutes to avoid hammering Reed when the
 * same advert is opened repeatedly.
 */
export async function fetchReedFullDescriptionHtml(
  sourceJobId: string
): Promise<string | null> {
  const cached = detailsCache.get(sourceJobId);
  if (cached && Date.now() - cached.at < DETAILS_TTL_MS) {
    return cached.html;
  }

  const res = await fetch(
    `https://www.reed.co.uk/api/1.0/jobs/${encodeURIComponent(sourceJobId)}`,
    {
      headers: { Authorization: reedAuthHeader() },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    throw new Error(`Reed details responded with HTTP ${res.status}`);
  }
  const data = (await res.json()) as { jobDescription?: string } | null;
  if (!data?.jobDescription) return null;

  const html = sanitizeJobHtml(data.jobDescription);
  detailsCache.set(sourceJobId, { html, at: Date.now() });
  return html;
}
