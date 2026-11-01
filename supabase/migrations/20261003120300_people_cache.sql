-- Shared 30-day cache of people-search results, one row per company, department, city and page, so the same search is paid for once.
-- Only the Edge Function (service role) reads and writes it; row level security is on with no policy, so the public key sees nothing.
create table if not exists public.people_cache (
  cache_key text primary key,
  people jsonb not null,
  widened jsonb not null default '[]'::jsonb,
  more boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.people_cache enable row level security;
