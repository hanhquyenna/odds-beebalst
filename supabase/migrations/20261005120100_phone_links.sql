-- One-time codes that sign a phone in: the QR code on the computer, and the Home Screen app on an iPhone (which keeps
-- its own storage, apart from Safari). Short-lived, used once, and only the phone-link edge function reads them.
create table if not exists public.phone_links (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists phone_links_user on public.phone_links (user_id, created_at desc);

-- No policies: nobody reads or writes these from the browser.
alter table public.phone_links enable row level security;
