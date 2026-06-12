"use client";

import { Play, Trash2 } from "lucide-react";
import type { Alert } from "@/lib/types";
import {
  CONTRACT_TYPE_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
} from "@/lib/types";
import { formatSalary } from "@/lib/format";
import { Badge, EmptyState, btnDanger, btnPrimary } from "./ui";

interface SavedSearchesProps {
  alerts: Alert[] | null;
  busy: boolean;
  onLoad: (alert: Alert) => void;
  onDelete: (alert: Alert) => void;
}

/** Saved searches: load one back into the search bar, or delete it. */
export function SavedSearches({
  alerts,
  busy,
  onLoad,
  onDelete,
}: SavedSearchesProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft sm:text-base">
        Saved searches remember the whole search bar — terms and filters. Load
        one and Nigel&rsquo;s runs it straight away.
      </p>

      {alerts !== null && alerts.length === 0 && (
        <EmptyState
          title="No saved searches yet"
          body='Set up a search in the Jobs tab (terms + filters), then press "Save search" to keep it here for one-tap reuse.'
        />
      )}

      <ul className="space-y-3">
        {(alerts ?? []).map((alert) => {
          const salary = formatSalary(alert.salary_min, alert.salary_max);
          return (
            <li
              key={alert.id}
              className="card-shadow rounded-2xl border border-line bg-surface p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-display text-lg font-semibold text-ink">
                  {alert.name}
                </h3>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onLoad(alert)}
                    className={`${btnPrimary} min-h-11 px-4 py-2 text-sm`}
                  >
                    <Play size={15} aria-hidden /> Load &amp; run
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(alert)}
                    aria-label={`Delete saved search ${alert.name}`}
                    className={`${btnDanger} h-11 w-11 p-0`}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {alert.tags.length > 0 ? (
                  alert.tags.map((tag) => (
                    <Badge key={tag} tone="brand">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-ink-soft">
                    All Birmingham jobs
                  </span>
                )}
                {alert.employment_types.map((t) => (
                  <Badge key={t} tone="neutral">
                    {EMPLOYMENT_TYPE_LABELS[t]}
                  </Badge>
                ))}
                {alert.contract_types.map((t) => (
                  <Badge key={t} tone="neutral">
                    {CONTRACT_TYPE_LABELS[t]}
                  </Badge>
                ))}
                {alert.experience_levels.map((t) => (
                  <Badge key={t} tone="neutral">
                    {EXPERIENCE_LEVEL_LABELS[t]}
                  </Badge>
                ))}
                {alert.government_only && (
                  <Badge tone="gold">Public sector</Badge>
                )}
                {salary && <Badge tone="gold">{salary}</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
