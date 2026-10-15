-- Continue application after an extension reload: the desktop must see every active run
-- on this device (not only ids it still held in memory), so resume_version bumps reach the tab.
create or replace function public.poll_applications(p_user uuid, p_device uuid, p_known uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare task public.application_runs; states jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
  insert into public.application_desktops(user_id, device_id) values (p_user, p_device)
    on conflict (user_id, device_id) do update set last_seen_at = now();
  update public.application_runs
    set status = 'failed',
        message = 'Preparation expired. Your open application remains on your desktop.',
        updated_at = now()
    where user_id = p_user
      and status in ('queued', 'filling', 'needs_input', 'ready')
      and expires_at < now();
  -- Every live run on this desktop, so a reloaded extension can reattach and honour Continue.
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', id,
      'status', status,
      'resume_version', resume_version,
      'posting_id', posting_id
    ) order by created_at),
    '[]'::jsonb
  ) into states
  from public.application_runs
  where user_id = p_user
    and device_id = p_device
    and status in ('filling', 'needs_input', 'ready')
    and expires_at > now();
  select * into task
  from public.application_runs
  where user_id = p_user
    and expires_at > now()
    and (status = 'queued' or (status = 'filling' and device_id = p_device and not (id = any (p_known))))
  order by (status = 'queued') desc, created_at
  limit 1
  for update;
  if found and task.status = 'queued' then
    update public.application_runs
      set status = 'filling',
          message = 'Opening this application in its own desktop tab.',
          device_id = p_device,
          updated_at = now()
    where id = task.id
    returning * into task;
  end if;
  return jsonb_build_object('task', case when task.id is null then null else to_jsonb(task) end, 'runs', states);
end $$;
