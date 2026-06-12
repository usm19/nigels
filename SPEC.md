# Nigel's — requirements specification v2 (for reviewers)

Nigel's is a single-user, no-login job tracker for jobs in Birmingham, UK
only, sourced from the Adzuna and Reed APIs (Indeed/LinkedIn deliberately
excluded — no usable APIs; no scraping). Next.js App Router + TypeScript +
Tailwind, Supabase Postgres via service role key, deployed on Render.

## Hard rules

1. Secrets never reach the browser and are never committed. All third-party
   calls happen in server route handlers. No `NEXT_PUBLIC_` secrets. `.env`
   git-ignored; `.env.example` committed blank.
2. Only real, documented API fields may be used.
3. Schema: `database_setup.sql` + additive `migration_v2.sql` (tables
   `alerts` and `jobs`). No destructive schema changes ever.

## THE GOLDEN RULE (v2 headline)

A job's displayed age ("posted X ago") and its 24-hour lifecycle are
calculated from the REAL posting time on the source site
(`source_posted_date`), NEVER from `first_seen_at` or the refresh time.

- **Adzuna** provides `created` (full ISO 8601 timestamp), BUT Adzuna is an
  aggregator and `created` is frequently its *crawl* time, not the real
  posting time (verified: jobs stamped "today" that Reed shows posted weeks
  earlier; many jobs share an identical `created` second — a batch crawl). So
  Adzuna jobs are truth-checked against Reed (matched by title + employer):
  a match adopts Reed's real date as `date_only` (stale ones dropped); an
  unmatched job is shown `date_only` too — never a fabricated minute. A
  24h-from-`first_seen_at` safety cap stops any re-listed stale Adzuna job
  lingering. See `lib/server/resolve-source.ts`.
- **Reed** provides `date` (DD/MM/YYYY, NO time of day) →
  `posted_time_precision = 'date_only'`, age shown honestly as
  "today / yesterday / X days ago". Precise times must never be fabricated
  for Reed. All Reed rows are treated date-only regardless of stored
  precision (covers pre-migration rows).
- `first_seen_at` exists ONLY to drive the "NEW" badge for jobs that
  arrived in the latest refresh (server returns `newJobIds`).
- 24-hour removal: active jobs are deleted when their posting time is >24h
  old (exact sources) or dated yesterday-or-earlier in Europe/London time
  (date-only sources). Jobs with no posting time fall back to
  `first_seen_at` for lifecycle only. Applied jobs are always exempt.

## Title-only matching (v2)

Search terms/tags match the job TITLE only — case-insensitive, with the
term anchored at a word boundary ("admin" matches "Admin Assistant" and
"Administrator" but not "badminton"). Terms starting with a non-word
character (".net developer") skip the anchor so they remain matchable.
Descriptions and company names are NOT matched, except via the "also
search descriptions" toggle which is OFF by default. The same gate applies
at storage time (server) and display time (client) via the shared
lib/match.ts.

## Sources

- **Adzuna** `GET https://api.adzuna.com/v1/api/jobs/gb/search/1` with
  `app_id`, `app_key`; params: `results_per_page` (≤50), `what`,
  `where=Birmingham`, `distance=5` (km), `sort_by=date`, `max_days_old=2`,
  `full_time=1`/`part_time=1`, `permanent=1`/`contract=1`,
  `salary_min`/`salary_max`. Fields used: `id`, `title`, `description`
  (SNIPPET only), `created`, `company.display_name`,
  `location.display_name`, `location.area`, `redirect_url`,
  `contract_time`, `contract_type`, `salary_min`, `salary_max`.
- **Reed** `GET https://www.reed.co.uk/api/1.0/search` with HTTP Basic auth
  (API key as username, empty password); params: `keywords`,
  `locationName=Birmingham`, `distanceFromLocation=5` (miles),
  `resultsToTake` (≤100), `fullTime`/`partTime`, `permanent`/`contract`,
  `minimumSalary`/`maximumSalary`. Fields: `jobId`, `jobTitle`,
  `employerName`, `locationName`, `minimumSalary`, `maximumSalary`, `date`
  (DD/MM/YYYY), `jobDescription` (truncated in search), `jobUrl`. Full
  description: `GET /api/1.0/jobs/{jobId}` on demand (detail view).
- Both fetchers retry once on transient 5xx/network errors.

## Search bar (v2 primary interaction)

A prominent search bar at the top of the Jobs tab is the main way to
search. It holds: term chips with the UK job-title autocomplete; filters —
employment type (FT/PT/Remote/Hybrid), contract (Permanent/Contract),
experience (Entry/Mid/Senior), government/public-sector toggle, salary
min/max, posted-within (1/3/8/24 hours, using real posting time; sub-24h
windows exclude date-only sources honestly), exclude-words, search-
descriptions toggle; sort (newest by posting time / salary high-to-low).
Filter changes apply instantly client-side; the Refresh button re-runs the
active search against the live APIs (10s server gap + 12s client
cooldown; friendly notice + stored results on failure — never crash).
Contract filter semantics: exactly ONE selected type filters strictly;
BOTH selected means "no preference" (must never show fewer results than
one — contract data is sparse/unknown for most Reed rows). "Save search"
stores the FULL filter state in the alerts table — fields without a
dedicated column (exclude words, posted-within, description toggle, sort)
ride as JSON in the free-text `keywords` column. The Saved tab lists saved
searches with Load-and-run and Delete. Jobs can be hidden per-card
(localStorage), with an unhide control. Date-only calendar maths is pinned
to Europe/London on BOTH server and client.

## Classification heuristics (honest best-effort)

- `is_government`: employer/title pattern matching (NHS, councils, civil
  service, HM bodies, ministries/departments, police/fire/ambulance, etc.)
  — there is no official government feed.
- `experience_level`: from title keywords (graduate/trainee/junior → entry;
  senior/lead/principal/head of/director/chief → senior; else mid).
- `contract_type`: Adzuna's real field; for Reed only implied when the
  search itself was contract-filtered.
- Remote/Hybrid: keyword detection on title+description (no reliable flag).
- Birmingham: two-level — location param + small radius at the API, then
  strict text post-filter ("Birmingham" or a Birmingham-city B-postcode
  district: B1–B21, B23–B38, B42–B45, B72–B76).
- Salary filter: pushed down to both APIs AND re-checked on display; with a
  salary filter set, listings with no stated salary are excluded.

## Behaviour invariants (regression-critical)

- Dedupe by `(source, source_job_id)`; existing rows NEVER have
  `first_seen_at`, `status` or `applied_at` overwritten by a refresh.
- Detail view: external link button at the TOP (new tab, noopener), full
  description BELOW (Reed via details endpoint, sanitised HTML; Adzuna
  snippet with a clear note), Mark-as-applied / Un-apply, back navigation.
- Applied jobs are kept forever and exempt from every removal path.
- Royal (light) / Galaxy (dark) themes, remembered; responsive
  mobile+desktop; keyboard accessible; ARIA combobox/tablist patterns.
- `npm run build` clean; no TS errors; no browser console errors.
