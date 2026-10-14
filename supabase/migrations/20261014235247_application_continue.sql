alter table public.application_runs add column resume_version integer not null default 0;
create function public.continue_application_for(p_user uuid,p_posting_id text) returns public.application_runs
language plpgsql security definer set search_path='' as $$
declare result public.application_runs;
begin
 if p_user is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 update public.application_runs set resume_version=resume_version+1,expires_at=now()+interval '15 minutes',updated_at=now(),message='Returning to your application on desktop.'
 where user_id=p_user and posting_id=p_posting_id and status in ('filling','needs_input','ready') returning * into result;
 if not found then raise exception 'No active application. Start this job again.'; end if;
 return result;
end $$;
revoke all on function public.continue_application_for(uuid,text) from public,anon,authenticated;
grant execute on function public.continue_application_for(uuid,text) to service_role;
create function public.continue_application(p_posting_id text) returns public.application_runs
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 return public.continue_application_for(auth.uid(),p_posting_id);
end $$;
revoke all on function public.continue_application(text) from public,anon;
grant execute on function public.continue_application(text) to authenticated;
create or replace function public.poll_applications(p_user uuid,p_device uuid,p_known uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.application_runs; states jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  insert into public.application_desktops(user_id,device_id) values(p_user,p_device) on conflict(user_id,device_id) do update set last_seen_at=now();
  update public.application_runs set status='failed',message='Preparation expired. Your open application remains on your desktop.',updated_at=now() where user_id=p_user and status in ('queued','filling','needs_input','ready') and expires_at<now();
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'resume_version',resume_version)),'[]'::jsonb) into states from public.application_runs where user_id=p_user and device_id=p_device and id=any(p_known);
  select * into task from public.application_runs where user_id=p_user and expires_at>now() and (status='queued' or (status='filling' and device_id=p_device and not(id=any(p_known)))) order by (status='queued') desc,created_at limit 1 for update;
  if found and task.status='queued' then
    update public.application_runs set status='filling',message='Opening this application in its own desktop tab.',device_id=p_device,updated_at=now() where id=task.id returning * into task;
  end if;
  return jsonb_build_object('task',case when task.id is null then null else to_jsonb(task) end,'runs',states);
end $$;
