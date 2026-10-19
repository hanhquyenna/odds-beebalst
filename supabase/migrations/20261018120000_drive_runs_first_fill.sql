-- How long Odds took from the page being ready to its first filled field (from the browser's local copies of the details and site recipes).
alter table public.drive_runs add column if not exists first_fill_ms integer;
