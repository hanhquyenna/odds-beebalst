-- People to ask for a referral, found once in a batch and stored per employer, so clicking a job's Find people button reads the table
-- and scrapes nothing. job_people_runs records which employers were searched, when, and what it cost.
-- Only the Edge Function (service role) and the batch script read and write these; row level security is on with no policy.
create table if not exists public.job_people (
  employer text not null,
  profile_url text not null,
  name text not null,
  headline text not null default '',
  place text not null default '',
  photo text not null default '',
  about text not null default '',
  positions jsonb not null default '[]'::jsonb,
  jev jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (employer, profile_url)
);
alter table public.job_people enable row level security;
create table if not exists public.job_people_runs (
  employer text primary key,
  searched_at timestamptz not null default now(),
  found int not null default 0,
  kept int not null default 0,
  cost_usd numeric not null default 0
);
alter table public.job_people_runs enable row level security;
drop table if exists public.people_cache;
