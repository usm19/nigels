-- Nigel's v2 migration. Additive and safe: no data loss, no drops, no destructive changes.
-- Paste this whole file into the Supabase SQL Editor, then click "Run".

begin;

-- Records whether we have an exact posting time (Adzuna) or only a date (Reed),
-- so the UI can show a precise age vs "today/yesterday/X days ago" honestly.
alter table public.jobs
  add column if not exists posted_time_precision text not null default 'exact';
  -- allowed values: 'exact' or 'date_only'

-- New classification fields used by the new filters (all best-effort where the API has no structured field).
alter table public.jobs add column if not exists is_government boolean not null default false;
alter table public.jobs add column if not exists experience_level text;  -- 'entry' / 'mid' / 'senior'
alter table public.jobs add column if not exists contract_type text;     -- 'permanent' / 'contract' where known

-- Let saved alerts store the full search-bar filter state.
alter table public.alerts add column if not exists keywords text;
alter table public.alerts add column if not exists salary_min numeric;
alter table public.alerts add column if not exists salary_max numeric;
alter table public.alerts add column if not exists government_only boolean not null default false;
alter table public.alerts add column if not exists experience_levels text[] not null default '{}';
alter table public.alerts add column if not exists contract_types text[] not null default '{}';

commit;
