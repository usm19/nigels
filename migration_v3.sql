-- Nigel's v3 migration. Additive and safe: no data loss, no drops, no destructive changes.
-- Paste this whole file into the Supabase SQL Editor, then click Run.

begin;

-- Three-way sector classification (government / public_sector / private).
alter table public.jobs add column if not exists sector text not null default 'private';

-- Persistent usage tracking so the JSearch free-tier quota (200 requests/month,
-- a hard limit) survives server restarts. One row per query key; plus a global
-- row that counts calls in the current month.
create table if not exists public.api_usage (
  key text primary key,
  last_called_at timestamptz,
  calls_this_month integer not null default 0,
  month text
);

-- (posted_time_precision, source_posted_date, first_seen_at, is_government, status,
--  applied_at and the other existing columns are reused — nothing is dropped.)

alter table public.jobs enable row level security;
alter table public.api_usage enable row level security;

commit;
