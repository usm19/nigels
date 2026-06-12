# Nigel's

A personal job tracker for **Birmingham, UK**. Set up a search in the main
search bar, press **Refresh**, and Nigel's pulls the newest listings from
**Adzuna**, **Reed**, **Jooble** and **JSearch**, keeps only jobs posted
within the last 24 hours, and shows them newest-first. A **navigation
sidebar** (a drawer on mobile) holds the sections.

An **always-on filter** permanently removes roles that don't fit a halal
framework (interest-based finance, alcohol, gambling, pork, and so on) and
commission-only roles, everywhere and with no way to switch it off.

- **Jobs** — the main search bar (title terms with ~800-title UK
  autocomplete; a Sector toggle of All / Public sector / Private; plus
  employment/contract/experience/salary/posted-within filters, sorting,
  hide, save-search) and the live list of everything that isn't a
  government employer. Every card shows the job's age from its **real
  posting time on the source site**: to the minute for Jooble, and
  date-level ("today/yesterday") for Reed, Adzuna and some JSearch listings.
- **Government** — its own search bar and list, showing only jobs at
  government employers (councils, civil service, ministries).
- **Applied** — jobs you've marked as applied; kept forever.
- **Saved** — saved searches; load one and it runs immediately.
- Two themes: **Royal** (light) and **Galaxy** (dark).

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:3000. On this machine you can also just
double-click **`Start Nigels.cmd`**.

Secrets live in `.env` (copy `.env.example` and fill it in). They are only
ever used on the server — never sent to the browser, never committed.

## Database

The schema lives in [`database_setup.sql`](./database_setup.sql), plus the
additive [`migration_v2.sql`](./migration_v2.sql) and
[`migration_v3.sql`](./migration_v3.sql). Run each once in the Supabase
**SQL Editor** (paste the file's contents and click *Run*).

## Deploying on Render

The repo includes a [`render.yaml`](./render.yaml) blueprint. Either use it,
or create a **Web Service** from this repo with:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `REED_API_KEY`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (plus `NODE_VERSION=22.22.3`).

## Honest limitations

- **"Posted X ago" uses each source's own posting time.** Jooble provides a
  full timestamp (precise to the minute); **Reed only provides a date**, and
  **JSearch's precision varies** (many listings resolve only to day-level), so
  those honestly say "today/yesterday" rather than a made-up hour count.
- **Adzuna is an aggregator, so its timestamp is treated as day-level.** Many
  Adzuna listings are jobs that also live on Reed, re-stamped with Adzuna's own
  *crawl* time rather than the real posting time (we've seen a job stamped
  "today" that Reed says was really posted weeks earlier). So Nigel's never
  shows a precise "X minutes ago" for Adzuna: it checks each Adzuna job against
  Reed's own listing (matched by title + employer) and uses Reed's **true date**
  where they match — dropping genuinely stale ones — and otherwise shows an
  honest "today/yesterday". The 24-hour auto-removal uses the same posting time,
  plus a safety cap so no Adzuna job lingers beyond 24 hours from when Nigel's
  first saw it. Matching is best-effort, so some Adzuna jobs that aren't on Reed
  simply show day-level.
- **Jooble and JSearch are bonus sources.** Their free feeds are largely
  national with vague locations, so after Nigel's strict Birmingham + 24-hour
  rules they usually add few jobs — Adzuna and Reed remain the backbone.
  Jooble's `updated` is an indexed/updated time, not strictly the post time.
- **JSearch free tier is 200 requests/month (a hard limit).** Nigel's only
  calls it for real searches, at most once per query per 6 hours, and caps
  itself at 150/month; cached JSearch jobs keep showing between calls.
- **The halal/commission filter is heuristic** keyword + employer matching —
  very strong, but not mathematically perfect — and is permanent (no toggle).
- **Government vs public-sector is employer-pattern detection** (there's no
  official government-jobs feed): councils/civil service/ministries count as
  government; NHS, schools, universities and police as public sector.
- **Adzuna descriptions are snippets** — the full advert lives on the
  external page (the app links to it prominently).
- Reed's search descriptions are truncated; the app fetches the full
  description from Reed's details endpoint when you open a job.
- **Remote/Hybrid are keyword guesses** — neither API has a reliable flag.
- **Government/public-sector and experience-level are best-effort
  detection** from the employer name and job title — there is no official
  feed or structured field for either.
- **Contract type** comes from Adzuna's real field; Reed only reveals it
  when the search itself filters by it.
- With a **salary filter** set, listings that state no salary are hidden
  (their pay is unknowable). Some Adzuna salaries are estimates.
- **Birmingham filtering is text-based** (the word "Birmingham" or a postcode
  in a Birmingham-city district: B1–B21, B23–B38, B42–B45, B72–B76), backed
  by a small search radius — close to, but not exactly, council boundaries.
