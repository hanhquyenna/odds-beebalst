-- Growth needs more than one reading. employer_money kept one figure per kind (the latest), so a company's revenue could never
-- show a trend: it now keeps one per kind and year. employer_headcount gets a source: LinkedIn's member count and the headcount
-- a company reports (Wikidata, worldwide, dated) are different measures, so growth is only ever read within one source.
alter table public.employer_money drop constraint if exists employer_money_pkey;
alter table public.employer_money add primary key (employer, kind, year);

alter table public.employer_headcount add column if not exists source text not null default 'linkedin';
alter table public.employer_headcount drop constraint if exists employer_headcount_pkey;
alter table public.employer_headcount add primary key (employer, read_on, source);

notify pgrst, 'reload schema';
