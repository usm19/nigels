# Nigel's — requirements specification (for reviewers)

Nigel's is a single-user, no-login job tracker for jobs in Birmingham, UK
only, sourced from the Adzuna and Reed APIs (Indeed/LinkedIn deliberately
excluded — no usable APIs; no scraping). Next.js App Router + TypeScript +
Tailwind, Supabase Postgres via service role key, deployed on Render.

## Hard rules

1. Secrets never reach the browser and are never committed. All third-party
   calls happen in server route handlers. No `NEXT_PUBLIC_` secrets. `.env`
   git-ignored; `.env.example` committed blank.
2. Only real, documented API fields may be used.
3. Schema is fixed (see `database_setup.sql`): tables `alerts` and `jobs`.

## Sources

- **Adzuna** `GET https://api.adzuna.com/v1/api/jobs/gb/search/{page}` with
  `app_id`, `app_key`; params used: `results_per_page` (≤50), `what`,
  `where=Birmingham`, `distance` (km, small), `full_time=1`/`part_time=1`,
  `sort_by=date`. Fields used per job: `id`, `title`, `description`
  (SNIPPET only), `created` (ISO 8601), `company.display_name`,
  `location.display_name`, `location.area`, `redirect_url`, `contract_time`,
  `salary_min`, `salary_max`.
- **Reed** `GET https://www.reed.co.uk/api/1.0/search` with HTTP Basic auth
  (API key as username, empty password); params used: `keywords`,
  `locationName=Birmingham`, `distanceFromLocation` (miles, small),
  `resultsToTake` (≤100), `fullTime`/`partTime`. Fields: `jobId`, `jobTitle`,
  `employerName`, `locationName`, `minimumSalary`, `maximumSalary`, `date`
  (DD/MM/YYYY, date only), `jobDescription` (truncated in search), `jobUrl`.
  Full description: `GET /api/1.0/jobs/{jobId}` on demand (detail view).

## Behaviour requirements

- **Birmingham-only at two levels**: location param + small radius at the
  API, then a strict post-filter on location text ("Birmingham" or a B
  postcode). Drop everything else.
- **Refresh button flow (in order)**: load active alerts → query both
  sources per alert (tags as keywords; full/part as API flags;
  remote/hybrid by keyword detection, stored in `is_remote`/`is_hybrid`) →
  Birmingham post-filter → dedupe by `(source, source_job_id)` — new rows
  inserted with `first_seen_at = now()`, existing rows must NOT have
  `first_seen_at` changed (other fields may update) → delete rows with
  `status='active'` AND `first_seen_at` older than 24h (applied exempt) →
  return remaining jobs sorted by `first_seen_at` DESC → record refresh time
  for the UI timer.
- **Rate-limit protection**: ~10–15s minimum gap between live fetches
  (button disabled with spinner); on API failure show last known jobs from
  the DB plus a friendly notice — never crash.
- **Canonical clock is `first_seen_at`** for both "posted X ago" and the
  24-hour removal. `source_posted_date` shown as secondary info in detail.

## UI requirements

- Top bar always visible: "Nigel's" logo/wordmark, live ticking
  "last refreshed X ago" timer + current local time, prominent Refresh,
  light/dark toggle, tab navigation.
- Tabs: Jobs (default), Applied, Alerts.
- Job cards: title, company, location, live "posted X ago", contract type,
  salary if present, Remote/Hybrid tags. Freshest first. Jobs older than 24h
  must not render (UI backup to server deletion).
- Detail view: external link button at the TOP (new tab; `redirect_url` /
  `jobUrl`), full description BELOW it (Reed via details endpoint; Adzuna
  snippet with a clear note), company/location/salary/"posted X ago"/
  "originally listed" date, Mark-as-applied button, clear back navigation.
- Applied: `status='applied'`, `applied_at=now()`, exempt from 24h removal,
  un-apply supported.
- Alerts: CRUD; name + tags + employment-type toggles (Full-time, Part-time,
  Hybrid, Remote). Tag input must autocomplete from a curated list of
  several hundred UK job titles (prefix + substring, case-insensitive,
  keyboard navigable, accessible).
- Themes: light "Royal" (ivory, royal blue/purple, gold accents) and dark
  "Galaxy" (deep-space navy, nebula purple, starfield), remembered across
  visits. High-quality readable typography (~16–18px+ base). Fully
  responsive (mobile + desktop), strong contrast, keyboard navigation,
  ARIA labels, visible focus states.

## Quality bar

`npm run build` clean; no TypeScript errors; no browser console errors;
graceful degradation everywhere; production-grade polish.
