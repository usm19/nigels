-- Nigel's v4 migration: multi-user login (per-user saved searches + applied jobs).
-- Additive and safe: no data loss, no drops of existing columns/tables. Run once.
--
-- Auth itself is Supabase's built-in auth.users (managed by Supabase). This
-- migration adds per-user OWNERSHIP + row-level-security so each signed-in user
-- can only ever see and change their own saved searches and applied jobs. The
-- shared `jobs` pool and the service-role server code are unaffected (the
-- service role bypasses RLS).

begin;

-- 1) Saved searches become per-user ------------------------------------------
alter table public.alerts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists alerts_user_id_idx on public.alerts(user_id);

-- RLS is already enabled on alerts; add policies so a signed-in user manages
-- ONLY their own rows. (Existing rows have user_id = null and are assigned to
-- the owner account in a later step.)
drop policy if exists alerts_select_own on public.alerts;
create policy alerts_select_own on public.alerts
  for select using (auth.uid() = user_id);
drop policy if exists alerts_insert_own on public.alerts;
create policy alerts_insert_own on public.alerts
  for insert with check (auth.uid() = user_id);
drop policy if exists alerts_update_own on public.alerts;
create policy alerts_update_own on public.alerts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists alerts_delete_own on public.alerts;
create policy alerts_delete_own on public.alerts
  for delete using (auth.uid() = user_id);

-- 2) Per-user applied jobs ----------------------------------------------------
-- A SNAPSHOT of the job at the moment it was applied to, so it survives the
-- shared job's 24-hour expiry (applied jobs are kept forever, per person).
create table if not exists public.applied_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  source_job_id text not null,
  title text not null,
  company text,
  location text,
  description text,
  url text not null,
  contract_time text,
  is_remote boolean not null default false,
  is_hybrid boolean not null default false,
  salary_min numeric,
  salary_max numeric,
  source_posted_date timestamptz,
  posted_time_precision text not null default 'exact',
  is_government boolean not null default false,
  sector text not null default 'private',
  experience_level text,
  contract_type text,
  applied_at timestamptz not null default now(),
  unique (user_id, source, source_job_id)
);
create index if not exists applied_jobs_user_id_idx on public.applied_jobs(user_id);

alter table public.applied_jobs enable row level security;
drop policy if exists applied_select_own on public.applied_jobs;
create policy applied_select_own on public.applied_jobs
  for select using (auth.uid() = user_id);
drop policy if exists applied_insert_own on public.applied_jobs;
create policy applied_insert_own on public.applied_jobs
  for insert with check (auth.uid() = user_id);
drop policy if exists applied_delete_own on public.applied_jobs;
create policy applied_delete_own on public.applied_jobs
  for delete using (auth.uid() = user_id);

commit;
