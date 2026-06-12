"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Undo2,
} from "lucide-react";
import type { Job } from "@/lib/types";
import {
  CONTRACT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  SOURCE_LABELS,
} from "@/lib/types";
import {
  contractTimeLabel,
  effectivePrecision,
  formatDateNice,
  formatDateOnlyNice,
  formatDateTimeNice,
  formatSalary,
  postedAgo,
  timeAgo,
} from "@/lib/format";
import { useNow } from "./TickContext";
import { Badge, Spinner, sourceTone, btnGhost, btnPrimary } from "./ui";

interface JobDetailProps {
  job: Job;
  /** Sanitised HTML of the full description (Reed only). */
  fullDescriptionHtml: string | null;
  /** True while the full Reed description is being fetched. */
  loadingFull: boolean;
  /** True when fetching the full description failed (snippet shown instead). */
  fullFailed: boolean;
  busyApplied: boolean;
  onBack: () => void;
  onToggleApplied: (applied: boolean) => void;
}

export function JobDetail({
  job,
  fullDescriptionHtml,
  loadingFull,
  fullFailed,
  busyApplied,
  onBack,
  onToggleApplied,
}: JobDetailProps) {
  const now = useNow();
  const mounted = now !== 0;
  const sourceName = SOURCE_LABELS[job.source];
  const salary = formatSalary(job.salary_min, job.salary_max);
  const contractTime = contractTimeLabel(job.contract_time);
  const ago = mounted ? postedAgo(job, now) : null;
  const dateOnly = effectivePrecision(job) === "date_only";

  return (
    <article aria-labelledby="job-detail-title">
      <button
        type="button"
        onClick={onBack}
        className={`${btnGhost} min-h-11 px-3.5 py-2 text-sm`}
      >
        <ArrowLeft size={16} aria-hidden /> Back to list
      </button>

      <div className="card-shadow mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-7">
        {/* The external link sits at the very TOP, as agreed. */}
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${btnPrimary} min-h-12 w-full px-6 py-3 text-base sm:w-auto`}
        >
          View / Apply on {sourceName}
          <ExternalLink size={17} aria-hidden />
        </a>

        <h1
          id="job-detail-title"
          className="mt-6 font-display text-2xl font-bold text-ink sm:text-3xl"
        >
          {job.title}
        </h1>
        <p className="mt-1 text-base text-ink-soft sm:text-lg">
          {job.company ?? "Company not stated"} ·{" "}
          {job.location ?? "Birmingham"}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge tone={sourceTone(job.source)}>{sourceName}</Badge>
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
          {job.experience_level && (
            <Badge tone="neutral">
              {EXPERIENCE_LEVEL_LABELS[job.experience_level]}
            </Badge>
          )}
          {job.is_remote && <Badge tone="green">Remote</Badge>}
          {job.is_hybrid && <Badge tone="green">Hybrid</Badge>}
          {salary && <Badge tone="gold">{salary}</Badge>}
        </div>

        <dl className="mt-4 space-y-1 text-sm text-ink-soft sm:text-base">
          <div>
            <dt className="sr-only">Listed on the source site</dt>
            <dd>
              {job.source_posted_date ? (
                dateOnly ? (
                  <>
                    Listed{" "}
                    <span className="font-medium text-ink">
                      {formatDateOnlyNice(job.source_posted_date)}
                    </span>{" "}
                    on {sourceName}{" "}
                    <span className="text-ink-soft">
                      ({ago ?? "…"} — {sourceName} gives the date only, not the
                      time of day)
                    </span>
                  </>
                ) : (
                  <>
                    Listed{" "}
                    <span className="font-medium text-ink">
                      {formatDateTimeNice(job.source_posted_date)}
                    </span>{" "}
                    on {sourceName}{" "}
                    <span className="text-ink-soft">
                      ({ago ?? "…"} — the real time it appeared on {sourceName})
                    </span>
                  </>
                )
              ) : (
                <>Posting time unknown — {sourceName} didn&rsquo;t provide it</>
              )}
            </dd>
          </div>
          <div>
            <dt className="sr-only">First spotted</dt>
            <dd className="text-ink-soft">
              First spotted by Nigel&rsquo;s{" "}
              {mounted ? timeAgo(job.first_seen_at, now) : "…"}
            </dd>
          </div>
          {job.status === "applied" && job.applied_at && (
            <div>
              <dt className="sr-only">Applied</dt>
              <dd className="font-medium text-success">
                ✓ You applied on {formatDateNice(job.applied_at)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-5">
          {job.status === "active" ? (
            <button
              type="button"
              onClick={() => onToggleApplied(true)}
              disabled={busyApplied}
              className={`${btnGhost} min-h-11 px-5 py-2.5`}
            >
              {busyApplied ? <Spinner /> : <CheckCircle2 size={17} aria-hidden />}
              Mark as applied
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onToggleApplied(false)}
              disabled={busyApplied}
              className={`${btnGhost} min-h-11 px-5 py-2.5`}
            >
              {busyApplied ? <Spinner /> : <Undo2 size={17} aria-hidden />}
              Un-apply
            </button>
          )}
        </div>

        <hr className="my-6 border-line" />

        <h2 className="font-display text-lg font-semibold text-ink">
          Job description
        </h2>

        {(job.source === "adzuna" || job.source === "jooble") && (
          <p className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-soft">
            This is {sourceName}&rsquo;s preview of the advert — the complete
            description is on the original page, via the button above.
          </p>
        )}
        {job.source === "reed" && loadingFull && (
          <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
            <Spinner /> Fetching the full advert from Reed…
          </p>
        )}
        {job.source === "reed" && !loadingFull && !fullDescriptionHtml && fullFailed && (
          <p className="mt-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink-soft">
            Showing Reed&rsquo;s preview — the full advert wouldn&rsquo;t load
            just now. The button above opens the original.
          </p>
        )}

        {fullDescriptionHtml ? (
          <div
            className="job-description mt-3"
            dangerouslySetInnerHTML={{ __html: fullDescriptionHtml }}
          />
        ) : (
          <p className="mt-3 whitespace-pre-line text-ink/90">
            {job.description ?? "No description provided."}
          </p>
        )}

        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 font-medium text-brand underline underline-offset-4 hover:text-brand-2"
        >
          Open the original listing on {sourceName}
          <ExternalLink size={15} aria-hidden />
        </a>
      </div>
    </article>
  );
}
