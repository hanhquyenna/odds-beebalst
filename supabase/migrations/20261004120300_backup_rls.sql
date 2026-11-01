-- Backup tables are restore points, never read by the app. Lock them the way
-- LOCK_BACKUP_TABLES.sql describes, plus the three backups it misses
-- (gates, review, cbsgroup): RLS on with no policy, so only the service role
-- and the dashboard can reach them, and no grants to anon/authenticated.
-- Idempotent: tables that do not exist yet (pending root SQL files) are skipped.
do $$
declare
  t text;
begin
  foreach t in array array[
    'public.postings_body_backup',
    'public.postings_requirements_backup',
    'public.postings_years_backup',
    'public.postings_gates_backup',
    'public.postings_review_backup',
    'public.postings_cbsgroup_backup'
  ]
  loop
    if to_regclass(t) is not null then
      execute format('alter table %s enable row level security', t);
      execute format('revoke all on %s from anon, authenticated', t);
    end if;
  end loop;
end $$;
