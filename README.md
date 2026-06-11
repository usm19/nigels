# Nigel's

A personal job tracker for **Birmingham, UK**. Press **Refresh** and Nigel's
checks **Adzuna** and **Reed** for fresh jobs matching your saved alerts,
records anything new, removes unapplied jobs older than 24 hours, and shows
the list freshest-first.

- **Jobs** — live list; every card shows "posted X minutes/hours ago",
  measured from the moment Nigel's first spotted the job.
- **Applied** — jobs you've marked as applied; these are kept forever.
- **Alerts** — the job titles (tags) and employment types Nigel's hunts for,
  with an autocomplete of ~800 UK job titles.
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

The schema lives in [`database_setup.sql`](./database_setup.sql). Run it once
in the Supabase **SQL Editor** (paste the file's contents and click *Run*).

## Deploying on Render

The repo includes a [`render.yaml`](./render.yaml) blueprint. Either use it,
or create a **Web Service** from this repo with:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment variables: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `REED_API_KEY`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (plus `NODE_VERSION=22.22.3`).

## Honest limitations

- **Adzuna descriptions are snippets** — the full advert lives on the
  external page (the app links to it prominently).
- **Reed posting dates have no time of day**, and its search descriptions are
  truncated; the app fetches the full description from Reed's details
  endpoint when you open a job.
- **Remote/Hybrid are keyword guesses** — neither API has a reliable flag, so
  Nigel's looks for words like "remote", "hybrid" or "work from home" in the
  advert text.
- **Birmingham filtering is text-based** (the word "Birmingham" or a postcode
  in a Birmingham-city district: B1–B21, B23–B38, B42–B45, B72–B76), backed
  by a small search radius — close to, but not exactly, council boundaries.
- "Posted X ago" and the 24-hour clock are measured from when **Nigel's first
  recognised** the job, which can be later than when the source first listed
  it. The original listing date is shown in the detail view.
