"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Alert,
  Job,
  JobDetailResponse,
  RefreshRequest,
  RefreshResponse,
  SearchState,
} from "@/lib/types";
import { DEFAULT_SEARCH } from "@/lib/types";
import { isExpiredByPosting } from "@/lib/format";
import {
  alertFieldsFromSearch,
  applySearchFilters,
  searchFromAlert,
} from "@/lib/search";
import { TickProvider, useNow } from "./TickContext";
import { TopBar } from "./TopBar";
import { Tabs, type TabId } from "./Tabs";
import { SearchBar } from "./SearchBar";
import { JobCard } from "./JobCard";
import { JobDetail } from "./JobDetail";
import { SavedSearches } from "./SavedSearches";
import { EmptyState, Notice, SkeletonCards, btnPrimary } from "./ui";

const REFRESH_COOLDOWN_MS = 12_000;
const LAST_REFRESH_KEY = "nigels-last-refresh";
const SEARCH_KEY = "nigels-search-v2";
const HIDDEN_KEY = "nigels-hidden-v1";

export default function NigelsApp() {
  return (
    <TickProvider>
      <AppShell />
    </TickProvider>
  );
}

interface DetailState {
  jobId: string;
  data: JobDetailResponse;
  loading: boolean;
  failed: boolean;
}

interface NoticeState {
  kind: "info" | "error";
  text: string;
}

function loadStoredSearch(): SearchState {
  try {
    const raw = localStorage.getItem(SEARCH_KEY);
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
  };
}

function AppShell() {
  const now = useNow();

  const [tab, setTab] = useState<TabId>("jobs");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [search, setSearch] = useState<SearchState>(DEFAULT_SEARCH);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busyApplied, setBusyApplied] = useState(false);
  const [busySearches, setBusySearches] = useState(false);
  // True once a refresh has delivered jobs, so a slow initial load can't
  // overwrite fresher data.
  const jobsSupersededRef = useRef(false);
  const hydratedRef = useRef(false);

  // First load: remembered search + hidden jobs + refresh time, then data.
  useEffect(() => {
    setSearch(loadStoredSearch());
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
        const [jobsRes, alertsRes] = await Promise.all([
          fetch("/api/jobs"),
          fetch("/api/alerts"),
        ]);
        if (!jobsRes.ok || !alertsRes.ok) throw new Error("load failed");
        const jobsBody = (await jobsRes.json()) as { jobs: Job[] };
        const alertsBody = (await alertsRes.json()) as { alerts: Alert[] };
        if (!jobsSupersededRef.current) setJobs(jobsBody.jobs);
        setAlerts(alertsBody.alerts);
      } catch {
        if (!jobsSupersededRef.current) setJobs((prev) => prev ?? []);
        setAlerts((prev) => prev ?? []);
        setNotice({
          kind: "error",
          text: "Couldn't load your saved jobs just now — press Refresh to try again.",
        });
      }
    })();
  }, []);

  // Remember the search between visits.
  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(SEARCH_KEY, JSON.stringify(search));
    } catch {
      // Fine.
    }
  }, [search]);

  // Persist hidden jobs, pruning ids that no longer exist.
  useEffect(() => {
    if (!hydratedRef.current || jobs === null) return;
    const valid = new Set(jobs.map((j) => j.id));
    const pruned = [...hiddenIds].filter((id) => valid.has(id));
    if (pruned.length !== hiddenIds.size) {
      setHiddenIds(new Set(pruned));
      return;
    }
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(pruned));
    } catch {
      // Fine.
    }
  }, [jobs, hiddenIds]);

  const handleRefresh = useCallback(
    async (override?: SearchState) => {
      // The cooldown guard lives here (not just on the top-bar button) so
      // every path that triggers a refresh respects it.
      if (refreshing || Date.now() < cooldownUntil) return;
      const active = override ?? search;
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
        // A total failure returns ok=false with no jobs — keep what's on
        // screen rather than wiping the list.
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
    [refreshing, cooldownUntil, search]
  );

  // Live views. Freshness uses the REAL posting time and re-checks every
  // tick, so a job sliding past 24h-since-posting disappears in real time.
  const nowMs = now || Date.now();
  const freshActive = useMemo(
    () =>
      (jobs ?? []).filter(
        (j) => j.status === "active" && !isExpiredByPosting(j, nowMs)
      ),
    [jobs, nowMs]
  );
  const matching = useMemo(
    () => applySearchFilters(freshActive, search, nowMs),
    [freshActive, search, nowMs]
  );
  const displayedJobs = useMemo(
    () => matching.filter((j) => !hiddenIds.has(j.id)),
    [matching, hiddenIds]
  );
  const hiddenCount = matching.length - displayedJobs.length;
  const appliedJobs = useMemo(
    () =>
      (jobs ?? [])
        .filter((j) => j.status === "applied")
        .sort(
          (a, b) =>
            Date.parse(b.applied_at ?? b.first_seen_at) -
            Date.parse(a.applied_at ?? a.first_seen_at)
        ),
    [jobs]
  );

  function openJob(job: Job) {
    setDetail({
      jobId: job.id,
      data: { job, fullDescriptionHtml: null },
      loading: job.source === "reed",
      failed: false,
    });
    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${job.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as JobDetailResponse;
        setDetail((prev) =>
          prev && prev.jobId === job.id
            ? {
                jobId: job.id,
                data,
                loading: false,
                failed: data.job.source === "reed" && !data.fullDescriptionHtml,
              }
            : prev
        );
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

  async function toggleApplied(job: Job, applied: boolean) {
    if (
      !applied &&
      isExpiredByPosting({ ...job, status: "active" }, Date.now())
    ) {
      const sure = window.confirm(
        "This job was posted more than 24 hours ago, so un-applying will remove it from Nigel's completely. Continue?"
      );
      if (!sure) return;
    }
    setBusyApplied(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/applied`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applied }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { job: updated } = (await res.json()) as { job: Job };
      setJobs((list) =>
        (list ?? []).map((j) => (j.id === updated.id ? updated : j))
      );
      setDetail((prev) =>
        prev && prev.jobId === updated.id
          ? { ...prev, data: { ...prev.data, job: updated } }
          : prev
      );
      setNotice(
        applied
          ? { kind: "info", text: "Saved — you'll find it in the Applied tab." }
          : { kind: "info", text: "Moved back to the live jobs list." }
      );
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
    setBusySearches(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          is_active: true,
          ...alertFieldsFromSearch(search),
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
    setSearch(loaded);
    setTab("jobs");
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

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        lastRefreshedAt={lastRefreshedAt}
        refreshing={refreshing}
        cooldownUntil={cooldownUntil}
        onRefresh={() => void handleRefresh()}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
        <div className="mt-4">
          <Tabs
            tab={tab}
            onChange={switchTab}
            counts={{
              jobs: jobs === null ? null : displayedJobs.length,
              applied: jobs === null ? null : appliedJobs.length,
              saved: alerts === null ? null : alerts.length,
            }}
          />
        </div>

        {notice && (
          <div className="mt-4">
            <Notice
              kind={notice.kind}
              text={notice.text}
              onDismiss={() => setNotice(null)}
            />
          </div>
        )}

        <section
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          className="mt-5"
        >
          {tab === "jobs" &&
            (detailView ?? (
              <div className="space-y-5">
                <SearchBar
                  search={search}
                  onChange={setSearch}
                  onSaveSearch={saveSearch}
                  savingSearch={busySearches}
                  resultCount={jobs === null ? null : displayedJobs.length}
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

                {jobs !== null && freshActive.length === 0 && (
                  <EmptyState
                    title="Nothing fresh right now"
                    body="Press Refresh and Nigel's will pull the newest Birmingham listings for your search from Adzuna and Reed."
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

                {jobs !== null &&
                  freshActive.length > 0 &&
                  matching.length === 0 && (
                    <EmptyState
                      title="No jobs match this search"
                      body={`${freshActive.length} fresh job${freshActive.length === 1 ? " is" : "s are"} stored but none fit the current terms and filters. Loosen them, or press Refresh to hunt for new matches.`}
                      action={
                        <button
                          type="button"
                          onClick={() =>
                            setSearch({
                              ...DEFAULT_SEARCH,
                              terms: search.terms,
                              sort: search.sort,
                            })
                          }
                          className={`${btnPrimary} min-h-11 px-5 py-2.5`}
                        >
                          Clear filters
                        </button>
                      }
                    />
                  )}

                {displayedJobs.length > 0 && (
                  <ul className="space-y-3">
                    {displayedJobs.map((job) => (
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
            ))}

          {tab === "applied" &&
            (detailView ?? (
              <>
                {jobs === null && <SkeletonCards />}
                {jobs !== null && appliedJobs.length === 0 && (
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
        </section>
      </main>

      <footer className="border-t border-line py-5 text-center text-xs text-ink-soft">
        Sources: Adzuna &amp; Reed · Birmingham only · Unapplied jobs leave 24
        hours after they were posted
      </footer>
    </div>
  );
}
