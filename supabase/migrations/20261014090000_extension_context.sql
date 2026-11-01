-- What every chance the extension shows is measured against: the reference (pay bands, age factors, tax, transitions) and the share of each
-- requirement across all open jobs. Working it out reads every open job (a second or more), so the extension's route keeps the result here,
-- one row, and works it out again in the background when it is half an hour old. Only the service role reads or writes it.
create table if not exists public.extension_context (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null,
  computed_at timestamptz not null default now()
);
alter table public.extension_context enable row level security;
revoke all on public.extension_context from anon, authenticated;
