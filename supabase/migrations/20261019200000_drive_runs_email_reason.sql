-- Broods finishes an application that is applied for by e-mail with reason 'email' (the prompt and the drive MCP both use it), but the
-- check only allowed the older reasons: every such finish failed with a 400 and left the run "running" until it went quiet.
alter table public.drive_runs drop constraint if exists drive_runs_reason_check;
alter table public.drive_runs add constraint drive_runs_reason_check
  check (reason is null or reason in ('captcha', 'account', 'questions', 'letter', 'closed', 'email', 'quiet', 'other'));
