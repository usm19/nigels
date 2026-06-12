"use client";

import { EyeOff } from "lucide-react";
import type { Job } from "@/lib/types";
import {
  EXPERIENCE_LEVEL_LABELS,
  CONTRACT_TYPE_LABELS,
} from "@/lib/types";
import {
  contractTimeLabel,
  formatSalary,
  postedAgo,
  timeAgo,
} from "@/lib/format";
import { useNow } from "./TickContext";
import { Badge } from "./ui";

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
  // jobs it shows when you applied instead.
  const cornerText = !mounted
    ? ""
    : job.status === "applied" && job.applied_at
      ? `applied ${timeAgo(job.applied_at, now)}`
      : (postedAgo(job, now) ?? "time unknown");

  const salary = formatSalary(job.salary_min, job.salary_max);
  const contractTime = contractTimeLabel(job.contract_time);

  return (
    <li className="relative list-none" data-job-id={job.id}>
      <div className="card-shadow group rounded-2xl border border-line bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-bright/50 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink transition-colors group-hover:text-brand sm:text-xl">
            {job.title}
          </h3>
          <span
            className={`shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-gold sm:text-sm ${
              onHide ? "pr-8" : ""
            }`}
          >
            {cornerText}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-soft sm:text-base">
          {job.company ?? "Company not stated"} ·{" "}
          {job.location ?? "Birmingham"}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {isNew && <Badge tone="gold">NEW</Badge>}
          <Badge tone={job.source === "adzuna" ? "brand" : "purple"}>
            {job.source === "adzuna" ? "Adzuna" : "Reed"}
          </Badge>
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
          {job.is_government && <Badge tone="gold">Public sector</Badge>}
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
