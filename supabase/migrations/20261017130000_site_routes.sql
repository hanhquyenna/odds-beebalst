-- Routes learned from Broods runs (structure only: step kinds and canonical button words, never a value or a URL), per platform.
-- A route three runs reached review with becomes that platform's guide for the next runs (see _shared/site-routes.ts).
create table if not exists public.site_routes (
  platform text not null,
  route text[] not null,
  successes integer not null default 0,
  failures integer not null default 0,
  steps_total integer not null default 0,
  last_success timestamptz,
  updated_at timestamptz not null default now(),
  primary key (platform, route)
);
alter table public.site_routes enable row level security;
