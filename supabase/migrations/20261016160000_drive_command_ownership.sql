-- Command ownership: document generation + tab, cancel/expire statuses, fill/agent timing (no PII).
-- Late drive-result after Stuck must be rejectable; finish must cancel queued/taken work.

alter table public.drive_runs
  add column if not exists tab_id integer,
  add column if not exists doc_gen integer not null default 0,
  add column if not exists fill_ended_at timestamptz,
  add column if not exists agent_finished_at timestamptz;

alter table public.drive_commands
  add column if not exists tab_id integer,
  add column if not exists doc_gen integer not null default 0,
  add column if not exists accepted_at timestamptz;

alter table public.drive_commands drop constraint if exists drive_commands_status_check;
alter table public.drive_commands add constraint drive_commands_status_check
  check (status in ('queued', 'taken', 'done', 'cancelled', 'expired'));

grant select (tab_id, doc_gen, fill_ended_at, agent_finished_at) on public.drive_runs to authenticated;
grant select (tab_id, doc_gen, accepted_at) on public.drive_commands to authenticated;

-- Cancel every unfinished command when a run leaves running (finish / stop / quiet→stuck).
create or replace function public.drive_cancel_open_commands(p_run uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.drive_commands
    set status = 'cancelled',
        result = coalesce(result, '{}'::jsonb) || jsonb_build_object('ok', false, 'cancelled', true, 'error', 'run ended'),
        done_at = coalesce(done_at, now())
    where run_id = p_run and status in ('queued', 'taken');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.drive_cancel_open_commands(uuid) from public, anon, authenticated;
grant execute on function public.drive_cancel_open_commands(uuid) to service_role;

-- When the person stops the run, cancel open browser work too.
create or replace function public.drive_control(p_run uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_action = 'stop' then
    update drive_runs set status = 'stopped', reason = null, resume_pending = false, message = 'You stopped Broods on this application.',
        agent_finished_at = coalesce(agent_finished_at, now()), updated_at = now()
      where id = p_run and user_id = auth.uid() and status not in ('stopped', 'submitted');
    get diagnostics n = row_count;
    if n > 0 then perform public.drive_cancel_open_commands(p_run); end if;
  elsif p_action = 'continue' then
    update drive_runs set status = 'running', reason = null, resume_pending = true, message = null, last_note = 'Carrying on where it stopped…',
        expires_at = now() + interval '30 minutes', agent_finished_at = null, fill_ended_at = null, updated_at = now()
      where id = p_run and user_id = auth.uid() and status <> 'submitted';
    get diagnostics n = row_count;
  elsif p_action = 'sent' then
    update drive_runs set status = 'submitted', resume_pending = false, message = 'You sent it.', updated_at = now()
      where id = p_run and user_id = auth.uid();
    get diagnostics n = row_count;
    if n > 0 then perform public.drive_cancel_open_commands(p_run); end if;
  else
    return 'unknown';
  end if;
  return case when n > 0 then 'ok' else 'none' end;
end $$;
