-- Is a posting still open? The hourly check (supabase/functions/check-postings) writes these three columns.
alter table public.postings add column if not exists last_checked timestamptz;
alter table public.postings add column if not exists miss_count int not null default 0;
alter table public.postings add column if not exists closed_at timestamptz;
comment on column public.postings.last_checked is 'When the employer''s own job board was last asked about this posting and gave a clear answer (open or closed).';
comment on column public.postings.miss_count is 'Clear "not listed" answers in a row. closed_at is set at 2.';
comment on column public.postings.closed_at is 'Set when the employer''s board stopped listing the posting. Cleared if it comes back.';
create index if not exists postings_closed_at_idx on public.postings (closed_at);

-- One row per run of the check, so the hourly schedule can be seen working. Anyone may read it; only the function writes.
create table if not exists public.check_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  slice int not null,
  of int not null,
  checked int not null,
  open int not null,
  closed int not null,
  unknown int not null,
  newly_closed int not null,
  reopened int not null,
  write_failures int not null,
  seconds numeric not null
);
alter table public.check_runs enable row level security;
drop policy if exists "check_runs are public to read" on public.check_runs;
create policy "check_runs are public to read" on public.check_runs for select using (true);
