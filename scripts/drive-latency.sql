-- Per-step latency of Broods' browser steps over the last 24 hours, per tool and per push arm (each run's ext row says whether
-- ODDS_DRIVE_PUSH was on when it started): pickup (queued until the tab took it), in the tab (taken until its result), and total.
-- Server clock only, no applicant values. Read-only: psql "$DB_URL" -f scripts/drive-latency.sql
with arm as (
  select distinct on (run_id) run_id, coalesce((result->>'push')::boolean, false) as push
  from public.drive_commands where tool = 'ext' order by run_id, id desc
), steps as (
  select c.tool, coalesce(a.push, false) as push,
    extract(epoch from c.taken_at - c.created_at) * 1000 as pickup_ms,
    extract(epoch from c.done_at - c.taken_at) * 1000 as tab_ms,
    extract(epoch from c.done_at - c.created_at) * 1000 as total_ms
  from public.drive_commands c left join arm a on a.run_id = c.run_id
  where c.created_at > now() - interval '24 hours' and c.status = 'done' and c.taken_at is not null
    and c.tool not in ('guard', 'ext', 'recipe', 'broods', 'note_site', 'vision')
)
select tool, push, count(*) as steps,
  round(percentile_cont(0.5) within group (order by pickup_ms)) as pickup_p50_ms,
  round(percentile_cont(0.95) within group (order by pickup_ms)) as pickup_p95_ms,
  round(percentile_cont(0.5) within group (order by tab_ms)) as tab_p50_ms,
  round(percentile_cont(0.5) within group (order by total_ms)) as total_p50_ms,
  round(percentile_cont(0.95) within group (order by total_ms)) as total_p95_ms
from steps
group by tool, push
order by tool, push;
