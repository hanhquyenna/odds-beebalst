-- Broods drives the person's own Chrome through the Odds extension (MCP): one row per application run, and the queue of
-- browser commands Broods sends to that run. The extension takes a run's commands only with the person's own extension key,
-- and Broods reaches them only through the drive MCP (shared secret + the run's id). Service role only.
create table public.drive_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_id text,
  url text not null check (char_length(url) between 1 and 2000),
  status text not null default 'running' check (status in ('running', 'review', 'needs_you', 'stuck', 'failed')),
  message text check (message is null or char_length(message) <= 1000),
  steps integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);
create index drive_runs_user on public.drive_runs (user_id, created_at desc);

create table public.drive_commands (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.drive_runs(id) on delete cascade,
  tool text not null check (char_length(tool) between 1 and 40),
  args jsonb not null default '{}'::jsonb check (jsonb_typeof(args) = 'object'),
  status text not null default 'queued' check (status in ('queued', 'taken', 'done')),
  result jsonb,
  created_at timestamptz not null default now(),
  taken_at timestamptz,
  done_at timestamptz
);
create index drive_commands_run on public.drive_commands (run_id, status, id);

alter table public.drive_runs enable row level security;
alter table public.drive_commands enable row level security;
revoke all on public.drive_runs, public.drive_commands from public, anon, authenticated;
grant all on public.drive_runs, public.drive_commands to service_role;
