-- Applied directly to the database by another agent; pulled from the migration history so the repo matches it.
create table if not exists public.employer_sources (
  employer text not null,
  source_url text not null,
  source_name text,
  source_kind text not null check (source_kind in ('official_site','annual_report','investor_relations','company_profile','news','review_platform','public_registry','other')),
  retrieved_on date not null default current_date,
  published_on date,
  facts jsonb not null default '{}'::jsonb,
  confidence smallint not null default 3 check (confidence between 1 and 5),
  primary key (employer, source_url)
);

create index if not exists employer_sources_employer_idx on public.employer_sources (employer);

alter table public.employer_sources enable row level security;

drop policy if exists employer_sources_read on public.employer_sources;
create policy employer_sources_read on public.employer_sources
  for select to public using (true);

create table if not exists public.employer_enrichment_queue (
  employer text primary key,
  priority integer not null default 0,
  status text not null default 'pending' check (status in ('pending','in_progress','complete','partial','not_found','blocked')),
  attempts integer not null default 0,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  source_count integer not null default 0,
  notes text
);

create index if not exists employer_enrichment_queue_next_idx
  on public.employer_enrichment_queue (status, priority desc, employer);

alter table public.employer_enrichment_queue enable row level security;

drop policy if exists employer_enrichment_queue_read on public.employer_enrichment_queue;
create policy employer_enrichment_queue_read on public.employer_enrichment_queue
  for select to public using (true);

insert into public.employer_enrichment_queue (employer, priority)
select
  employer,
  count(*) filter (where closed_at is null)::integer as priority
from public.postings
where employer is not null and btrim(employer) <> ''
group by employer
on conflict (employer) do update
set priority = excluded.priority;
