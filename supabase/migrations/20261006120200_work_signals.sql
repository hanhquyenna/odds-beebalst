-- What a posting's text says about how the work is done, worked out once per posting instead of five searches over every description
-- on each first visit (those timed out together). Recomputed by Postgres whenever the body changes. The app reads it from app_jobs.
alter table public.postings add column if not exists work_signals text[] generated always as (array_remove(array[
  case when body ilike any (array['%hybrid%', '%hybride%', '%work from home%', '%thuiswerken%', '%partly remote%', '%remote work%']) then 'hybrid' end,
  case when body ilike any (array['%fully remote%', '%100% remote%', '%remote-first%', '%remote first%', '%remote position%', '%remote role%', '%work remotely%', '%volledig remote%']) then 'remote' end,
  case when body ilike any (array['%part-time%', '%part time%', '%parttime%', '%deeltijd%']) then 'partTime' end,
  case when body ilike any (array['%full-time%', '%full time%', '%fulltime%', '%voltijd%', '%40 hours%', '%38 hours%', '%36 hours%', '%40 uur%', '%38 uur%', '%36 uur%']) then 'fullTime' end,
  case when body ilike any (array['%fixed-term%', '%fixed term%', '%freelance%', '%interim%', '%temporary%', '%tijdelijk%', '%bepaalde tijd%', '%zzp%', '%detachering%', '%contractor%']) then 'contract' end
], null)) stored;

-- app_jobs gains the column at its end (create or replace keeps every existing column, so active_jobs and the views on it are untouched).
do $$
declare
  def text := pg_get_viewdef('public.app_jobs'::regclass, true);
  added text;
begin
  if def like '%work_signals%' then
    return;
  end if;
  added := regexp_replace(def, 'pp\.role_kind(\s+FROM\s+ranked)', 'pp.role_kind, pp.work_signals\1');
  if added = def then
    raise exception 'app_jobs does not end with pp.role_kind; add work_signals by hand';
  end if;
  execute 'create or replace view public.app_jobs with (security_invoker = true) as ' || added;
end $$;
