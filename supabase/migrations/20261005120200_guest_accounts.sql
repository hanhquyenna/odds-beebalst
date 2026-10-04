-- Guest accounts: made automatically after a LinkedIn import by someone without an account, so their profile, phone
-- and morning message work before real sign-in exists. ip_hash only limits how many one connection can make.
create table if not exists public.guest_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists guest_accounts_ip_day on public.guest_accounts (ip_hash, created_at desc);

-- No policies: only the phone-link edge function reads or writes these.
alter table public.guest_accounts enable row level security;
