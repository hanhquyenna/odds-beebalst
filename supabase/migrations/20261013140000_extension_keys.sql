-- The odds browser extension. It has its own key, apart from the one Claude uses (mcp_keys keeps one per person, so sharing it would cut Claude
-- off every time the extension connected, and the other way round). Only a hash is kept; "Disconnect" deletes it.
create table if not exists public.extension_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key_hash text not null unique,
  hint text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.extension_keys enable row level security;
drop policy if exists extension_keys_read on public.extension_keys;
create policy extension_keys_read on public.extension_keys for select to authenticated using (user_id = auth.uid());
revoke all on public.extension_keys from anon;
revoke insert, update, delete on public.extension_keys from authenticated;

create or replace function public.create_extension_key()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  k text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  k := 'oddsx_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.extension_keys (user_id, key_hash, hint)
  values (auth.uid(), encode(extensions.digest(k, 'sha256'), 'hex'), right(k, 4))
  on conflict (user_id) do update set key_hash = excluded.key_hash, hint = excluded.hint, created_at = now(), last_used_at = null;

  return k;
end;
$$;

create or replace function public.revoke_extension_key()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.extension_keys where user_id = auth.uid();
$$;

revoke all on function public.create_extension_key() from public, anon;
revoke all on function public.revoke_extension_key() from public, anon;
grant execute on function public.create_extension_key() to authenticated;
grant execute on function public.revoke_extension_key() to authenticated;

-- Jobs the extension had read for a person (a read that costs money is limited per person per day). Server only.
create table if not exists public.extension_reads (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists extension_reads_user_day on public.extension_reads (user_id, created_at desc);
alter table public.extension_reads enable row level security;
revoke all on public.extension_reads from anon, authenticated;
