-- What an employer says it is, shown in the job panel under "About <company>".
--   source 'posting' : the employer's own paragraph, taken from one of its postings (scripts/extract_company_about.py), in its own words.
--   source 'odds'    : a short plain description written by odds for a well-known employer that has no such paragraph (scripts/employer_about_odds.json). No figures.
-- Readable by everyone; only the service role and the Management API write it.
create table if not exists public.employer_about (
  employer text primary key,
  about text not null,
  source text not null check (source in ('posting', 'odds')),
  posting_id text,
  updated_at timestamptz not null default now()
);
alter table public.employer_about enable row level security;
drop policy if exists employer_about_read on public.employer_about;
create policy employer_about_read on public.employer_about for select using (true);
grant select on public.employer_about to anon, authenticated;
notify pgrst, 'reload schema';
