-- What we researched about an employer on the open web (research-data/companies/deep): what it does, key facts (size, money,
-- owner, listing), achievements and what matters to someone from abroad, every item with the page it was read on.
-- Filled first for employers without a scraped company page. The table stays closed; company_research reads one employer.
create table if not exists public.employer_research (
  employer text primary key,
  display text,
  data jsonb not null,
  researched_on date,
  updated_at timestamptz not null default now()
);
alter table public.employer_research enable row level security;

create or replace function public.company_research(p_employer text, p_display text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select r.data from employer_research r
  where lower(r.employer) in (lower(trim(p_employer)), lower(trim(coalesce(p_display, ''))))
     or lower(r.display) in (lower(trim(p_employer)), lower(trim(coalesce(p_display, ''))))
  order by (r.employer = p_employer) desc
  limit 1;
$$;

revoke all on function public.company_research(text, text) from public;
grant execute on function public.company_research(text, text) to anon, authenticated;
