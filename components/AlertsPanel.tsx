"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { Alert, EmploymentType } from "@/lib/types";
import { EMPLOYMENT_TYPES, EMPLOYMENT_TYPE_LABELS } from "@/lib/types";
import { TagInput } from "./TagInput";
import { Badge, EmptyState, Spinner, btnDanger, btnGhost, btnPrimary } from "./ui";

export interface AlertInput {
  name: string;
  tags: string[];
  employment_types: EmploymentType[];
  is_active: boolean;
}

interface AlertsPanelProps {
  alerts: Alert[] | null;
  busy: boolean;
  onCreate: (input: AlertInput) => Promise<boolean>;
  onUpdate: (id: string, patch: Partial<AlertInput>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

interface FormState {
  id: string | null; // null = creating a new alert
  name: string;
  tags: string[];
  employment_types: EmploymentType[];
}

export function AlertsPanel({
  alerts,
  busy,
  onCreate,
  onUpdate,
  onDelete,
}: AlertsPanelProps) {
  const [form, setForm] = useState<FormState | null>(null);

  function startNew() {
    setForm({ id: null, name: "", tags: [], employment_types: [] });
  }

  function startEdit(alert: Alert) {
    setForm({
      id: alert.id,
      name: alert.name,
      tags: alert.tags,
      employment_types: alert.employment_types,
    });
  }

  function toggleType(type: EmploymentType) {
    setForm((f) =>
      f
        ? {
            ...f,
            employment_types: f.employment_types.includes(type)
              ? f.employment_types.filter((t) => t !== type)
              : [...f.employment_types, type],
          }
        : f
    );
  }

  async function save() {
    if (!form) return;
    const input: AlertInput = {
      name: form.name.trim() || "My alert",
      tags: form.tags,
      employment_types: form.employment_types,
      is_active: true,
    };
    const ok = form.id
      ? await onUpdate(form.id, {
          name: input.name,
          tags: input.tags,
          employment_types: input.employment_types,
        })
      : await onCreate(input);
    if (ok) setForm(null);
  }

  async function remove(alert: Alert) {
    if (
      !window.confirm(
        `Delete the alert "${alert.name}"? Nigel's will stop searching for it.`
      )
    ) {
      return;
    }
    await onDelete(alert.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft sm:text-base">
          Alerts tell Nigel&rsquo;s what to hunt for when you press Refresh.
        </p>
        {form === null && (
          <button
            type="button"
            onClick={startNew}
            className={`${btnPrimary} min-h-11 shrink-0 px-4 py-2.5`}
          >
            <Plus size={17} aria-hidden /> New alert
          </button>
        )}
      </div>

      {form !== null && (
        <form
          className="card-shadow rounded-2xl border border-gold-bright/40 bg-surface p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h3 className="font-display text-lg font-semibold text-ink">
            {form.id ? "Edit alert" : "New alert"}
          </h3>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Name
            </span>
            <input
              type="text"
              className="input"
              value={form.name}
              maxLength={100}
              placeholder="e.g. Office jobs"
              onChange={(e) =>
                setForm((f) => (f ? { ...f, name: e.target.value } : f))
              }
            />
          </label>

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-ink">
              Tags — job titles to search for
            </span>
            <TagInput
              value={form.tags}
              onChange={(tags) => setForm((f) => (f ? { ...f, tags } : f))}
            />
          </div>

          <fieldset className="mt-4">
            <legend className="mb-1.5 text-sm font-medium text-ink">
              Employment types (optional)
            </legend>
            <div className="flex flex-wrap gap-2">
              {EMPLOYMENT_TYPES.map((type) => {
                const on = form.employment_types.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleType(type)}
                    className={`min-h-11 rounded-xl border px-4 text-sm font-medium transition-all duration-150 sm:text-base ${
                      on
                        ? "border-transparent bg-gradient-to-r from-brand to-brand-2 text-on-brand shadow"
                        : "border-line bg-background text-ink-soft hover:border-gold-bright/60 hover:text-ink"
                    }`}
                  >
                    {EMPLOYMENT_TYPE_LABELS[type]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-ink-soft">
              Remote and Hybrid are best-effort — Nigel&rsquo;s looks for those
              words in the advert text.
            </p>
          </fieldset>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className={`${btnPrimary} min-h-11 px-5 py-2.5`}
            >
              {busy && <Spinner />}
              {form.id ? "Save changes" : "Create alert"}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className={`${btnGhost} min-h-11 px-5 py-2.5`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {alerts !== null && alerts.length === 0 && form === null && (
        <EmptyState
          title="No alerts yet"
          body="Nigel's needs at least one alert to know which jobs to hunt for. Add tags like “admin” or “warehouse operative”."
          action={
            <button
              type="button"
              onClick={startNew}
              className={`${btnPrimary} min-h-11 px-5 py-2.5`}
            >
              <Plus size={17} aria-hidden /> Create your first alert
            </button>
          }
        />
      )}

      <ul className="space-y-3">
        {(alerts ?? []).map((alert) => (
          <li
            key={alert.id}
            className={`card-shadow rounded-2xl border bg-surface p-4 sm:p-5 ${
              alert.is_active ? "border-line" : "border-line opacity-60"
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-lg font-semibold text-ink">
                {alert.name}
              </h3>
              {!alert.is_active && <Badge tone="neutral">Paused</Badge>}
              <div className="ml-auto flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                  <span className="sr-only sm:not-sr-only">Active</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={alert.is_active}
                    aria-label={`Alert ${alert.name} active`}
                    disabled={busy}
                    onClick={() =>
                      void onUpdate(alert.id, { is_active: !alert.is_active })
                    }
                    className={`relative h-7 w-12 rounded-full border transition-colors duration-150 ${
                      alert.is_active
                        ? "border-transparent bg-gradient-to-r from-brand to-brand-2"
                        : "border-line bg-surface-2"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition-all duration-150 ${
                        alert.is_active ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </label>
                <button
                  type="button"
                  onClick={() => startEdit(alert)}
                  aria-label={`Edit alert ${alert.name}`}
                  className={`${btnGhost} h-11 w-11 p-0`}
                >
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(alert)}
                  aria-label={`Delete alert ${alert.name}`}
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
                  No tags — searches all Birmingham jobs
                </span>
              )}
              {alert.employment_types.map((t) => (
                <Badge key={t} tone="neutral">
                  {EMPLOYMENT_TYPE_LABELS[t]}
                </Badge>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
