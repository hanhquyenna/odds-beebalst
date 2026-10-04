-- Temporary: what the app did on a phone while testing install and notifications (browser, opened from the Home Screen
-- or not, signed in or not, the notification answer). No personal data. Only the client-log edge function writes here.
create table if not exists public.client_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  device text,
  event text not null,
  detail jsonb
);
alter table public.client_events enable row level security;
