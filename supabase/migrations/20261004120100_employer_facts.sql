-- Facts about an employer, read from its LinkedIn company page (Apify actor harvestapi~linkedin-company, $0.004 a company), for the "About <company>" block.
-- One row per employer key used in postings.employer; employers that are the same company under two spellings share the same facts.
-- employer_headcount keeps each reading of the headcount with its date, so growth can be shown honestly once there are two readings, and not before.
create table if not exists public.employer_facts (
  employer text primary key,
  linkedin_url text,
  name text,
  tagline text,
  description text,
  website text,
  founded_year int,
  employees int,
  employee_range text,
  followers int,
  company_type text,
  headquarters text,
  locations jsonb,
  linkedin_industry text,
  specialities text[],
  top_locations jsonb,
  top_schools jsonb,
  top_functions jsonb,
  top_fields jsonb,
  fetched_at date not null default current_date
);
create table if not exists public.employer_headcount (
  employer text not null,
  read_on date not null,
  employees int not null,
  primary key (employer, read_on)
);
alter table public.employer_facts enable row level security;
alter table public.employer_headcount enable row level security;
drop policy if exists employer_facts_read on public.employer_facts;
create policy employer_facts_read on public.employer_facts for select using (true);
drop policy if exists employer_headcount_read on public.employer_headcount;
create policy employer_headcount_read on public.employer_headcount for select using (true);
grant select on public.employer_facts, public.employer_headcount to anon, authenticated;
notify pgrst, 'reload schema';

-- A small logo for employers that have none in the app's own list (a pasted job from a new employer), kept as a data URL.
alter table public.employer_facts add column if not exists logo text;
