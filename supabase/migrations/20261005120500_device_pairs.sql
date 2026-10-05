-- Signing in a Home Screen app (iPhone or Android) through the browser: the app cannot finish a Google sign-in itself,
-- because the trip to Google returns to a different browser context. The app asks for a pair (it keeps the secret),
-- opens the browser at ?pair=<id>, the person signs in there and confirms the short code both screens show, and the app
-- collects its session with the secret. Ten minutes, used once. Only the phone-link edge function reads or writes this.
create table if not exists public.device_pairs (
  id text primary key,
  secret_hash text not null,
  ip_hash text not null,
  user_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  claimed_at timestamptz
);

create index if not exists device_pairs_ip_hour on public.device_pairs (ip_hash, created_at desc);

alter table public.device_pairs enable row level security;
