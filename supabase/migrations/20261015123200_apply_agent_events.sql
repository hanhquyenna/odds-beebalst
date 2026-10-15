-- Audit log for cloud apply-agent webhooks (suggest-answers + lifecycle), and a daily cap per user.
create table public.apply_agent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 64),
  posting_id text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);
create index apply_agent_events_user_day on public.apply_agent_events (user_id, created_at desc);
create index apply_agent_events_type on public.apply_agent_events (event_type, created_at desc);
alter table public.apply_agent_events enable row level security;
-- Service role writes; person may read their own rows for debugging in the app later.
create policy apply_agent_events_owner_select on public.apply_agent_events
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.apply_agent_events from anon, authenticated;
grant select on public.apply_agent_events to authenticated;
grant all on public.apply_agent_events to service_role;

-- How many suggest-answers calls this person has used since UTC midnight (for the daily limit).
create function public.apply_agent_suggest_count_today(p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer
  from public.apply_agent_events
  where user_id = p_user
    and event_type = 'suggest-answers'
    and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
$$;
revoke all on function public.apply_agent_suggest_count_today(uuid) from public, anon, authenticated;
grant execute on function public.apply_agent_suggest_count_today(uuid) to service_role;
