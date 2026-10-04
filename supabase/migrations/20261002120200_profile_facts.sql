-- What Jev read from each part of a person's saved profile, against fixed categories. One row per part (a role, a degree or a
-- line of the CV), keyed by a fingerprint of its text: the same text always keeps the same reading, an edited part is read
-- again, a removed part simply stops being used. Written only by the Edge Function read-profile. Replaces strength_cache.
create table if not exists public.profile_facts (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_hash text not null,
  kind text not null check (kind in ('role', 'education', 'line')),
  facts jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (user_id, item_hash)
);
create index if not exists profile_facts_user_day on public.profile_facts (user_id, created_at desc);
alter table public.profile_facts enable row level security;
drop policy if exists profile_facts_own_read on public.profile_facts;
create policy profile_facts_own_read on public.profile_facts for select using (auth.uid() = user_id);
comment on table public.profile_facts is 'Jev reading of one profile part: {standing, recognition, grades, family}. See src/lib/strength.ts.';

drop table if exists public.strength_cache;
