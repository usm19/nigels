"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Alert,
  Job,
  RefreshRequest,
  RefreshResponse,
  SearchScope,
  SearchState,
} from "@/lib/types";
import { DEFAULT_SEARCH } from "@/lib/types";
import { isExpiredByPosting } from "@/lib/format";
import {
  alertFieldsFromSearch,
  applySearchFilters,
  scopeFromAlert,
  searchFromAlert,
} from "@/lib/search";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { TickProvider, useNow } from "./TickContext";
import { TopBar } from "./TopBar";
import { Sidebar, type TabId } from "./Sidebar";
import { SearchBar } from "./SearchBar";
import { JobCard } from "./JobCard";
import { JobDetail } from "./JobDetail";
import { SavedSearches } from "./SavedSearches";
import { SettingsPanel } from "./SettingsPanel";
import { LoginScreen } from "./LoginScreen";
import { EmptyState, Notice, SkeletonCards, Spinner, btnPrimary } from "./ui";

const REFRESH_COOLDOWN_MS = 12_000;
const LAST_REFRESH_KEY = "nigels-last-refresh";
const JOBS_SEARCH_KEY = "nigels-search-jobs-v3";
const GOV_SEARCH_KEY = "nigels-search-gov-v3";
const HIDDEN_KEY = "nigels-hidden-v1";

export default function NigelsApp() {
  return (
    <TickProvider>
      <AuthGate />
    </TickProvider>
  );
}

/**
 * Gate the whole app behind sign-in. `session === undefined` means "still
 * checking" (brief), `null` means signed out (show the login screen), and a
 * value means signed in (show the app).
 */
function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    try {
      await getBrowserSupabase().auth.signOut();
    } catch {
      // onAuthStateChange still fires; nothing else to do.
    }
  }

  if (session === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-soft">
        <Spinner />
      </div>
    );
  }
  if (session === null) return <LoginScreen />;
  return <AppShell userEmail={session.user.email ?? ""} onSignOut={signOut} />;
}

interface DetailState {
  jobId: string;
  data: { job: Job; fullDescriptionHtml: string | null };
  loading: boolean;
  failed: boolean;
}

interface NoticeState {
  kind: "info" | "error";
  text: string;
}

function loadStoredSearch(key: string): SearchState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_SEARCH;
    const parsed = JSON.parse(raw) as Partial<SearchState>;
    return {
      ...DEFAULT_SEARCH,
      ...parsed,
      terms: Array.isArray(parsed.terms) ? parsed.terms : [],
      excludeTerms: Array.isArray(parsed.excludeTerms) ? parsed.excludeTerms : [],
    };
  } catch {
    return DEFAULT_SEARCH;
  }
}

function refreshBody(s: SearchState): RefreshRequest {
  return {
    terms: s.terms,
    searchDescriptions: s.searchDescriptions,
    employmentTypes: s.employmentTypes,
    contractTypes: s.contractTypes,
    salaryMin: s.salaryMin,
    salaryMax: s.salaryMax,
    postedWithinHours: s.postedWithinHours,
  };
}

function AppShell({
  userEmail,
  onSignOut,
}: {
  userEmail: string;
  onSignOut: () => void | Promise<void>;
}) {
  const now = useNow();

  const [tab, setTab] = useState<TabId>("jobs");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  // The signed-in user's own applied jobs (snapshots, status = "applied").
  const [applied, setApplied] = useState<Job[] | null>(null);
  const [jobsSearch, setJobsSearch] = useState<SearchState>(DEFAULT_SEARCH);
  const [govSearch, setGovSearch] = useState<SearchState>(DEFAULT_SEARCH);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busyApplied, setBusyApplied] = useState(false);
  const [busySearches, setBusySearches] = useState(false);
  const jobsSupersededRef = useRef(false);
  const hydratedRef = useRef(false);

  // First load: remembered searches + hidden jobs + refresh time, then data.
  useEffect(() => {
    setJobsSearch(loadStoredSearch(JOBS_SEARCH_KEY));
    setGovSearch(loadStoredSearch(GOV_SEARCH_KEY));
    try {
      const hidden = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]");
      if (Array.isArray(hidden)) setHiddenIds(new Set(hidden.map(String)));
    } catch {
      // Fine — nothing hidden.
    }
    try {
      const stored = localStorage.getItem(LAST_REFRESH_KEY);
      const ms = stored ? Number(stored) : NaN;
      if (Number.isFinite(ms) && ms > 0) setLastRefreshedAt(ms);
    } catch {
      // Private browsing — fine.
    }
    hydratedRef.current = true;

    void (async () => {
      try {
        const [jobsRes, alertsRes, appliedRes] = await Promise.all([
          fetch("/api/jobs"),
          fetch("/api/alerts"),
          fetch("/api/applied"),
        ]);
        if (!jobsRes.ok || !alertsRes.ok || !appliedRes.ok) {
          throw new Error("load failed");
        }
        const jobsBody = (await jobsRes.json()) as { jobs: Job[] };
        const alertsBody = (await alertsRes.json()) as { alerts: Alert[] };
        const appliedBody = (await appliedRes.json()) as { applied: Job[] };
        if (!jobsSupersededRef.current) setJobs(jobsBody.jobs);
        setAlerts(alertsBody.alerts);
        setApplied(appliedBody.applied);
      } catch {
        if (!jobsSupersededRef.current) setJobs((prev) => prev ?? []);
        setAlerts((prev) => prev ?? []);
        setApplied((prev) => prev ?? []);
        setNotice({
          kind: "error",
          text: "Couldn't load your saved jobs just now — press Refresh to try again.",
        });
      }
    })();
  }, []);

  // Remember each search between visits.
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(JOBS_SEARCH_KEY, JSON.stringify(jobsSearch));
    } catch {
      // Fine.
    }
  }, [jobsSearch]);
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(GOV_SEARCH_KEY, JSON.stringify(govSearch));
    } catch {
      // Fine.
    }
  }, [govSearch]);

  // Persist hidden jobs, pruning ids that no longer exist. Pruning only
  // happens against a NON-EMPTY job list — a failed load must not wipe it.
  useEffect(() => {
    if (!hydratedRef.current || jobs === null) return;
    if (jobs.length > 0) {
      const valid = new Set(jobs.map((j) => j.id));
      const pruned = [...hiddenIds].filter((id) => valid.has(id));
      if (pruned.length !== hiddenIds.size) {
        setHiddenIds(new Set(pruned));
        return;
      }
    }
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenIds]));
    } catch {
      // Fine.
    }
  }, [jobs, hiddenIds]);

  const handleRefresh = useCallback(
    async (override?: SearchState) => {
      if (refreshing) return;
      const cooldownLeft = cooldownUntil - Date.now();
      if (cooldownLeft > 0) {
        const secs = Math.ceil(cooldownLeft / 1000);
        setNotice({
          kind: "info",
          text: `One moment — refresh unlocks in ${secs} second${secs === 1 ? "" : "s"}.`,
        });
        return;
      }
      const active =
        override ?? (tab === "government" ? govSearch : jobsSearch);
      setRefreshing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(refreshBody(active)),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RefreshResponse;
        jobsSupersededRef.current = true;
        setJobs((prev) =>
          !data.ok && data.jobs.length === 0 ? (prev ?? []) : data.jobs
        );
        if (data.live) setNewIds(new Set(data.newJobIds));
        const at = Date.parse(data.refreshedAt) || Date.now();
        setLastRefreshedAt(at);
        try {
          localStorage.setItem(LAST_REFRESH_KEY, String(at));
        } catch {
          // Fine — the timer just won't survive a reload.
        }
        if (data.message) {
          setNotice({ kind: data.ok ? "info" : "error", text: data.message });
        } else if (data.live) {
          setNotice({
            kind: "info",
            text:
              data.newJobs > 0
                ? `Found ${data.newJobs} newly posted job${data.newJobs === 1 ? "" : "s"}.`
                : "No newly posted jobs this time — you're up to date.",
          });
        }
      } catch {
        setNotice({
          kind: "error",
          text: "Couldn't reach the sources just now — showing your most recent results.",
        });
      } finally {
        setRefreshing(false);
        setCooldownUntil(Date.now() + REFRESH_COOLDOWN_MS);
      }
    },
    [refreshing, cooldownUntil, tab, jobsSearch, govSearch]
  );

  const nowMs = now || Date.now();
  // Jobs the signed-in user has already applied to (by source + source id).
  const appliedKeys = useMemo(
    () =>
      new Set((applied ?? []).map((j) => `${j.source}::${j.source_job_id}`)),
    [applied]
  );
  const freshActive = useMemo(
    () =>
      (jobs ?? []).filter(
        (j) =>
          j.status === "active" &&
          !isExpiredByPosting(j, nowMs) &&
          !appliedKeys.has(`${j.source}::${j.source_job_id}`)
      ),
    [jobs, nowMs, appliedKeys]
  );
  const jobsMatching = useMemo(
    () => applySearchFilters(freshActive, jobsSearch, nowMs, "jobs"),
    [freshActive, jobsSearch, nowMs]
  );
  const govMatching = useMemo(
    () => applySearchFilters(freshActive, govSearch, nowMs, "government"),
    [freshActive, govSearch, nowMs]
  );
  const jobsDisplayed = useMemo(
    () => jobsMatching.filter((j) => !hiddenIds.has(j.id)),
    [jobsMatching, hiddenIds]
  );
  const govDisplayed = useMemo(
    () => govMatching.filter((j) => !hiddenIds.has(j.id)),
    [govMatching, hiddenIds]
  );
  const appliedJobs = useMemo(
    () =>
      (applied ?? [])
        .slice()
        .sort(
          (a, b) =>
            Date.parse(b.applied_at ?? b.first_seen_at) -
            Date.parse(a.applied_at ?? a.first_seen_at)
        ),
    [applied]
  );

  function openJob(job: Job) {
    setDetail({
      jobId: job.id,
      data: { job, fullDescriptionHtml: null },
      loading: job.source === "reed",
      failed: false,
    });
    // Only Reed needs a live fetch (its full advert). Keyed by source job id, so
    // it works for both live jobs and applied snapshots.
    if (job.source !== "reed") return;
    void (async () => {
      try {
        const res = await fetch(
          `/api/reed-description?id=${encodeURIComponent(job.source_job_id)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { html: string | null };
        setDetail((prev) => {
          if (!prev || prev.jobId !== job.id) return prev;
          return {
            ...prev,
            data: { ...prev.data, fullDescriptionHtml: data.html },
            loading: false,
            failed: !data.html,
          };
        });
      } catch {
        setDetail((prev) =>
          prev && prev.jobId === job.id
            ? { ...prev, loading: false, failed: true }
            : prev
        );
      }
    })();
  }

  function closeDetail() {
    setDetail(null);
  }

  function switchTab(next: TabId) {
    setTab(next);
    setDetail(null);
  }

  function hideJob(job: Job) {
    setHiddenIds((prev) => new Set([...prev, job.id]));
  }

  function unhideAll() {
    setHiddenIds(new Set());
  }

  async function toggleApplied(job: Job, markApplied: boolean) {
    if (
      !markApplied &&
      isExpiredByPosting({ ...job, status: "active" }, Date.now())
    ) {
      const sure = window.confirm(
        "This job was posted more than 24 hours ago, so un-applying will remove it from Nigel's completely. Continue?"
      );
      if (!sure) return;
    }
    const key = `${job.source}::${job.source_job_id}`;
    setBusyApplied(true);
    try {
      const res = await fetch("/api/applied", {
        method: markApplied ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: job.source,
          sourceJobId: job.source_job_id,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (markApplied) {
        const { applied: created } = (await res.json()) as { applied: Job[] };
        const item = created[0];
        setApplied((list) => {
          const others = (list ?? []).filter(
            (a) => `${a.source}::${a.source_job_id}` !== key
          );
          return item ? [item, ...others] : others;
        });
        const appliedAt = item?.applied_at ?? new Date().toISOString();
        setDetail((prev) =>
          prev && prev.jobId === job.id
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  job: { ...prev.data.job, status: "applied", applied_at: appliedAt },
                },
              }
            : prev
        );
        setNotice({
          kind: "info",
          text: "Saved — you'll find it in the Applied tab.",
        });
      } else {
        setApplied((list) =>
          (list ?? []).filter(
            (a) => `${a.source}::${a.source_job_id}` !== key
          )
        );
        setDetail((prev) =>
          prev && prev.jobId === job.id
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  job: { ...prev.data.job, status: "active", applied_at: null },
                },
              }
            : prev
        );
        setNotice({ kind: "info", text: "Moved back to the live jobs list." });
      }
    } catch {
      setNotice({
        kind: "error",
        text: "Couldn't update that job just now — please try again.",
      });
    } finally {
      setBusyApplied(false);
    }
  }

  async function saveSearch(name: string): Promise<boolean> {
    const scope = tab === "government" ? "government" : "jobs";
    const active = scope === "government" ? govSearch : jobsSearch;
    setBusySearches(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          is_active: true,
          ...alertFieldsFromSearch(active, scope),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { alert } = (await res.json()) as { alert: Alert };
      setAlerts((list) => [...(list ?? []), alert]);
      setNotice({
        kind: "info",
        text: `Saved — "${alert.name}" is in your Saved tab.`,
      });
      return true;
    } catch {
      setNotice({
        kind: "error",
        text: "Couldn't save the search — please try again.",
      });
      return false;
    } finally {
      setBusySearches(false);
    }
  }

  function loadSearch(alert: Alert) {
    const loaded = searchFromAlert(alert);
    const scope = scopeFromAlert(alert);
    if (scope === "government") {
      setGovSearch(loaded);
      setTab("government");
    } else {
      setJobsSearch(loaded);
      setTab("jobs");
    }
    setDetail(null);
    void handleRefresh(loaded);
  }

  async function deleteSearch(alert: Alert) {
    if (!window.confirm(`Delete the saved search "${alert.name}"?`)) return;
    setBusySearches(true);
    try {
      const res = await fetch(`/api/alerts/${alert.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAlerts((list) => (list ?? []).filter((a) => a.id !== alert.id));
    } catch {
      setNotice({
        kind: "error",
        text: "Couldn't delete the saved search — please try again.",
      });
    } finally {
      setBusySearches(false);
    }
  }

  const detailView = detail && (
    <JobDetail
      job={detail.data.job}
      fullDescriptionHtml={detail.data.fullDescriptionHtml}
      loadingFull={detail.loading}
      fullFailed={detail.failed}
      busyApplied={busyApplied}
      onBack={closeDetail}
      onToggleApplied={(applied) => void toggleApplied(detail.data.job, applied)}
    />
  );

  function renderJobList(
    scope: SearchScope,
    search: SearchState,
    setSearch: (s: SearchState) => void,
    matchingCount: number,
    displayed: Job[]
  ) {
    const hiddenCount = matchingCount - displayed.length;
    return (
      <div className="space-y-5">
        <SearchBar
          scope={scope}
          search={search}
          onChange={setSearch}
          onSaveSearch={saveSearch}
          savingSearch={busySearches}
          resultCount={jobs === null ? null : displayed.length}
        />

        {hiddenCount > 0 && (
          <p className="text-sm text-ink-soft">
            {hiddenCount} job{hiddenCount === 1 ? "" : "s"} hidden.{" "}
            <button
              type="button"
              onClick={unhideAll}
              className="font-medium text-brand underline underline-offset-4 hover:text-brand-2"
            >
              Show {hiddenCount === 1 ? "it" : "them"}
            </button>
          </p>
        )}

        {jobs === null && <SkeletonCards />}

        {jobs !== null && matchingCount === 0 && (
          <EmptyState
            title={
              scope === "government"
                ? "No government jobs right now"
                : "Nothing matches yet"
            }
            body={
              scope === "government"
                ? "Press Refresh and Nigel's will pull the newest Birmingham listings, then show any from government employers here."
                : "Press Refresh and Nigel's will pull the newest Birmingham listings from Adzuna, Reed, Jooble and JSearch for your search."
            }
            action={
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className={`${btnPrimary} min-h-11 px-5 py-2.5`}
              >
                Refresh now
              </button>
            }
          />
        )}

        {displayed.length > 0 && (
          <ul className="space-y-3">
            {displayed.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                isNew={newIds.has(job.id)}
                onOpen={() => openJob(job)}
                onHide={() => hideJob(job)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  }

  const counts = {
    jobs: jobs === null ? null : jobsDisplayed.length,
    government: jobs === null ? null : govDisplayed.length,
    applied: applied === null ? null : appliedJobs.length,
    saved: alerts === null ? null : alerts.length,
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        lastRefreshedAt={lastRefreshedAt}
        refreshing={refreshing}
        cooldownUntil={cooldownUntil}
        onRefresh={() => void handleRefresh()}
        onMenuClick={() => setMobileNavOpen(true)}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1">
        <Sidebar
          tab={tab}
          counts={counts}
          onChange={switchTab}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        <main className="min-w-0 flex-1 px-4 pb-16">
          {notice && (
            <div className="mt-4">
              <Notice
                kind={notice.kind}
                text={notice.text}
                onDismiss={() => setNotice(null)}
              />
            </div>
          )}

          <section className="mt-5">
            {tab === "jobs" &&
              (detailView ??
                renderJobList(
                  "jobs",
                  jobsSearch,
                  setJobsSearch,
                  jobsMatching.length,
                  jobsDisplayed
                ))}

            {tab === "government" &&
              (detailView ??
                renderJobList(
                  "government",
                  govSearch,
                  setGovSearch,
                  govMatching.length,
                  govDisplayed
                ))}

            {tab === "applied" &&
              (detailView ?? (
                <>
                  {applied === null && <SkeletonCards />}
                  {applied !== null && appliedJobs.length === 0 && (
                    <EmptyState
                      title="Nothing applied yet"
                      body="When you mark a job as applied, it moves here and is kept safe — applied jobs never expire."
                    />
                  )}
                  {appliedJobs.length > 0 && (
                    <ul className="space-y-3">
                      {appliedJobs.map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          isNew={false}
                          onOpen={() => openJob(job)}
                        />
                      ))}
                    </ul>
                  )}
                </>
              ))}

            {tab === "saved" && (
              <SavedSearches
                alerts={alerts}
                busy={busySearches}
                onLoad={loadSearch}
                onDelete={(alert) => void deleteSearch(alert)}
              />
            )}

            {tab === "settings" && (
              <SettingsPanel userEmail={userEmail} onSignOut={onSignOut} />
            )}
          </section>
        </main>
      </div>

      <footer className="border-t border-line py-5 text-center text-xs text-ink-soft">
        Sources: Adzuna · Reed · Jooble · JSearch — Birmingham only · Unapplied
        jobs leave 24 hours after they were posted
      </footer>
    </div>
  );
}
