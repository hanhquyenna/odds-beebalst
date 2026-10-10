-- odds in Claude, as the person themselves: a private link (the mcp function's URL with ?key=) lets Claude read their own
-- documents, saved jobs and applications, save a cover letter to Documents and mark a job applied. Only a hash of the key is
-- kept; the key is shown once, when it is made, and making a new one replaces the old. Deleting it cuts Claude off at once.
create table if not exists public.mcp_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key_hash text not null unique,
  -- The last four characters, so the profile can say which link is live without keeping the key.
  hint text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.mcp_keys enable row level security;
drop policy if exists mcp_keys_read on public.mcp_keys;
create policy mcp_keys_read on public.mcp_keys for select to authenticated using (user_id = auth.uid());
revoke all on public.mcp_keys from anon;
revoke insert, update, delete on public.mcp_keys from authenticated;

create or replace function public.create_mcp_key()
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
  k := 'odds_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.mcp_keys (user_id, key_hash, hint)
  values (auth.uid(), encode(extensions.digest(k, 'sha256'), 'hex'), right(k, 4))
  on conflict (user_id) do update set key_hash = excluded.key_hash, hint = excluded.hint, created_at = now(), last_used_at = null;

  return k;
end;
$$;

create or replace function public.revoke_mcp_key()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.mcp_keys where user_id = auth.uid();
$$;

revoke all on function public.create_mcp_key() from public, anon;
revoke all on function public.revoke_mcp_key() from public, anon;
grant execute on function public.create_mcp_key() to authenticated;
grant execute on function public.revoke_mcp_key() to authenticated;

-- The jobs someone saved, kept with their account (they used to live only in the browser), so Claude and their other devices see them.
create table if not exists public.saved_jobs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  posting_id text not null check (char_length(posting_id) between 1 and 64),
  saved_at timestamptz not null default now(),
  primary key (user_id, posting_id)
);
alter table public.saved_jobs enable row level security;
drop policy if exists saved_jobs_owner on public.saved_jobs;
create policy saved_jobs_owner on public.saved_jobs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.saved_jobs from anon;
grant select, insert, delete on public.saved_jobs to authenticated;

notify pgrst, 'reload schema';
