-- Was the interview chance right, for everyone using Odds, anonymously (docs/ENGINE_DATA_PLAN.md E3).
-- Returns only counts per bucket of the chance shown. Never a row, a user, a posting or a date. Not applied to production yet.
-- Only applications sent 21+ days ago with a recorded answer count; "no answer yet" (outcome null) never does.
-- A bucket with fewer than 10 answers, or answers from fewer than 3 people, comes back with its count but no figures.
-- Buckets: keep in step with BUCKETS in src/lib/calibration.ts.

create or replace function public.chance_calibration_pooled()
returns table (bucket text, answered integer, interviews integer, mean_chance numeric)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select
      case when chance < 0.01 then 'lt1' when chance < 0.03 then '1-3' when chance < 0.06 then '3-6' when chance < 0.10 then '6-10' else '10+' end as bucket,
      user_id, chance, outcome
    from public.chance_snapshots
    where outcome is not null and applied_on <= current_date - 21
  ),
  g as (
    select bucket, count(*)::integer as answered, count(distinct user_id)::integer as people,
           (count(*) filter (where outcome = 'interview'))::integer as interviews, avg(chance)::numeric as mean_chance
    from b group by bucket
  )
  select bucket, answered,
         case when answered >= 10 and people >= 3 then interviews end,
         case when answered >= 10 and people >= 3 then round(mean_chance, 4) end
  from g
$$;

revoke all on function public.chance_calibration_pooled() from public, anon;
grant execute on function public.chance_calibration_pooled() to authenticated;

notify pgrst, 'reload schema';
