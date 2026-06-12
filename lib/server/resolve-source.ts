import "server-only";
import type { FetchedJob, SourceQuery, SourceHealth } from "@/lib/types";
import { getSupabase } from "./supabase";
import { searchReed } from "./reed";
import { londonDateMidnightUtcIso } from "./time";

// ============================================================================
//  ADZUNA TRUTH-CHECK AGAINST REED
//
//  Adzuna is an AGGREGATOR. Verified against the live API: a large share of its
//  Birmingham results are jobs that also live on Reed, and Adzuna stamps
//  `created` with its own CRAWL time, not the real posting time. Tell-tale
//  sign: many different jobs share an identical `created` second (a batch
//  crawl). The damage to Nigel's:
//    * a job re-crawled today shows "X minutes ago" when it was really posted
//      days/weeks earlier (seen: one stamped "today" was posted 35 days ago on
//      Reed), and
//    * because the 24-hour removal trusts that fake-fresh time, genuinely old
//      jobs never expire.
//
//  We CANNOT read Adzuna's click-through page to find the real source — Adzuna
//  bot-blocks that (HTTP 403 "Access Denied"). So instead we ask REED'S OWN
//  search API whether it has the same advert (matched STRICTLY by title +
//  employer):
//    * MATCH  -> re-cast the job as a Reed job with Reed's TRUE date (date-only
//               precision); stale ones are dropped, and it de-duplicates with
//               our direct Reed fetch by (source, id).
//    * NO MATCH (or not-yet-checked) -> keep the Adzuna job but DEMOTE it to
//               date-only. Adzuna's minute is untrustworthy, so we never show a
//               precise "X minutes ago" we can't stand behind — only an honest
//               "today / yesterday".
//
//  HONEST LIMITATION: matching is title+employer based, so it only catches jobs
//  we can confidently pair to a Reed listing. Unmatched Adzuna jobs fall back to
//  honest day-level. A persistent safety net (the 24h-from-first-seen cap in
//  refresh.ts) stops any unmatched stale job lingering as "today".
// ============================================================================

// Cap on NEW (uncached) Reed look-ups per refresh, plus an overall wall-clock
// deadline, so a manual Refresh never hangs even if Reed is slow. Cached and
// free (in-refresh) matches cost nothing; only genuinely new, unmatched jobs
// spend the budget, and any overflow is resolved on the next refresh.
const NEW_MATCH_BUDGET = 18;
const CONCURRENCY = 5;
const RESOLUTION_DEADLINE_MS = 12_000;

// The match cache lives in the existing api_usage key/value table
// (key = "adzres:<adzunaId>", payload as JSON in the text `month` column) so it
// survives restarts WITHOUT a new table/migration. Keys are namespaced and
// never collide with the JSearch quota rows.
const CACHE_PREFIX = "adzres:";
const READ_CHUNK = 200;

type Resolution =
  | { kind: "reed"; reedId: string; url: string; date: string | null }
  | { kind: "other" };

// --- Normalisation + strict matching ---------------------------------------

// Tokens that don't identify the role — stripped before comparing titles so an
// aggregator's "Job - Birmingham (Hybrid)" still matches Reed's clean title,
// while genuinely different roles (seniority/specialism) stay distinct.
const TITLE_NOISE = new Set([
  "birmingham", "uk", "england", "midlands", "west", "hybrid", "remote",
  "onsite", "office", "based", "permanent", "temporary", "temp", "contract",
  "fulltime", "parttime", "perm", "ftc", "up", "to", "from", "ref", "salary",
  "bonus", "benefits", "plus", "pa", "pcm", "per", "annum", "hour", "hourly",
  "negotiable", "neg", "doe", "competitive", "k",
]);

function tokenSet(s: string | null, noise?: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const w of (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")) {
    if (!w || /^\d+k?$/.test(w)) continue; // drop pure numbers / "55k"
    if (noise?.has(w)) continue;
    out.add(w);
  }
  return out;
}

// Employer filler that varies between boards but doesn't identify the company.
const EMPLOYER_FILLER = new Set([
  "ltd", "limited", "plc", "llp", "uk", "inc", "recruitment", "recruiting",
  "recruit", "solutions", "group", "services", "consultancy", "consulting",
  "agency", "the", "co", "company", "personnel", "people", "careers",
]);
function employerTokens(s: string | null): Set<string> {
  const out = new Set<string>();
  for (const w of tokenSet(s)) if (!EMPLOYER_FILLER.has(w)) out.add(w);
  return out;
}

function setEq(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
function isSubset(small: Set<string>, big: Set<string>): boolean {
  for (const x of small) if (!big.has(x)) return false;
  return true;
}

/** Same employer? Exact token-set equality, or a subset where the smaller side
 *  has >=2 meaningful tokens (so "LHH" == "LHH Recruitment Solutions" but
 *  "Hays" != "Hays Travel"). */
function sameEmployer(a: string | null, b: string | null): boolean {
  const A = employerTokens(a);
  const B = employerTokens(b);
  if (A.size === 0 || B.size === 0) return false;
  if (setEq(A, B)) return true;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  return small.size >= 2 && isSubset(small, big);
}

/**
 * Find the Reed candidate that is the SAME advert. STRICT: identical role
 * tokens (after noise removal) AND a confident employer match. When several
 * candidates share title+employer (agency reposts) we refuse if their dates
 * disagree by more than a day (ambiguous identity), else take the OLDEST — we
 * must never manufacture freshness. A wrong date is worse than no match.
 */
function matchReed(adz: FetchedJob, candidates: FetchedJob[]): FetchedJob | null {
  const at = tokenSet(adz.title, TITLE_NOISE);
  if (at.size === 0) return null;
  const hits: FetchedJob[] = [];
  for (const c of candidates) {
    if (c.source !== "reed") continue;
    if (!setEq(tokenSet(c.title, TITLE_NOISE), at)) continue;
    if (!sameEmployer(adz.company, c.company)) continue;
    hits.push(c);
  }
  if (hits.length === 0) return null;
  const days = hits
    .map((h) => (h.source_posted_date ? Math.floor(Date.parse(h.source_posted_date) / 86_400_000) : null))
    .filter((d): d is number => d !== null);
  if (days.length > 1 && Math.max(...days) - Math.min(...days) > 1) return null; // ambiguous
  let best = hits[0];
  for (const h of hits) {
    if ((h.source_posted_date ?? "") < (best.source_posted_date ?? "")) best = h; // oldest
  }
  return best;
}

/** Reduce a noisy Adzuna title to a core keyword for Reed's AND-based search. */
function searchKeyword(title: string): string {
  let t = title.toLowerCase();
  const sep = t.search(/\s[-–—|(]/);
  if (sep > 3) t = t.slice(0, sep);
  t = t.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  return t || title;
}

async function searchReedForTitle(title: string): Promise<FetchedJob[]> {
  const q: SourceQuery = {
    keyword: searchKeyword(title),
    flag: null,
    contractFlag: null,
    salaryMin: null,
    salaryMax: null,
    postedWithinHours: null,
  };
  try {
    return await searchReed(q);
  } catch {
    return [];
  }
}

// --- Re-cast / demote (both end up date-only, stale dropped) ----------------

function isStaleDateOnly(dateIso: string | null, todayEpochDays: number): boolean {
  if (!dateIso) return false;
  const ms = Date.parse(dateIso);
  if (Number.isNaN(ms)) return false;
  return todayEpochDays - Math.floor(ms / 86_400_000) >= 1; // dated yesterday or earlier
}

/** Re-cast a Reed-matched Adzuna job as a Reed job with Reed's true date.
 *  Reed dates are already midnight-UTC. Returns null if stale. */
function toReedJob(
  adz: FetchedJob,
  reedId: string,
  reedUrl: string,
  dateIso: string | null,
  todayEpochDays: number
): FetchedJob | null {
  if (isStaleDateOnly(dateIso, todayEpochDays)) return null;
  return {
    ...adz,
    source: "reed",
    source_job_id: reedId,
    url: reedUrl || adz.url,
    source_posted_date: dateIso,
    posted_time_precision: "date_only",
  };
}

/** Keep an unverified Adzuna job but never claim a precise minute: show it
 *  day-level, with the date normalised to its London calendar day (midnight
 *  UTC) like every other date-only source. Returns null if already stale. */
function demoteOrDrop(adz: FetchedJob, todayEpochDays: number): FetchedJob | null {
  const iso = adz.source_posted_date
    ? londonDateMidnightUtcIso(adz.source_posted_date)
    : null;
  if (isStaleDateOnly(iso, todayEpochDays)) return null;
  return { ...adz, source_posted_date: iso, posted_time_precision: "date_only" };
}

// --- Persistent match cache (api_usage key/value) ---------------------------

function parseResolution(month: string | null): Resolution | null {
  if (!month) return null;
  try {
    const o = JSON.parse(month) as Record<string, unknown>;
    if (o.kind === "reed" && o.reedId) {
      return {
        kind: "reed",
        reedId: String(o.reedId),
        url: typeof o.url === "string" ? o.url : "",
        date: typeof o.date === "string" ? o.date : null,
      };
    }
    if (o.kind === "other") return { kind: "other" };
  } catch {
    // corrupt payload — treat as uncached
  }
  return null;
}

async function readResolutions(ids: string[]): Promise<Map<string, Resolution>> {
  const map = new Map<string, Resolution>();
  if (ids.length === 0) return map;
  try {
    const sb = getSupabase();
    for (let i = 0; i < ids.length; i += READ_CHUNK) {
      const keys = ids.slice(i, i + READ_CHUNK).map((id) => CACHE_PREFIX + id);
      const { data } = await sb.from("api_usage").select("key,month").in("key", keys);
      for (const row of (data ?? []) as Array<{ key: string; month: string | null }>) {
        const res = parseResolution(row.month);
        if (res) map.set(row.key.slice(CACHE_PREFIX.length), res);
      }
    }
  } catch {
    // Cache unavailable — fall back to resolving fresh (bounded by the budget).
  }
  return map;
}

async function writeResolutions(
  writes: Array<{ id: string; res: Resolution }>
): Promise<void> {
  if (writes.length === 0) return;
  // Collapse to one row per id — a duplicate key in a single upsert is a
  // Postgres cardinality error that would fail the WHOLE batch.
  const byId = new Map<string, Resolution>();
  for (const w of writes) byId.set(w.id, w.res);
  try {
    const sb = getSupabase();
    const rows = [...byId].map(([id, res]) => ({
      key: CACHE_PREFIX + id,
      month: JSON.stringify(res),
      calls_this_month: 0,
    }));
    await sb.from("api_usage").upsert(rows, { onConflict: "key" });
  } catch {
    // Best-effort: a failed cache write only means we may re-check next time.
  }
}

// --- Orchestration used by the refresh pipeline -----------------------------

/**
 * Truth-check a batch of Adzuna results against Reed. Reed-matched jobs are
 * re-cast with Reed's real date (stale ones dropped); everything else is kept
 * but demoted to honest day-level. `reedPool` is this refresh's direct Reed
 * results, used for free matching before spending any look-ups; `reedHealth`
 * lets us skip the live look-ups entirely when Reed is down.
 */
export async function resolveAdzunaJobs(
  jobs: FetchedJob[],
  reedPool: FetchedJob[],
  todayEpochDays: number,
  reedHealth: SourceHealth
): Promise<FetchedJob[]> {
  if (jobs.length === 0) return jobs;

  // De-duplicate by source_job_id — the multi-query Adzuna fetch concatenates
  // overlapping pages, and dupes would waste budget and corrupt the cache write.
  const uniqueJobs: FetchedJob[] = [];
  const seen = new Set<string>();
  for (const j of jobs) {
    if (!seen.has(j.source_job_id)) {
      seen.add(j.source_job_id);
      uniqueJobs.push(j);
    }
  }

  const cache = await readResolutions([...seen]);
  const out: FetchedJob[] = [];
  const writes: Array<{ id: string; res: Resolution }> = [];
  const toSearch: FetchedJob[] = [];

  const pushReedOrDrop = (
    job: FetchedJob,
    reedId: string,
    url: string,
    date: string | null
  ) => {
    const reed = toReedJob(job, reedId, url, date, todayEpochDays);
    if (reed) out.push(reed); // stale matches are intentionally dropped
  };
  const pushDemoted = (job: FetchedJob) => {
    const d = demoteOrDrop(job, todayEpochDays);
    if (d) out.push(d);
  };

  for (const job of uniqueJobs) {
    const cached = cache.get(job.source_job_id);
    if (cached?.kind === "reed") {
      pushReedOrDrop(job, cached.reedId, cached.url, cached.date);
      continue;
    }
    if (cached?.kind === "other") {
      pushDemoted(job);
      continue;
    }
    // Uncached — try a free match against this refresh's direct Reed results.
    const free = matchReed(job, reedPool);
    if (free) {
      writes.push({
        id: job.source_job_id,
        res: { kind: "reed", reedId: free.source_job_id, url: free.url, date: free.source_posted_date },
      });
      pushReedOrDrop(job, free.source_job_id, free.url, free.source_posted_date);
    } else {
      toSearch.push(job);
    }
  }

  // Spend the budget on the rest — unless Reed is down, in which case demote
  // them all (the cache will catch up on a healthy refresh).
  const canSearch = reedHealth !== "error";
  const budget = canSearch ? toSearch.slice(0, NEW_MATCH_BUDGET) : [];
  for (const job of canSearch ? toSearch.slice(NEW_MATCH_BUDGET) : toSearch) {
    pushDemoted(job);
  }

  const deadline = Date.now() + RESOLUTION_DEADLINE_MS;
  let idx = 0;
  async function worker() {
    while (idx < budget.length) {
      const job = budget[idx++];
      if (Date.now() >= deadline) {
        pushDemoted(job); // out of time — honest day-level, retry next refresh
        continue;
      }
      const m = matchReed(job, await searchReedForTitle(job.title));
      if (m) {
        writes.push({
          id: job.source_job_id,
          res: { kind: "reed", reedId: m.source_job_id, url: m.url, date: m.source_posted_date },
        });
        pushReedOrDrop(job, m.source_job_id, m.url, m.source_posted_date);
      } else {
        writes.push({ id: job.source_job_id, res: { kind: "other" } });
        pushDemoted(job);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, budget.length) }, worker));

  await writeResolutions(writes);
  return out;
}
