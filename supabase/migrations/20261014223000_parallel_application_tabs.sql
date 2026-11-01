-- Independent jobs can be prepared together. Double taps on the same job reuse its request.
drop index public.application_one_active;
create unique index application_one_active_per_job on public.application_runs(user_id,posting_id) where status in ('queued','filling','needs_input','ready');
create or replace function public.request_application(p_posting_id text) returns public.application_runs
language plpgsql security definer set search_path='' as $$
declare job_url text; result public.application_runs;
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  update public.application_runs set status='failed',message='Preparation expired. Your open application remains on your desktop.',updated_at=now() where user_id=auth.uid() and status in ('queued','filling','needs_input','ready') and expires_at<now();
  select * into result from public.application_runs where user_id=auth.uid() and posting_id=p_posting_id and status in ('queued','filling','needs_input','ready') limit 1;
  if found then return result; end if;
  select url into job_url from public.postings where id=p_posting_id and closed_at is null;
  if job_url is null or job_url not like 'https://%' then raise exception 'This job has no available application page.'; end if;
  insert into public.application_runs(user_id,posting_id,url) values(auth.uid(),p_posting_id,job_url) returning * into result;
  return result;
end $$;
-- A new endpoint supports many tabs; the old RPC remains available for older extensions.
create function public.poll_applications(p_user uuid,p_device uuid,p_known uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.application_runs; states jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  insert into public.application_desktops(user_id,device_id) values(p_user,p_device) on conflict(user_id,device_id) do update set last_seen_at=now();
  update public.application_runs set status='failed',message='Preparation expired. Your open application remains on your desktop.',updated_at=now() where user_id=p_user and status in ('queued','filling','needs_input','ready') and expires_at<now();
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status)),'[]'::jsonb) into states from public.application_runs where user_id=p_user and device_id=p_device and id=any(p_known);
  select * into task from public.application_runs where user_id=p_user and expires_at>now() and (status='queued' or (status='filling' and device_id=p_device and not(id=any(p_known)))) order by (status='queued') desc,created_at limit 1 for update;
  if found and task.status='queued' then
    update public.application_runs set status='filling',message='Opening this application in its own desktop tab.',device_id=p_device,updated_at=now() where id=task.id returning * into task;
  end if;
  return jsonb_build_object('task',case when task.id is null then null else to_jsonb(task) end,'runs',states);
end $$;
revoke all on function public.poll_applications(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.poll_applications(uuid,uuid,uuid[]) to service_role;
