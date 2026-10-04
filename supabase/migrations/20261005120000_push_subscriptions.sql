-- One row per phone or browser that said yes to notifications. The morning message (edge function morning-jobs)
-- reads these with the service role; each person can only see, add and remove their own.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  -- When the morning message goes out, in the person's own time. Rules can change these later.
  send_hour smallint not null default 8 check (send_hour between 0 and 23),
  time_zone text not null default 'Europe/Amsterdam',
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
