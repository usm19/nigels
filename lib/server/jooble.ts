import "server-only";
import type { FetchedJob, SourceQuery } from "@/lib/types";
import { env } from "./env";
import { htmlToText } from "./sanitize";
import { detectHybrid, detectRemote, mentionsBirmingham } from "./filters";
import { classifyExperience, classifySector } from "./classify";

// Jooble REST API. Docs: https://jooble.org/api/about
// Auth: the API key goes in the URL PATH; the request is a POST with a JSON
// body. The key is bound to the main jooble.org host (the uk. subdomain
// returns 403 for it), so we bias to the UK by sending location
// "Birmingham, England".
//
// HONEST LIMITATIONS verified against the live API:
//  - Jooble's result `location` field is vague (often just "United Kingdom")
//    and its free feed is largely national, so we keep only results that
//    actually MENTION Birmingham in their title/snippet/location. Yield is
//    therefore lower than Adzuna/Reed — it's a bonus source.
//  - `updated` is an ISO 8601 timestamp WITH time of day. It is Jooble's
//    last-updated/indexed time (generally close to, but technically not, the
//    original posting time). We use it as the posting time (precision exact).

interface JoobleApiJob {
  id?: number | string;
  title?: string;
  company?: string | null;
  location?: string | null;
  snippet?: string | null;
  salary?: string | null;
  type?: string | null;
  link?: string | null;
  updated?: string | null;
}

const TIMEOUT_MS = 20_000;

/** Parse Jooble salary strings like "£25,000 - £30,000 per annum". */
function parseJoobleSalary(
  salary: string | null | undefined
): { min: number | null; max: number | null } {
  if (!salary) return { min: null, max: null };
  // Per-hour / per-day figures aren't annual salaries — don't misreport them.
  if (/per (?:hour|day|week)|hourly|\bp\/?h\b/i.test(salary)) {
    return { min: null, max: null };
  }
  const nums = (salary.match(/[\d,]+(?:\.\d+)?/g) ?? [])
    .map((n) => Number(n.replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 1000 && n <= 1_000_000);
  if (nums.length === 0) return { min: null, max: null };
  if (nums.length === 1) return { min: nums[0], max: nums[0] };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function mapEmploymentTime(
  type: string | null | undefined
): "full_time" | "part_time" | null {
  if (!type) return null;
  if (/full[\s-]?time/i.test(type)) return "full_time";
  if (/part[\s-]?time/i.test(type)) return "part_time";
  return null;
}

export async function searchJooble(q: SourceQuery): Promise<FetchedJob[]> {
  const apiKey = env.joobleApiKey;
  if (!apiKey) return [];

  const body = JSON.stringify({
    keywords: q.keyword ?? "",
    location: "Birmingham, England",
    radius: "25",
    page: "1",
  });

  const res = await fetch(
    `https://jooble.org/api/${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  if (!res.ok) {
    throw new Error(`Jooble responded with HTTP ${res.status}`);
  }
  const data = (await res.json()) as { jobs?: JoobleApiJob[] };
  const results = Array.isArray(data.jobs) ? data.jobs : [];

  const jobs: FetchedJob[] = [];
  for (const r of results) {
    if (r.id === undefined || r.id === null || !r.link || !r.title) continue;

    const title = htmlToText(r.title);
    const description = htmlToText(r.snippet);
    const company = r.company?.trim() || null;

    // Birmingham gate: location field (word/postcode) or the word in the title.
    if (!mentionsBirmingham(r.location, title)) continue;

    const posted =
      r.updated && !Number.isNaN(Date.parse(r.updated))
        ? new Date(r.updated).toISOString()
        : null;
    const { min, max } = parseJoobleSalary(r.salary);
    const haystack = `${title} ${description}`;

    jobs.push({
      source: "jooble",
      source_job_id: String(r.id),
      title,
      company,
      location: r.location?.trim() || "Birmingham",
      description: description || null,
      url: r.link,
      contract_time: mapEmploymentTime(r.type),
      is_remote: detectRemote(haystack),
      is_hybrid: detectHybrid(haystack),
      salary_min: min,
      salary_max: max,
      source_posted_date: posted,
      posted_time_precision: "exact",
      is_government: classifySector(company, title) === "government",
      sector: classifySector(company, title),
      experience_level: classifyExperience(title),
      contract_type: q.contractFlag,
    });
  }
  return jobs;
}
