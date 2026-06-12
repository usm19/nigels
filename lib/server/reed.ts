import "server-only";
import type { FetchedJob, SourceQuery } from "@/lib/types";
import { env } from "./env";
import { htmlToText, sanitizeJobHtml } from "./sanitize";
import { detectHybrid, detectRemote, isBirminghamLocation } from "./filters";
import { classifyExperience, detectGovernment } from "./classify";
import { fetchJsonWithRetry } from "./http";

// Reed Jobseeker API. Docs: https://www.reed.co.uk/developers/jobseeker
// Auth is HTTP Basic with the API key as the username and an empty password.
// HONEST LIMITATION: Reed's `date` field is DD/MM/YYYY with NO time of day,
// so Reed jobs are stored with posted_time_precision = "date_only" and the
// UI shows "today / yesterday / X days ago" — a precise hour/minute age
// would be fabricated. The search response also only carries a truncated
// description; the details endpoint returns the full one.

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

/** Reed dates are DD/MM/YYYY. Stored at midnight UTC, flagged date-only. */
function parseReedDate(value: string | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(value.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export async function searchReed(q: SourceQuery): Promise<FetchedJob[]> {
  const params = new URLSearchParams({
    locationName: "Birmingham",
    distanceFromLocation: "5",
    resultsToTake: "100",
  });
  if (q.keyword) params.set("keywords", q.keyword);
  if (q.flag === "full") params.set("fullTime", "true");
  if (q.flag === "part") params.set("partTime", "true");
  if (q.contractFlag === "permanent") params.set("permanent", "true");
  if (q.contractFlag === "contract") params.set("contract", "true");
  if (q.salaryMin !== null) {
    params.set("minimumSalary", String(Math.floor(q.salaryMin)));
  }
  if (q.salaryMax !== null) {
    params.set("maximumSalary", String(Math.ceil(q.salaryMax)));
  }

  const data = (await fetchJsonWithRetry(
    `https://www.reed.co.uk/api/1.0/search?${params.toString()}`,
    { headers: { Authorization: reedAuthHeader() } },
    TIMEOUT_MS,
    "Reed"
  )) as { results?: ReedApiJob[] };
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
    const company = r.employerName?.trim() || null;

    // Reed's search response has no contract-time field, so the only honest
    // signal is the flag the API call itself was filtered by.
    const impliedTime =
      q.flag === "full" ? "full_time" : q.flag === "part" ? "part_time" : null;

    jobs.push({
      source: "reed",
      source_job_id: String(r.jobId),
      title,
      company,
      location: r.locationName?.trim() || null,
      description: description || null,
      url: r.jobUrl,
      contract_time: impliedTime,
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
      posted_time_precision: "date_only",
      is_government: detectGovernment(company, title),
      experience_level: classifyExperience(title),
      contract_type: q.contractFlag,
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

  const data = (await fetchJsonWithRetry(
    `https://www.reed.co.uk/api/1.0/jobs/${encodeURIComponent(sourceJobId)}`,
    { headers: { Authorization: reedAuthHeader() } },
    TIMEOUT_MS,
    "Reed"
  )) as { jobDescription?: string } | null;
  if (!data?.jobDescription) return null;

  const html = sanitizeJobHtml(data.jobDescription);
  detailsCache.set(sourceJobId, { html, at: Date.now() });
  return html;
}
