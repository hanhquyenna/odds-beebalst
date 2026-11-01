-- Shared, non-PII click patterns: same host + same visible button set → reuse which label worked.
-- One user's successful drive-by-hands pick saves LLM calls for everyone else on that ATS page.
create table public.apply_agent_action_patterns (
  host text not null check (char_length(host) between 1 and 253),
  buttons_fp text not null check (char_length(buttons_fp) = 64),
  text text not null check (char_length(text) between 2 and 80),
  hits integer not null default 1 check (hits >= 1),
  updated_at timestamptz not null default now(),
  primary key (host, buttons_fp)
);
create index apply_agent_action_patterns_updated on public.apply_agent_action_patterns (updated_at desc);
alter table public.apply_agent_action_patterns enable row level security;
revoke all on public.apply_agent_action_patterns from public, anon, authenticated;
grant all on public.apply_agent_action_patterns to service_role;
