# Nigel's

A personal job tracker for **Birmingham, UK**. Set up a search in the main
search bar, press **Refresh**, and Nigel's pulls the newest listings from
**Adzuna** and **Reed**, keeps only jobs posted within the last 24 hours,
and shows them newest-first.

- **Jobs** — the main search bar (title terms with ~800-title UK
  autocomplete, employment/contract/experience/government/salary/
  posted-within filters, sorting, hide, save-search) plus the live list.
  Every card shows the job's age from its **real posting time on the
  source site**: to the minute for Adzuna, "today/yesterday" for Reed
  (Reed's API gives no time of day).
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
additive [`migration_v2.sql`](./migration_v2.sql). Run each once in the
Supabase **SQL Editor** (paste the file's contents and click *Run*).

## Deploying on Render

The repo includes a [`render.yaml`](./render.yaml) blueprint. Either use it,
or create a **Web Service** from this repo with:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `REED_API_KEY`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (plus `NODE_VERSION=22.22.3`).

## Honest limitations

- **"Posted X ago" uses each source's own posting time.** Adzuna provides a
  full timestamp (precise to the minute); **Reed only provides a date**, so
  Reed jobs honestly say "today/yesterday" rather than a made-up hour count.
  The 24-hour auto-removal uses the same posting time.
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
