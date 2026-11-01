-- How each kind of field is filled on each platform, learned from every Broods run (structure only: platform, field kind, tactic, counts;
-- never a value). The extension tries a platform's winning tactic first (see mcp/drive.ts: siteTactics, learnTactics).
--   tactic: plain (Odds' own events) | own_format (the box's own date/number shape) | real_input (Chrome debugger mouse/keyboard)
create table if not exists public.site_tactics (
  platform text not null,
  field_kind text not null,
  tactic text not null,
  successes integer not null default 0,
  failures integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (platform, field_kind, tactic)
);
alter table public.site_tactics enable row level security;
revoke all on public.site_tactics from anon, authenticated;

create or replace function public.record_site_tactic(p_platform text, p_kind text, p_tactic text, p_ok boolean) returns void
language sql security definer set search_path = public as $$
  insert into public.site_tactics(platform, field_kind, tactic, successes, failures)
  values (left(p_platform, 120), left(p_kind, 40), left(p_tactic, 40), case when p_ok then 1 else 0 end, case when p_ok then 0 else 1 end)
  on conflict (platform, field_kind, tactic) do update
    set successes = site_tactics.successes + excluded.successes,
        failures = site_tactics.failures + excluded.failures,
        updated_at = now();
$$;
revoke all on function public.record_site_tactic(text, text, text, boolean) from public, anon, authenticated;
