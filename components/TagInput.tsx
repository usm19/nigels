"use client";

import { useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { JOB_TITLES } from "@/data/job-titles";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 60;
const MAX_SUGGESTIONS = 8;

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Accessible tag input with job-title autocomplete (combobox pattern).
 * Prefix matches rank above substring matches; keyboard fully supported
 * (arrows, Enter, Escape, Backspace to remove the last tag).
 */
export function TagInput({ value, onChange }: TagInputProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(value);
    const prefix: string[] = [];
    const substring: string[] = [];
    for (const title of JOB_TITLES) {
      if (chosen.has(title)) continue;
      if (title.startsWith(q)) prefix.push(title);
      else if (title.includes(q)) substring.push(title);
    }
    return [...prefix, ...substring].slice(0, MAX_SUGGESTIONS);
  }, [text, value]);

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, " ");
    setText("");
    setHighlight(-1);
    setOpen(false);
    if (!tag || tag.length > MAX_TAG_LENGTH) return;
    if (value.includes(tag) || value.length >= MAX_TAGS) return;
    onChange([...value, tag]);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setOpen(true);
        setHighlight((h) => (h + 1) % suggestions.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setOpen(true);
        setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && highlight >= 0 && suggestions[highlight]) {
        addTag(suggestions[highlight]);
      } else if (text.trim()) {
        addTag(text);
      }
    } else if (e.key === ",") {
      e.preventDefault();
      if (text.trim()) addTag(text);
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlight(-1);
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  const expanded = open && suggestions.length > 0;

  return (
    <div className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-background px-2.5 py-2 transition-colors focus-within:border-gold-bright"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full border border-brand/25 bg-brand/10 px-2.5 py-0.5 text-sm text-brand"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
              className="rounded-full p-0.5 transition-colors hover:bg-brand/15"
            >
              <X size={13} aria-hidden />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={
            expanded && highlight >= 0 ? `${listId}-${highlight}` : undefined
          }
          aria-autocomplete="list"
          aria-label="Add a tag — type a job title"
          placeholder={
            value.length === 0 ? "Type a job title, e.g. admin…" : "Add another…"
          }
          className="min-w-[140px] flex-1 bg-transparent py-1 text-base text-ink outline-none placeholder:text-ink-soft/70"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (text.trim()) setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            setHighlight(-1);
          }}
        />
      </div>

      {expanded && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggested job titles"
          className="card-shadow absolute z-30 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface p-1"
        >
          {suggestions.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              // preventDefault keeps focus in the input so onBlur doesn't
              // close the list before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(s)}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer rounded-lg px-3 py-2 text-base ${
                i === highlight
                  ? "bg-brand/10 text-brand"
                  : "text-ink hover:bg-surface-2"
              }`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-xs text-ink-soft">
        Press Enter to add a tag. Each tag is searched separately.
      </p>
    </div>
  );
}
