-- Run in Supabase, SQL Editor. Counts LinkedIn imports per user so the paid scraper cannot be run up.
create table if not exists public.linkedin_imports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'profile',
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists linkedin_imports_user_day on public.linkedin_imports (user_id, created_at desc);
alter table public.linkedin_imports enable row level security;
-- No policies: only the Edge Function (service role) reads and writes it.

-- Already created it without `kind`? Run:  alter table public.linkedin_imports add column if not exists kind text not null default 'profile';

-- Open to people without an account (added 1 Oct 2026): the import counts by a hashed network address as well.
alter table public.linkedin_imports alter column user_id drop not null;
alter table public.linkedin_imports add column if not exists ip_hash text;
create index if not exists linkedin_imports_ip_day on public.linkedin_imports (ip_hash, created_at desc);
