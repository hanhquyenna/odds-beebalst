-- Applied directly to the database by another agent; pulled from the migration history so the repo matches it.
create table if not exists public.intern_pay_observations (
  id bigint generated always as identity primary key,
  employer_key text not null,
  employer_name text not null,
  scope text,
  min_eur_month integer,
  max_eur_month integer,
  gross_or_net text check (gross_or_net in ('gross', 'net', 'not stated')),
  hours_per_week numeric,
  source_type text not null check (source_type in ('employer site', 'vacancy page', 'official', 'job board', 'self-reported')),
  source_url text not null,
  source_date date not null,
  quote text not null,
  confidence text check (confidence in ('high', 'medium', 'low')),
  notes text,
  created_at timestamptz not null default now(),
  constraint quote_short check (char_length(quote) <= 220),
  constraint range_sane check (min_eur_month is null or (min_eur_month between 100 and 3000)),
  constraint range_order check (min_eur_month is null or max_eur_month is null or min_eur_month <= max_eur_month)
);
alter table public.intern_pay_observations enable row level security;
