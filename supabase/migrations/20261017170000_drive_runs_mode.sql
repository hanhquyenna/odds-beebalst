-- How a run was started: null = Odds drives the whole application ("Do it for me"); 'copilot' = the person pressed "Fill with Odds" on a
-- form in front of them. In copilot Broods fills the whole application from that page (pressing Next itself) up to Submit; the person's
-- own Next after a page ended resumes the same run (mcp/drive.ts).
alter table public.drive_runs add column if not exists mode text;
grant select (mode) on public.drive_runs to authenticated;
