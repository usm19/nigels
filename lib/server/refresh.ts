import "server-only";
import type {
  FetchedJob,
  Job,
  JobSource,
  RefreshRequest,
  RefreshResponse,
  SourceHealth,
  SourceQuery,
  SourceStatus,
} from "@/lib/types";
import { JOB_TTL_MS } from "@/lib/format";
import { matchesAnyTerm, matchesEmploymentTypes } from "@/lib/match";
import { getSupabase } from "./supabase";
import { searchAdzuna } from "./adzuna";
import { searchReed } from "./reed";
import { searchJooble } from "./jooble";
import { searchJSearch } from "./jsearch";
import { isExcluded } from "./exclude";
import { env } from "./env";
import { canCallJSearch, recordJSearchCall } from "./jsearch-quota";
import { resolveAdzunaJobs } from "./resolve-source";
import { londonTodayEpochDays, londonTodayStartIso } from "./time";

// Live API calls are allowed at most once per MIN_LIVE_FETCH_GAP_MS. Within
// the gap, refresh still runs the 24-hour cleanup and returns stored jobs.
const MIN_LIVE_FETCH_GAP_MS = 10_000;
// Safety cap so a pile of terms can't hammer the sources' rate limits.
const MAX_QUERIES_PER_SOURCE = 12;

let lastLiveFetchStartedAt = 0;

/**
 * Turn the active search into a de-duplicated list of source queries.
 * Full/part-time go down to the APIs as flags; remote/hybrid become extra
 * search words plus keyword detection on the results; a single selected
 * contract type, any salary bounds and the posted-within window ride along.
 */
function buildQueryPlan(search: RefreshRequest): {
  plan: SourceQuery[];
  capped: boolean;
} {
  const terms: Array<string | null> =
    search.terms.length > 0 ? search.terms : [null];
  const contractFlag =
    search.contractTypes.length === 1 ? search.contractTypes[0] : null;
  const map = new Map<string, SourceQuery>();

  for (const term of terms) {
    const variants: Array<Pick<SourceQuery, "keyword" | "flag">> = [];
    const types = search.employmentTypes;
    if (types.length === 0) {
      variants.push({ keyword: term, flag: null });
    } else {
      if (types.includes("full_time")) variants.push({ keyword: term, flag: "full" });
      if (types.includes("part_time")) variants.push({ keyword: term, flag: "part" });
      if (types.includes("remote")) {
        variants.push({ keyword: term ? `${term} remote` : "remote", flag: null });
      }
      if (types.includes("hybrid")) {
        variants.push({ keyword: term ? `${term} hybrid` : "hybrid", flag: null });
      }
    }
    for (const v of variants) {
      map.set(`${v.keyword ?? ""}::${v.flag ?? ""}`, {
        keyword: v.keyword,
        flag: v.flag,
        contractFlag,
        salaryMin: search.salaryMin,
        salaryMax: search.salaryMax,
        postedWithinHours: search.postedWithinHours,
      });
    }
  }
  const all = [...map.values()];
  return {
    plan: all.slice(0, MAX_QUERIES_PER_SOURCE),
    capped: all.length > MAX_QUERIES_PER_SOURCE,
  };
}

/**
 * The storage gate for a fetched job:
 *  - TITLE-ONLY term matching (descriptions only when explicitly enabled).
 *  - Employment-type gate (OR semantics).
 *  - ALWAYS-ON halal + commission-only exclusion (fetch-time pass).
 *  - Skip jobs already past the 24-hour window since their REAL posting time.
 */
function passesSearchGate(
  job: FetchedJob,
  search: RefreshRequest,
  nowMs: number,
  todayEpochDays: number
): boolean {
  // Permanent, non-negotiable exclusion — nothing excluded is ever stored.
  if (isExcluded(job)) return false;

  if (search.terms.length > 0) {
    const inTitle = matchesAnyTerm(job.title, search.terms);
    const inDescription =
      search.searchDescriptions && job.description
        ? matchesAnyTerm(job.description, search.terms)
        : false;
    if (!inTitle && !inDescription) return false;
  }
  if (!matchesEmploymentTypes(job, search.employmentTypes)) return false;

  if (job.source_posted_date) {
    const postedMs = Date.parse(job.source_posted_date);
    if (!Number.isNaN(postedMs)) {
      if (job.posted_time_precision === "date_only") {
        const postedDays = Math.floor(postedMs / 86_400_000);
        if (todayEpochDays - postedDays >= 1) return false;
      } else if (nowMs - postedMs > JOB_TTL_MS) {
        return false;
      }
    }
  }
  return true;
}

type SourceFn = (q: SourceQuery) => Promise<FetchedJob[]>;

async function runSource(
  fn: SourceFn,
  plan: SourceQuery[],
  search: RefreshRequest,
  nowMs: number,
  todayEpochDays: number
): Promise<{ jobs: FetchedJob[]; health: SourceHealth }> {
  const collected: FetchedJob[] = [];
  let failures = 0;
  // Queries run one after another (not in parallel) to be gentle on each API.
  for (const q of plan) {
    try {
      const results = await fn(q);
      for (const job of results) {
        if (passesSearchGate(job, search, nowMs, todayEpochDays)) {
          collected.push(job);
        }
      }
    } catch {
      failures += 1;
    }
  }
  const health: SourceHealth =
    plan.length === 0
      ? "skipped"
      : failures === 0
        ? "ok"
        : failures === plan.length
          ? "error"
          : "partial";
  return { jobs: collected, health };
}

/** Stable key for the JSearch per-query cooldown. */
function jsearchQueryKey(search: RefreshRequest): string {
  return [
    search.terms.slice().sort().join("+") || "_all",
    search.employmentTypes.slice().sort().join(","),
    search.contractTypes.slice().sort().join(","),
    search.salaryMin ?? "",
    search.salaryMax ?? "",
    search.postedWithinHours ?? "",
  ].join("|");
}

/**
 * JSearch is quota-scarce (200/month hard limit). We only call it when there's
 * a real search term, and only when the persistent quota guard allows it.
 * Between calls, JSearch jobs already in the database keep showing.
 */
async function runJSearch(
  plan: SourceQuery[],
  search: RefreshRequest,
  nowMs: number,
  todayEpochDays: number
): Promise<{ jobs: FetchedJob[]; health: SourceHealth }> {
  if (!env.jsearchApiKey || search.terms.length === 0) {
    return { jobs: [], health: "skipped" };
  }
  const decision = await canCallJSearch(jsearchQueryKey(search), nowMs);
  if (!decision.allowed) {
    return { jobs: [], health: "skipped" };
  }
  // ONE request per allowed call — use the first planned query only.
  const q = plan[0];
  // Record the attempt BEFORE the request: a 429/5xx still consumes the
  // provider's quota, and setting the per-query cooldown now stops us
  // hammering a failing provider on every refresh. This protects the hard
  // 200/month limit even when JSearch is erroring.
  await recordJSearchCall(jsearchQueryKey(search), nowMs);
  try {
    const results = await searchJSearch(q);
    const kept = results.filter((job) =>
      passesSearchGate(job, search, nowMs, todayEpochDays)
    );
    return { jobs: kept, health: "ok" };
  } catch {
    return { jobs: [], health: "error" };
  }
}

function describeSourceProblems(status: SourceStatus): string | null {
  const down = (Object.keys(status) as JobSource[]).filter(
    (s) => status[s] === "error"
  );
  const labels: Record<JobSource, string> = {
    adzuna: "Adzuna",
    reed: "Reed",
    jooble: "Jooble",
    jsearch: "JSearch",
  };
  if (down.length >= 3) {
    return "Couldn't reach most job sources just now — showing your most recent results.";
  }
  if (down.length > 0) {
    return `Couldn't reach ${down.map((s) => labels[s]).join(" or ")} just now — showing everything else plus your most recent results.`;
  }
  const partial = (Object.keys(status) as JobSource[]).some(
    (s) => status[s] === "partial"
  );
  if (partial) {
    return "Some searches didn't complete — results may be slightly incomplete this round.";
  }
  return null;
}

/**
 * Remove active jobs that are past the 24-hour window since their REAL
 * posting time. Three passes because the rule differs by precision:
 *  1. Exact timestamps: older than now − 24h.
 *  2. Date-only rows: dated yesterday or earlier (London time).
 *  3. No posting time at all: fall back to first_seen_at.
 * Applied jobs are always exempt.
 */
async function removeExpiredJobs(): Promise<number> {
  const sb = getSupabase();
  const exactCutoffIso = new Date(Date.now() - JOB_TTL_MS).toISOString();
  const dateOnlyCutoffIso = londonTodayStartIso();
  let removed = 0;

  const exact = await sb
    .from("jobs")
    .delete()
    .eq("status", "active")
    .eq("posted_time_precision", "exact")
    .neq("source", "reed")
    .lt("source_posted_date", exactCutoffIso)
    .select("id");
  if (exact.error) {
    throw new Error(`Could not clean up old jobs: ${exact.error.message}`);
  }
  removed += exact.data?.length ?? 0;

  const dateOnly = await sb
    .from("jobs")
    .delete()
    .eq("status", "active")
    .or("source.eq.reed,posted_time_precision.eq.date_only")
    .lt("source_posted_date", dateOnlyCutoffIso)
    .select("id");
  if (dateOnly.error) {
    throw new Error(`Could not clean up old jobs: ${dateOnly.error.message}`);
  }
  removed += dateOnly.data?.length ?? 0;

  const unknown = await sb
    .from("jobs")
    .delete()
    .eq("status", "active")
    .is("source_posted_date", null)
    .lt("first_seen_at", exactCutoffIso)
    .select("id");
  if (unknown.error) {
    throw new Error(`Could not clean up old jobs: ${unknown.error.message}`);
  }
  removed += unknown.data?.length ?? 0;

  // Safety cap for Adzuna. Adzuna re-stamps aggregated jobs with its crawl
  // time, so a stale advert it keeps re-listing can otherwise claim to be
  // "today" indefinitely. We never trust an Adzuna row to live longer than 24h
  // from when WE first saw it (first_seen_at is preserved across refreshes).
  // Reed-matched jobs have already become 'reed' rows and are unaffected;
  // applied jobs are exempt (status = active filter).
  const adzunaCap = await sb
    .from("jobs")
    .delete()
    .eq("status", "active")
    .eq("source", "adzuna")
    .lt("first_seen_at", exactCutoffIso)
    .select("id");
  if (adzunaCap.error) {
    throw new Error(`Could not clean up old jobs: ${adzunaCap.error.message}`);
  }
  removed += adzunaCap.data?.length ?? 0;

  return removed;
}

/**
 * The heart of Nigel's. The Refresh button re-runs the ACTIVE SEARCH against
 * Adzuna, Reed, Jooble (every refresh) and JSearch (quota-guarded). Results
 * are Birmingham-only, title-matched, halal/commission-filtered, deduped, and
 * stored; existing rows keep their first_seen_at / status / applied_at.
 */
export async function runRefresh(
  search: RefreshRequest
): Promise<RefreshResponse> {
  const sb = getSupabase();
  const startedAt = Date.now();
  const todayEpochDays = londonTodayEpochDays();
  const notes: string[] = [];

  let live = false;
  let newJobs = 0;
  const newKeys = new Set<string>();
  let sourceStatus: SourceStatus = {
    adzuna: "skipped",
    reed: "skipped",
    jooble: "skipped",
    jsearch: "skipped",
  };

  const withinCooldown =
    startedAt - lastLiveFetchStartedAt < MIN_LIVE_FETCH_GAP_MS;

  if (withinCooldown) {
    notes.push("Refreshed a moment ago — showing the latest stored results.");
  } else {
    lastLiveFetchStartedAt = startedAt;
    live = true;

    const { plan, capped } = buildQueryPlan(search);
    if (capped) {
      notes.push(
        "Some searches were skipped this round to stay within the job sources' rate limits."
      );
    }

    const joobleEnabled = env.joobleApiKey !== null;
    const [adzunaRun, reedRun, joobleRun, jsearchRun] = await Promise.all([
      runSource(searchAdzuna, plan, search, startedAt, todayEpochDays),
      runSource(searchReed, plan, search, startedAt, todayEpochDays),
      joobleEnabled
        ? runSource(searchJooble, plan, search, startedAt, todayEpochDays)
        : Promise.resolve({ jobs: [], health: "skipped" as SourceHealth }),
      runJSearch(plan, search, startedAt, todayEpochDays),
    ]);
    sourceStatus = {
      adzuna: adzunaRun.health,
      reed: reedRun.health,
      jooble: joobleRun.health,
      jsearch: jsearchRun.health,
    };
    const problem = describeSourceProblems(sourceStatus);
    if (problem) notes.push(problem);

    // Adzuna is an aggregator: many of its results are jobs that also live on
    // Reed, stamped with Adzuna's CRAWL time, not the real posting time. Truth-
    // check each against Reed (matched by title + employer): matches adopt
    // Reed's real date (stale ones dropped), everything else is kept but demoted
    // to honest day-level. reedRun.jobs lets us match for free before spending
    // any Reed look-ups.
    const adzunaJobs = await resolveAdzunaJobs(
      adzunaRun.jobs,
      reedRun.jobs,
      todayEpochDays,
      reedRun.health
    );

    // De-dupe within this refresh (keep first occurrence of each source id).
    // Re-cast Reed-backed Adzuna jobs now share Reed's (source, id), so they
    // collapse together with anything from the direct Reed fetch — reedRun.jobs
    // go FIRST so the real Reed row (richer description) wins any collision.
    const unique = new Map<string, FetchedJob>();
    for (const job of [
      ...reedRun.jobs,
      ...adzunaJobs,
      ...joobleRun.jobs,
      ...jsearchRun.jobs,
    ]) {
      const key = `${job.source}::${job.source_job_id}`;
      if (!unique.has(key)) unique.set(key, job);
    }

    if (unique.size > 0) {
      const { data: existingRows, error: existingError } = await sb
        .from("jobs")
        .select("source,source_job_id");
      if (existingError) {
        throw new Error(`Could not check stored jobs: ${existingError.message}`);
      }
      const existing = new Set(
        (existingRows ?? []).map(
          (r: { source: string; source_job_id: string }) =>
            `${r.source}::${r.source_job_id}`
        )
      );
      for (const key of unique.keys()) {
        if (!existing.has(key)) newKeys.add(key);
      }
      newJobs = newKeys.size;

      // Upsert deliberately omits id, first_seen_at, status and applied_at:
      // new rows get the database defaults; existing rows keep their original
      // first-seen clock and applied state — only descriptive fields refresh.
      const payload = [...unique.values()];
      for (let i = 0; i < payload.length; i += 400) {
        const chunk = payload.slice(i, i + 400);
        const { error: upsertError } = await sb
          .from("jobs")
          .upsert(chunk, { onConflict: "source,source_job_id" });
        if (upsertError) {
          throw new Error(`Could not save jobs: ${upsertError.message}`);
        }
      }
    }
  }

  const removedJobs = await removeExpiredJobs();

  const { data: jobRows, error: jobsError } = await sb
    .from("jobs")
    .select("*")
    .order("source_posted_date", { ascending: false, nullsFirst: false })
    .order("first_seen_at", { ascending: false });
  if (jobsError) {
    throw new Error(`Could not load jobs: ${jobsError.message}`);
  }
  // Read-time exclusion pass — the always-on filter's safety net, in case any
  // pre-filter rows linger in the database.
  const jobs = ((jobRows ?? []) as Job[]).filter((j) => !isExcluded(j));

  const newJobIds = jobs
    .filter((j) => newKeys.has(`${j.source}::${j.source_job_id}`))
    .map((j) => j.id);
  // Report the number of new jobs the user can actually SEE: a job stored this
  // refresh but immediately expired (or excluded) shouldn't inflate the count.
  newJobs = newJobIds.length;

  return {
    ok: true,
    live,
    refreshedAt: new Date().toISOString(),
    jobs,
    newJobs,
    newJobIds,
    removedJobs,
    sourceStatus,
    message: notes.length > 0 ? notes.join(" ") : null,
  };
}
