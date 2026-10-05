-- The ten Edge Functions became three (account, profile, jobs). Points the scheduled calls at the new paths, in place, so
-- each job keeps its name, schedule, secret header and timeout:
--   /functions/v1/check-postings?slice=N&of=4  ->  /functions/v1/jobs/check?slice=N&of=4
--   /functions/v1/check-public                 ->  /functions/v1/jobs/check-public
--   /functions/v1/morning-jobs                 ->  /functions/v1/jobs/morning
-- Apply ONLY after `account`, `profile` and `jobs` are deployed (docs/DEPLOY.md): before that the new paths answer 404.
-- Safe to run twice: a rewritten command no longer matches. Does nothing where pg_cron is not installed.
do $$
declare
  j record;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;
  for j in
    select jobid, command from cron.job
    where command like '%/functions/v1/check-postings%'
       or command like '%/functions/v1/check-public%'
       or command like '%/functions/v1/morning-jobs%'
  loop
    perform cron.alter_job(
      job_id := j.jobid,
      command := replace(replace(replace(j.command,
        '/functions/v1/check-postings', '/functions/v1/jobs/check'),
        '/functions/v1/check-public', '/functions/v1/jobs/check-public'),
        '/functions/v1/morning-jobs', '/functions/v1/jobs/morning')
    );
  end loop;
end $$;
