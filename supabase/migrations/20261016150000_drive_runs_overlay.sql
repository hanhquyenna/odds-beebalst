-- A Broods run is a temporary layer over the job's own status: shown only while its tab is open. The person filling in the form
-- themselves pauses Broods (person_active_at); Broods going quiet is retried once by itself (retries); a run waiting for the person
-- picks up again by itself once they handled it (resumes, capped so a page that keeps asking never loops).
alter table public.drive_runs
  add column person_active_at timestamptz,
  add column retries integer not null default 0,
  add column resumes integer not null default 0;
grant select (person_active_at) on public.drive_runs to authenticated;
