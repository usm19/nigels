import "server-only";
import type {
  FetchedJob,
  Job,
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
 * contract type and any salary bounds ride along on every query.
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
 *  - TITLE-ONLY term matching (descriptions only when explicitly enabled) —
 *    the APIs' own keyword search matches descriptions too broadly.
 *  - Employment-type gate (OR semantics).
 *  - Skip jobs already past the 24-hour window since their REAL posting time
 *    (Reed returns plenty of week-old listings; storing them is pointless).
 */
function passesSearchGate(
  job: FetchedJob,
  search: RefreshRequest,
  nowMs: number,
  todayEpochDays: number
): boolean {
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

async function runSource(
  source: "adzuna" | "reed",
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
      const results =
        source === "adzuna" ? await searchAdzuna(q) : await searchReed(q);
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

function describeSourceProblems(status: SourceStatus): string | null {
  const down: string[] = [];
  if (status.adzuna === "error") down.push("Adzuna");
  if (status.reed === "error") down.push("Reed");
  if (down.length === 2) {
    return "Couldn't reach Adzuna or Reed just now — showing your most recent results.";
  }
  if (down.length === 1) {
    return `Couldn't reach ${down[0]} just now — its jobs may be missing from this refresh.`;
  }
  if (status.adzuna === "partial" || status.reed === "partial") {
    return "Some searches didn't complete — results may be slightly incomplete this round.";
  }
  return null;
}

/**
 * Remove active jobs that are past the 24-hour window since their REAL
 * posting time. Three passes because the rule differs by precision:
 *  1. Exact timestamps (Adzuna): older than now − 24h.
 *  2. Date-only / all Reed rows: dated yesterday or earlier (London time).
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

  return removed;
}

/**
 * The heart of Nigel's. The Refresh button re-runs the ACTIVE SEARCH:
 *  1. Build a query plan from the search-bar state.
 *  2. Query Adzuna + Reed (Birmingham only, small radius, fresh-first).
 *  3. Birmingham post-filter + title-only term gate + employment gate.
 *  4. De-dupe by (source, source_job_id); insert new rows only — existing
 *     rows keep their first_seen_at, status and applied_at.
 *  5. Delete active jobs past 24h since their REAL posting time (applied exempt).
 *  6. Return everything left, newest-posted first, plus the ids that are new
 *     in this refresh (for the NEW badge).
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
  let sourceStatus: SourceStatus = { adzuna: "skipped", reed: "skipped" };

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

    const [adzunaRun, reedRun] = await Promise.all([
      runSource("adzuna", plan, search, startedAt, todayEpochDays),
      runSource("reed", plan, search, startedAt, todayEpochDays),
    ]);
    sourceStatus = { adzuna: adzunaRun.health, reed: reedRun.health };
    const problem = describeSourceProblems(sourceStatus);
    if (problem) notes.push(problem);

    // De-dupe within this refresh.
    const unique = new Map<string, FetchedJob>();
    for (const job of [...adzunaRun.jobs, ...reedRun.jobs]) {
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
      // new rows get the database defaults (first_seen_at = now()), while
      // existing rows keep their original first-seen clock and applied
      // state — only the descriptive fields are refreshed.
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
  const jobs = (jobRows ?? []) as Job[];

  const newJobIds = jobs
    .filter((j) => newKeys.has(`${j.source}::${j.source_job_id}`))
    .map((j) => j.id);

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
