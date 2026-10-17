-- Where a job's application form really is, when its listing is on a job board (Glassdoor, Indeed, Magnet.me, LinkedIn) that puts captchas,
-- sign-in walls and pop-ups before it. Learned from runs that got through to the employer's form (source 'run'), or read from the board's own
-- job data (source 'apify'). Shared by everyone: Odds opens the employer's form directly next time. Service role only (no policies).
create table if not exists public.posting_apply_links (
  posting_id text primary key,
  apply_url text not null check (apply_url ~ '^https://'),
  source text not null check (source in ('run', 'apify', 'match')),
  seen integer not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.posting_apply_links enable row level security;
