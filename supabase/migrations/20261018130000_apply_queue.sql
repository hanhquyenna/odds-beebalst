-- The apply queue: jobs the person picked to be filled in one after another while they are away. Odds (the extension) works at most two
-- at a time, each in the Odds window, and every one stops at Review: nothing is ever submitted. One row per job and person.
--   waiting    picked, not started
--   working    Odds is filling it now
--   review     filled; only the person's own Submit is left
--   needs_you  stopped for one thing only the person can do (reason says which)
--   failed     could not be filled (message says why)
--   sent       the site showed its own thank-you, or the person said they sent it
create table public.apply_queue (
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_id text not null,
  state text not null default 'waiting' check (state in ('waiting', 'working', 'review', 'needs_you', 'failed', 'sent')),
  reason text check (reason is null or reason in ('captcha', 'account', 'questions', 'letter', 'closed', 'email', 'other')),
  message text check (message is null or char_length(message) <= 500),
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

-- Add jobs to the queue. A job already in play (waiting, working, at review, needs you) stays as it is; one that failed goes back to
-- waiting; one already sent is left alone. Closed jobs and jobs Odds does not hold are skipped. At most 40 jobs wait at once.
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
        set state = 'waiting', reason = null, message = null, started_at = null, added_at = now(), updated_at = now()
        where apply_queue.state = 'failed';
    if found then added := added + 1; end if;
  end loop;
  return added;
end $$;

-- Take a job out of the queue (stops it too, if Odds is working on it: the extension notices and closes its tab).
create function public.queue_leave(p_id text) returns void
language sql security definer set search_path = public as $$
  delete from public.apply_queue where user_id = auth.uid() and posting_id = p_id;
$$;

-- The person says they sent it (the only way a card goes to Sent besides the site's own thank-you).
create function public.queue_sent(p_id text) returns void
language sql security definer set search_path = public as $$
  update public.apply_queue set state = 'sent', reason = null, message = null, updated_at = now()
  where user_id = auth.uid() and posting_id = p_id and state in ('review', 'needs_you');
$$;

-- Try a failed or stopped job again.
create function public.queue_retry(p_id text) returns void
language sql security definer set search_path = public as $$
  update public.apply_queue set state = 'waiting', reason = null, message = null, started_at = null, added_at = now(), updated_at = now()
  where user_id = auth.uid() and posting_id = p_id and state in ('failed', 'needs_you');
$$;

revoke all on function public.queue_jobs(text[]), public.queue_leave(text), public.queue_sent(text), public.queue_retry(text) from public, anon;
grant execute on function public.queue_jobs(text[]), public.queue_leave(text), public.queue_sent(text), public.queue_retry(text) to authenticated;
