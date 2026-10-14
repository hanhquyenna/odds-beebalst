-- A phone can request preparation; only a connected desktop claims it. No remote submit command exists.
create table public.application_desktops (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key(user_id, device_id)
);
create table public.application_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  posting_id text not null references public.postings(id),
  url text not null check (url like 'https://%'),
  status text not null default 'queued' check (status in ('queued','filling','needs_input','ready','submitted','failed','cancelled')),
  message text not null default 'Waiting for your desktop. Keep its browser open.',
  device_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
create unique index application_one_active on public.application_runs(user_id) where status in ('queued','filling','needs_input','ready');
create index application_runs_owner_recent on public.application_runs(user_id,created_at desc);
alter table public.application_desktops enable row level security;
alter table public.application_runs enable row level security;
create policy desktop_owner_read on public.application_desktops for select to authenticated using ((select auth.uid())=user_id);
create policy application_owner_read on public.application_runs for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.application_desktops,public.application_runs from anon,authenticated;
grant select on public.application_desktops,public.application_runs to authenticated;

create function public.request_application(p_posting_id text) returns public.application_runs
language plpgsql security definer set search_path=public as $$
declare job_url text; result public.application_runs;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  -- Serialize requests from both devices, including simultaneous double taps.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  update public.application_runs set status='failed',message='Preparation expired. Start again when your desktop is ready.',updated_at=now() where user_id=auth.uid() and status in ('queued','filling','needs_input','ready') and expires_at<now();
  select * into result from public.application_runs where user_id=auth.uid() and status in ('queued','filling','needs_input','ready') limit 1;
  if found then
    if result.posting_id<>p_posting_id then raise exception 'Finish or cancel your current application first.'; end if;
    return result;
  end if;
  select url into job_url from public.postings where id=p_posting_id and closed_at is null;
  if job_url is null or job_url not like 'https://%' then raise exception 'This job has no available application page.'; end if;
  insert into public.application_runs(user_id,posting_id,url) values(auth.uid(),p_posting_id,job_url) returning * into result;
  return result;
end $$;
create function public.cancel_application(p_id uuid) returns void
language sql security definer set search_path=public as $$
  update public.application_runs set status='cancelled',message='Preparation cancelled.',updated_at=now() where id=p_id and user_id=auth.uid() and status in ('queued','filling','needs_input','ready');
$$;
revoke all on function public.request_application(text),public.cancel_application(uuid) from public,anon;
grant execute on function public.request_application(text),public.cancel_application(uuid) to authenticated;

-- Called only by the extension endpoint after authenticating its own connection key.
create function public.poll_application(p_user uuid,p_device uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare task public.application_runs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  insert into public.application_desktops(user_id,device_id) values(p_user,p_device) on conflict(user_id,device_id) do update set last_seen_at=now();
  update public.application_runs set status='failed',message='Preparation expired. Start again on your desktop.',updated_at=now() where user_id=p_user and status in ('queued','filling','needs_input','ready') and expires_at<now();
  select * into task from public.application_runs where user_id=p_user and status in ('queued','filling','needs_input','ready') order by created_at limit 1 for update;
  if not found then return null; end if;
  if task.status='queued' then
    update public.application_runs set status='filling',message='Opening the application on your desktop.',device_id=p_device,updated_at=now() where id=task.id returning * into task;
  end if;
  if task.device_id<>p_device then return null; end if;
  return to_jsonb(task);
end $$;
create function public.report_application(p_user uuid,p_device uuid,p_id uuid,p_status text,p_message text) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_status not in ('filling','needs_input','ready','submitted','failed') then raise exception 'Invalid application state.'; end if;
  update public.application_runs set status=p_status,message=left(p_message,500),updated_at=now() where id=p_id and user_id=p_user and device_id=p_device and status in ('filling','needs_input','ready') and expires_at>now();
end $$;
revoke all on function public.poll_application(uuid,uuid),public.report_application(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.poll_application(uuid,uuid),public.report_application(uuid,uuid,uuid,text,text) to service_role;
