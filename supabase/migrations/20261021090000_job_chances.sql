-- One interview chance per person per job, the same on every surface (src/lib/job-chance.ts): the job list, the job page, the extension's
-- side panel and its badge beside a posting, and Claude. The first figure worked out for a job is kept with a fingerprint of what it came
-- from (the profile or the CV put on that job, a referral, the profile reading); every place shows it while that fingerprint holds.
create table if not exists public.job_chances (
  user_id uuid not null references auth.users (id) on delete cascade,
  posting_id text not null check (char_length(posting_id) between 1 and 200),
  mid double precision not null check (mid > 0 and mid <= 1),
  low double precision not null check (low >= 0 and low <= 1),
  high double precision not null check (high >= 0 and high <= 1),
  inputs text not null check (char_length(inputs) between 1 and 64),
  updated_at timestamptz not null default now(),
  primary key (user_id, posting_id)
);

alter table public.job_chances enable row level security;
create policy job_chances_owner on public.job_chances for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
