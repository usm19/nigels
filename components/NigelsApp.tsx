"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Alert,
  Job,
  JobDetailResponse,
  RefreshResponse,
} from "@/lib/types";
import { isExpired } from "@/lib/format";
import { TickProvider, useNow } from "./TickContext";
import { TopBar } from "./TopBar";
import { Tabs, type TabId } from "./Tabs";
import { JobCard } from "./JobCard";
import { JobDetail } from "./JobDetail";
import { AlertsPanel, type AlertInput } from "./AlertsPanel";
import { EmptyState, Notice, SkeletonCards, btnPrimary } from "./ui";

const REFRESH_COOLDOWN_MS = 12_000;
const LAST_REFRESH_KEY = "nigels-last-refresh";

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

function AppShell() {
  const now = useNow();

  const [tab, setTab] = useState<TabId>("jobs");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [detail, setDetail] = useState<DetailState | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [busyApplied, setBusyApplied] = useState(false);
  const [busyAlerts, setBusyAlerts] = useState(false);

  // First load: stored jobs + alerts, and the remembered refresh time.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_REFRESH_KEY);
      const ms = stored ? Number(stored) : NaN;
      if (Number.isFinite(ms) && ms > 0) setLastRefreshedAt(ms);
    } catch {
      // Private browsing — fine.
    }
    void (async () => {
      try {
        const [jobsRes, alertsRes] = await Promise.all([
          fetch("/api/jobs"),
          fetch("/api/alerts"),
        ]);
        if (!jobsRes.ok || !alertsRes.ok) throw new Error("load failed");
        const jobsBody = (await jobsRes.json()) as { jobs: Job[] };
        const alertsBody = (await alertsRes.json()) as { alerts: Alert[] };
        setJobs(jobsBody.jobs);
        setAlerts(alertsBody.alerts);
      } catch {
        setJobs([]);
        setAlerts([]);
        setNotice({
          kind: "error",
          text: "Couldn't load your saved jobs just now — press Refresh to try again.",
        });
      }
    })();
  }, []);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RefreshResponse;
      setJobs(data.jobs);
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
              ? `Found ${data.newJobs} new job${data.newJobs === 1 ? "" : "s"}.`
              : "No new jobs this time — you're up to date.",
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
  }, [refreshing]);

  // Live views of the data. The expiry check reruns every tick so a job
  // crossing the 24-hour line disappears in real time (backup for the
  // server-side delete).
  const nowMs = now || Date.now();
  const activeJobs = useMemo(
    () =>
      (jobs ?? []).filter(
        (j) => j.status === "active" && !isExpired(j, nowMs)
      ),
    [jobs, nowMs]
  );
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

  async function toggleApplied(job: Job, applied: boolean) {
    if (!applied && isExpired({ ...job, status: "active" }, Date.now())) {
      const sure = window.confirm(
        "This job is older than 24 hours, so un-applying will remove it from Nigel's completely. Continue?"
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

  async function createAlert(input: AlertInput): Promise<boolean> {
    setBusyAlerts(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { alert } = (await res.json()) as { alert: Alert };
      setAlerts((list) => [...(list ?? []), alert]);
      return true;
    } catch {
      setNotice({
        kind: "error",
        text: "Couldn't save the alert — please try again.",
      });
      return false;
    } finally {
      setBusyAlerts(false);
    }
  }

  async function updateAlert(
    id: string,
    patch: Partial<AlertInput>
  ): Promise<boolean> {
    setBusyAlerts(true);
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { alert } = (await res.json()) as { alert: Alert };
      setAlerts((list) =>
        (list ?? []).map((a) => (a.id === alert.id ? alert : a))
      );
      return true;
    } catch {
      setNotice({
        kind: "error",
        text: "Couldn't update the alert — please try again.",
      });
      return false;
    } finally {
      setBusyAlerts(false);
    }
  }

  async function deleteAlert(id: string): Promise<boolean> {
    setBusyAlerts(true);
    try {
      const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAlerts((list) => (list ?? []).filter((a) => a.id !== id));
      return true;
    } catch {
      setNotice({
        kind: "error",
        text: "Couldn't delete the alert — please try again.",
      });
      return false;
    } finally {
      setBusyAlerts(false);
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
              jobs: jobs === null ? null : activeJobs.length,
              applied: jobs === null ? null : appliedJobs.length,
              alerts: alerts === null ? null : alerts.length,
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
              <>
                {jobs === null && <SkeletonCards />}
                {jobs !== null && activeJobs.length === 0 && (
                  <EmptyState
                    title={
                      (alerts?.length ?? 0) === 0
                        ? "First, tell Nigel's what to look for"
                        : "Nothing from the last 24 hours"
                    }
                    body={
                      (alerts?.length ?? 0) === 0
                        ? "Create an alert with the job titles you care about, then press Refresh."
                        : "Press Refresh and Nigel's will check Adzuna and Reed for fresh Birmingham jobs."
                    }
                    action={
                      (alerts?.length ?? 0) === 0 ? (
                        <button
                          type="button"
                          onClick={() => switchTab("alerts")}
                          className={`${btnPrimary} min-h-11 px-5 py-2.5`}
                        >
                          Set up an alert
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleRefresh()}
                          disabled={refreshing}
                          className={`${btnPrimary} min-h-11 px-5 py-2.5`}
                        >
                          Refresh now
                        </button>
                      )
                    }
                  />
                )}
                {activeJobs.length > 0 && (
                  <ul className="space-y-3">
                    {activeJobs.map((job) => (
                      <JobCard
                        key={job.id}
                        job={job}
                        onOpen={() => openJob(job)}
                      />
                    ))}
                  </ul>
                )}
              </>
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
                        onOpen={() => openJob(job)}
                      />
                    ))}
                  </ul>
                )}
              </>
            ))}

          {tab === "alerts" && (
            <AlertsPanel
              alerts={alerts}
              busy={busyAlerts}
              onCreate={createAlert}
              onUpdate={updateAlert}
              onDelete={deleteAlert}
            />
          )}
        </section>
      </main>

      <footer className="border-t border-line py-5 text-center text-xs text-ink-soft">
        Sources: Adzuna &amp; Reed · Birmingham only · Unapplied jobs are
        removed after 24 hours
      </footer>
    </div>
  );
}
