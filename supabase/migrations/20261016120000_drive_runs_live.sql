-- The tracker follows a Broods run live, from the run itself: what Broods is doing now (its own one-line note per step), why it
-- stopped (captcha / account / questions / cover letter / stuck), and whether the person's tab is still there. The person can stop
-- a run, have Broods carry on after they solved what it stopped for, or say they sent it — never silent, never stuck "Applying…".
alter table public.drive_runs
  add column last_note text check (last_note is null or char_length(last_note) <= 300),
  add column reason text check (reason is null or reason in ('captcha', 'account', 'questions', 'letter', 'closed', 'quiet', 'other')),
  add column last_seen_at timestamptz,
  add column resume_pending boolean not null default false;
alter table public.drive_runs drop constraint drive_runs_status_check;
alter table public.drive_runs add constraint drive_runs_status_check check (status in ('running', 'review', 'needs_you', 'stuck', 'failed', 'stopped', 'submitted'));
create index drive_runs_posting on public.drive_runs (user_id, posting_id, created_at desc);

-- Broods' line for the person about this step ("Filling your details from Autofill").
alter table public.drive_commands add column note text check (note is null or char_length(note) <= 300);

-- The person reads their own runs and the steps' notes (never the commands' values or results).
create policy drive_runs_own on public.drive_runs for select to authenticated using (user_id = auth.uid());
create policy drive_commands_own on public.drive_commands for select to authenticated using (exists (select 1 from public.drive_runs r where r.id = run_id and r.user_id = auth.uid()));
grant select (id, posting_id, url, status, message, steps, created_at, updated_at, last_note, reason, last_seen_at) on public.drive_runs to authenticated;
grant select (id, run_id, tool, status, note, created_at) on public.drive_commands to authenticated;

-- stop: Broods ends at its next step. continue: Broods picks the same run up again (the extension in the tab takes it on).
-- sent: the person submitted it themselves.
create or replace function public.drive_control(p_run uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_action = 'stop' then
    update drive_runs set status = 'stopped', reason = null, resume_pending = false, message = 'You stopped Broods on this application.', updated_at = now()
      where id = p_run and user_id = auth.uid() and status not in ('stopped', 'submitted');
  elsif p_action = 'continue' then
    update drive_runs set status = 'running', reason = null, resume_pending = true, message = null, last_note = 'Carrying on where it stopped…',
        expires_at = now() + interval '30 minutes', updated_at = now()
      where id = p_run and user_id = auth.uid() and status <> 'submitted';
  elsif p_action = 'sent' then
    update drive_runs set status = 'submitted', resume_pending = false, message = 'You sent it.', updated_at = now()
      where id = p_run and user_id = auth.uid();
  else
    return 'unknown';
  end if;
  get diagnostics n = row_count;
  return case when n > 0 then 'ok' else 'none' end;
end $$;
revoke all on function public.drive_control(uuid, text) from public, anon;
grant execute on function public.drive_control(uuid, text) to authenticated;
