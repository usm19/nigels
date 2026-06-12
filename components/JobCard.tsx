"use client";

import { EyeOff } from "lucide-react";
import type { Job } from "@/lib/types";
import {
  EXPERIENCE_LEVEL_LABELS,
  CONTRACT_TYPE_LABELS,
  SOURCE_LABELS,
} from "@/lib/types";
import {
  contractTimeLabel,
  formatSalary,
  postedAgo,
  postedStampCompact,
  timeAgo,
} from "@/lib/format";
import { useNow } from "./TickContext";
import { Badge, sourceTone } from "./ui";

interface JobCardProps {
  job: Job;
  /** Arrived in the latest refresh (driven by first_seen_at — badge only). */
  isNew: boolean;
  onOpen: () => void;
  /** Present only on the live jobs list (not on Applied). */
  onHide?: () => void;
}

export function JobCard({ job, isNew, onOpen, onHide }: JobCardProps) {
  const now = useNow();
  const mounted = now !== 0;

  // The corner shows the REAL posting age (source site time) — for applied
  // jobs it shows when you applied instead — with the exact listing
  // date/time underneath so it's never ambiguous.
  const isApplied = job.status === "applied" && job.applied_at;
  const cornerText = !mounted
    ? ""
    : isApplied
      ? `applied ${timeAgo(job.applied_at as string, now)}`
      : (postedAgo(job, now) ?? "time unknown");
  const exactStamp = !mounted || isApplied ? null : postedStampCompact(job);

  const salary = formatSalary(job.salary_min, job.salary_max);
  const contractTime = contractTimeLabel(job.contract_time);

  return (
    // `group` lives on the li so hover works through the stretched button.
    <li className="group relative list-none" data-job-id={job.id}>
      <div className="card-shadow rounded-2xl border border-line bg-surface p-4 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-gold-bright/50 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink transition-colors group-hover:text-brand sm:text-xl">
            {job.title}
          </h3>
          <span
            className={`flex shrink-0 flex-col items-end text-right ${
              onHide ? "pr-8" : ""
            }`}
          >
            <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-gold sm:text-sm">
              {cornerText}
            </span>
            {exactStamp && (
              <span className="whitespace-nowrap text-[11px] tabular-nums text-ink-soft">
                {exactStamp}
              </span>
            )}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft sm:text-base">
          {job.company ?? "Company not stated"} ·{" "}
          {job.location ?? "Birmingham"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {isNew && <Badge tone="gold">NEW</Badge>}
          <Badge tone={sourceTone(job.source)}>
            {SOURCE_LABELS[job.source]}
          </Badge>
          {job.sector === "government" && <Badge tone="gold">Government</Badge>}
          {job.sector === "public_sector" && (
            <Badge tone="brand">Public sector</Badge>
          )}
          {contractTime && <Badge tone="neutral">{contractTime}</Badge>}
          {job.contract_type && (
            <Badge tone="neutral">
              {CONTRACT_TYPE_LABELS[job.contract_type]}
            </Badge>
          )}
          {job.experience_level && job.experience_level !== "mid" && (
            <Badge tone="neutral">
              {EXPERIENCE_LEVEL_LABELS[job.experience_level]}
            </Badge>
          )}
          {job.is_remote && <Badge tone="green">Remote</Badge>}
          {job.is_hybrid && <Badge tone="green">Hybrid</Badge>}
          {salary && <Badge tone="gold">{salary}</Badge>}
        </div>
      </div>

      {/* Stretched button = the whole card opens the job (keyboard friendly). */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${job.title} at ${job.company ?? "unknown company"}`}
        className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
      />

      {onHide && (
        <button
          type="button"
          onClick={onHide}
          aria-label={`Hide ${job.title}`}
          title="Hide this job"
          className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-ink-soft/60 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-bright"
        >
          <EyeOff size={15} aria-hidden />
        </button>
      )}
    </li>
  );
}
