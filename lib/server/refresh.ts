import "server-only";
import type {
  Alert,
  EmploymentType,
  FetchedJob,
  Job,
  RefreshResponse,
  SourceHealth,
  SourceStatus,
} from "@/lib/types";
import { JOB_TTL_MS } from "@/lib/format";
import { getSupabase } from "./supabase";
import { searchAdzuna } from "./adzuna";
import { searchReed } from "./reed";
import { matchesEmploymentTypes } from "./filters";

// Live API calls are allowed at most once per MIN_LIVE_FETCH_GAP_MS. Within
// the gap, refresh still runs the 24-hour cleanup and returns stored jobs.
const MIN_LIVE_FETCH_GAP_MS = 10_000;
// Safety cap so a pile of alerts/tags can't hammer the sources' rate limits.
const MAX_QUERIES_PER_SOURCE = 12;

let lastLiveFetchStartedAt = 0;

interface PlannedQuery {
  keyword: string | null;
  flag: "full" | "part" | null;
  /**
   * The employment-type selections of every alert that produced this query.
   * A fetched job is kept if it satisfies at least one of these selections.
   */
  gates: EmploymentType[][];
}

/**
 * Turn the active alerts into a de-duplicated list of source queries.
 * Full/part-time go down to the APIs as flags; remote/hybrid become extra
 * search words plus keyword detection on the results.
 */
function buildQueryPlan(alerts: Alert[]): {
  plan: PlannedQuery[];
  capped: boolean;
} {
  const map = new Map<string, PlannedQuery>();
  for (const alert of alerts) {
    const tags = alert.tags.length > 0 ? alert.tags : [null];
    const types = alert.employment_types;
    for (const tag of tags) {
      const variants: Array<Pick<PlannedQuery, "keyword" | "flag">> = [];
      if (types.length === 0) {
        variants.push({ keyword: tag, flag: null });
      } else {
        if (types.includes("full_time")) {
          variants.push({ keyword: tag, flag: "full" });
        }
        if (types.includes("part_time")) {
          variants.push({ keyword: tag, flag: "part" });
        }
        if (types.includes("remote")) {
          variants.push({ keyword: tag ? `${tag} remote` : "remote", flag: null });
        }
        if (types.includes("hybrid")) {
          variants.push({ keyword: tag ? `${tag} hybrid` : "hybrid", flag: null });
        }
      }
      for (const v of variants) {
        const key = `${v.keyword ?? ""}::${v.flag ?? ""}`;
        const existing = map.get(key);
        if (existing) {
          existing.gates.push(types);
        } else {
          map.set(key, { keyword: v.keyword, flag: v.flag, gates: [types] });
        }
      }
    }
  }
  const all = [...map.values()];
  return {
    plan: all.slice(0, MAX_QUERIES_PER_SOURCE),
    capped: all.length > MAX_QUERIES_PER_SOURCE,
  };
}

async function runSource(
  source: "adzuna" | "reed",
  plan: PlannedQuery[]
): Promise<{ jobs: FetchedJob[]; health: SourceHealth }> {
  const collected: FetchedJob[] = [];
  let failures = 0;
  // Queries run one after another (not in parallel) to be gentle on each API.
  for (const q of plan) {
    try {
      const results =
        source === "adzuna"
          ? await searchAdzuna(q.keyword, q.flag)
          : await searchReed(q.keyword, q.flag);
      for (const job of results) {
        if (q.gates.some((gate) => matchesEmploymentTypes(job, gate))) {
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
 * The heart of Nigel's. In order:
 *  1. Load active alerts.
 *  2. Query Adzuna + Reed for each (Birmingham only, small radius).
 *  3. Strict Birmingham post-filter + employment-type gate (inside the
 *     source clients / runSource).
 *  4. De-dupe by (source, source_job_id); insert new rows only — existing
 *     rows keep their original first_seen_at, status and applied_at.
 *  5. Delete active jobs first seen more than 24 hours ago (applied exempt).
 *  6. Return everything left, freshest first.
 */
export async function runRefresh(): Promise<RefreshResponse> {
  const sb = getSupabase();
  const startedAt = Date.now();
  const notes: string[] = [];

  let live = false;
  let newJobs = 0;
  let sourceStatus: SourceStatus = { adzuna: "skipped", reed: "skipped" };

  const { data: alertRows, error: alertsError } = await sb
    .from("alerts")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (alertsError) {
    throw new Error(`Could not load alerts: ${alertsError.message}`);
  }
  const alerts = (alertRows ?? []) as Alert[];

  const withinCooldown =
    startedAt - lastLiveFetchStartedAt < MIN_LIVE_FETCH_GAP_MS;

  if (withinCooldown) {
    notes.push("Refreshed a moment ago — showing the latest stored results.");
  } else if (alerts.length === 0) {
    notes.push(
      "No active alerts — add one in the Alerts tab, then press Refresh."
    );
  } else {
    lastLiveFetchStartedAt = startedAt;
    live = true;

    const { plan, capped } = buildQueryPlan(alerts);
    if (capped) {
      notes.push(
        "Some searches were skipped this round to stay within the job sources' rate limits."
      );
    }

    const [adzunaRun, reedRun] = await Promise.all([
      runSource("adzuna", plan),
      runSource("reed", plan),
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
      // Which of these has Nigel's already seen? (The whole key set is small
      // for a single-user app, so one read is simplest and safest.)
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
      newJobs = [...unique.keys()].filter((k) => !existing.has(k)).length;

      // Upsert deliberately omits id, first_seen_at, status and applied_at:
      // new rows get the database defaults (first_seen_at = now()), while
      // existing rows keep their original clock and applied state — only the
      // descriptive fields are refreshed.
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

  // 24-hour cleanup, measured from first_seen_at. Applied jobs are exempt.
  const cutoffIso = new Date(Date.now() - JOB_TTL_MS).toISOString();
  const { data: removedRows, error: removeError } = await sb
    .from("jobs")
    .delete()
    .eq("status", "active")
    .lt("first_seen_at", cutoffIso)
    .select("id");
  if (removeError) {
    throw new Error(`Could not clean up old jobs: ${removeError.message}`);
  }

  const { data: jobRows, error: jobsError } = await sb
    .from("jobs")
    .select("*")
    .order("first_seen_at", { ascending: false });
  if (jobsError) {
    throw new Error(`Could not load jobs: ${jobsError.message}`);
  }

  return {
    ok: true,
    live,
    refreshedAt: new Date().toISOString(),
    jobs: (jobRows ?? []) as Job[],
    newJobs,
    removedJobs: removedRows?.length ?? 0,
    sourceStatus,
    message: notes.length > 0 ? notes.join(" ") : null,
  };
}
