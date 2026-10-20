-- A preparation that reached ready or needs_input is finished on the desktop: the 15-minute expiry marked it "failed: Preparation
-- expired" (four ready applications showed as failed in the tracker). Only requests still queued or filling expire.
CREATE OR REPLACE FUNCTION public.poll_application(p_user uuid, p_device uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare task public.application_runs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  insert into public.application_desktops(user_id,device_id) values(p_user,p_device) on conflict(user_id,device_id) do update set last_seen_at=now();
  update public.application_runs set status='failed',message='Preparation expired. Start again on your desktop.',updated_at=now() where user_id=p_user and status in ('queued','filling') and expires_at<now();
  select * into task from public.application_runs where user_id=p_user and status in ('queued','filling','needs_input','ready') order by created_at limit 1 for update;
  if not found then return null; end if;
  if task.status='queued' then
    update public.application_runs set status='filling',message='Opening the application on your desktop.',device_id=p_device,updated_at=now() where id=task.id returning * into task;
  end if;
  if task.device_id<>p_device then return null; end if;
  return to_jsonb(task);
end $function$

;
CREATE OR REPLACE FUNCTION public.poll_applications(p_user uuid, p_device uuid, p_known uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare task public.application_runs; states jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  insert into public.application_desktops(user_id,device_id) values(p_user,p_device) on conflict(user_id,device_id) do update set last_seen_at=now();
  update public.application_runs set status='failed',message='Preparation expired. Your open application remains on your desktop.',updated_at=now() where user_id=p_user and status in ('queued','filling') and expires_at<now();
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'resume_version',resume_version)),'[]'::jsonb) into states from public.application_runs where user_id=p_user and device_id=p_device and id=any(p_known);
  select * into task from public.application_runs where user_id=p_user and expires_at>now() and (status='queued' or (status='filling' and device_id=p_device and not(id=any(p_known)))) order by (status='queued') desc,created_at limit 1 for update;
  if found and task.status='queued' then
    update public.application_runs set status='filling',message='Opening this application in its own desktop tab.',device_id=p_device,updated_at=now() where id=task.id returning * into task;
  end if;
  return jsonb_build_object('task',case when task.id is null then null else to_jsonb(task) end,'runs',states);
end $function$

;
