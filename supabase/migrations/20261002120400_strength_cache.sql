-- What Jev read of a person's CV for one job (employer standing, prizes, grades, closeness to the job).
-- One row per (person, CV, job). The same CV text and the same job always give the same stored answer, so the
-- numbers on the page do not change from one visit to the next. Written only by the Edge Function judge-strength.
create table if not exists public.strength_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  cv_hash text not null,
  posting_id text not null,
  answers jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  primary key (user_id, cv_hash, posting_id)
);

create index if not exists strength_cache_user_day on public.strength_cache (user_id, created_at desc);

alter table public.strength_cache enable row level security;

drop policy if exists strength_cache_own_read on public.strength_cache;
create policy strength_cache_own_read on public.strength_cache for select using (auth.uid() = user_id);

comment on table public.strength_cache is 'Jev reading of a CV against one posting: {standing, recognition, grades, relevance, evidence}. See src/lib/strength.ts.';
