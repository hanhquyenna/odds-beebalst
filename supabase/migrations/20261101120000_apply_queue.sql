-- The apply queue: every job the person pressed Apply on, kept until they send it, skip it or remove it. Odds (the extension) works at
-- most three at a time, each in a background tab of the person's own window, and every one stops before Submit: nothing is ever sent by
-- Odds. One row per job and person, so a restart of Chrome or of the extension never loses one.
--   waiting    pressed Apply, not started yet (up next)
--   working    Odds is filling it now
--   review     filled; only the person's own Submit is left
--   needs_you  stopped for one thing only the person can do (reason says which)
--   failed     could not be filled (message says why); the person can try again
--   sent       the site showed its own thank-you, or the person said they sent it
--   skipped    the person said not to apply after all
-- tries counts the times Odds started it again by itself after a run died partway (the model unreachable, the tab lost); at two it stops
-- and asks the person instead.
create table public.apply_queue (
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_id text not null,
  state text not null default 'waiting' check (state in ('waiting', 'working', 'review', 'needs_you', 'failed', 'sent', 'skipped')),
  reason text check (reason is null or reason in ('captcha', 'account', 'questions', 'letter', 'closed', 'email', 'tab', 'other')),
  message text check (message is null or char_length(message) <= 500),
  tries integer not null default 0 check (tries between 0 and 10),
  added_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, posting_id)
);
create index apply_queue_state on public.apply_queue (user_id, state, added_at);

alter table public.apply_queue enable row level security;
revoke all on public.apply_queue from public, anon, authenticated;
grant select on public.apply_queue to authenticated;
grant all on public.apply_queue to service_role;
create policy apply_queue_owner_read on public.apply_queue for select to authenticated using ((select auth.uid()) = user_id);

-- Add jobs to the queue. A job already in play (waiting, working, at review, needs you) or sent stays as it is; one that failed or was
-- skipped goes back to waiting. Closed jobs and jobs Odds does not hold are left out. At most 40 jobs wait at once.
create function public.queue_jobs(p_ids text[]) returns integer
language plpgsql security definer set search_path = public as $$
declare added integer := 0; room integer; id text;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 1));
  select greatest(0, 40 - count(*)) into room from public.apply_queue where user_id = auth.uid() and state = 'waiting';
  foreach id in array coalesce(p_ids, '{}') loop
    exit when added >= room;
    continue when not exists (select 1 from public.postings where postings.id = id and closed_at is null);
    insert into public.apply_queue (user_id, posting_id) values (auth.uid(), id)
      on conflict (user_id, posting_id) do update
        set state = 'waiting', reason = null, message = null, tries = 0, started_at = null, added_at = now(), updated_at = now()
        where apply_queue.state in ('failed', 'skipped');
    if found then added := added + 1; end if;
  end loop;
  return added;
end $$;

-- Take a job out: one that has not started yet is removed; one Odds started is kept as skipped, so it still shows under Done
-- (the extension notices and lets go of its tab).
create function public.queue_leave(p_id text) returns void
language sql security definer set search_path = public as $$
  delete from public.apply_queue where user_id = auth.uid() and posting_id = p_id and state = 'waiting';
  update public.apply_queue set state = 'skipped', reason = null, updated_at = now()
  where user_id = auth.uid() and posting_id = p_id and state <> 'sent';
$$;

-- The person says they sent it (the only way a job goes to Sent besides the site's own thank-you).
create function public.queue_sent(p_id text) returns void
language sql security definer set search_path = public as $$
  update public.apply_queue set state = 'sent', reason = null, message = null, updated_at = now()
  where user_id = auth.uid() and posting_id = p_id and state in ('review', 'needs_you', 'working', 'failed');
$$;

-- Try a stopped, failed or skipped job again, with a fresh count of tries.
create function public.queue_retry(p_id text) returns void
language sql security definer set search_path = public as $$
  update public.apply_queue set state = 'waiting', reason = null, message = null, tries = 0, started_at = null, added_at = now(), updated_at = now()
  where user_id = auth.uid() and posting_id = p_id and state in ('failed', 'needs_you', 'skipped');
$$;

revoke all on function public.queue_jobs(text[]), public.queue_leave(text), public.queue_sent(text), public.queue_retry(text) from public, anon;
grant execute on function public.queue_jobs(text[]), public.queue_leave(text), public.queue_sent(text), public.queue_retry(text) to authenticated;
