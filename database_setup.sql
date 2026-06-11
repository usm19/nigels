create extension if not exists pgcrypto;

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My alert',
  tags text[] not null default '{}',
  employment_types text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
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
  first_seen_at timestamptz not null default now(),
  status text not null default 'active',
  applied_at timestamptz,
  unique (source, source_job_id)
);

create index if not exists jobs_first_seen_idx on public.jobs (first_seen_at desc);
create index if not exists jobs_status_idx on public.jobs (status);

alter table public.alerts enable row level security;
alter table public.jobs enable row level security;
