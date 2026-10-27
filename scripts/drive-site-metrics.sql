-- One row per run; no applicant values. Internal after-action reads count as browser reads, not model steps.
with commands as (
  select c.*,lag(done_at) over(partition by run_id order by id) as previous_done
  from public.drive_commands c
), metrics as (
  select r.id,r.created_at,r.status,r.reason,r.steps,
    split_part(split_part(r.url,'://',2),'/',1) as host,
    round(extract(epoch from coalesce(max(c.done_at),r.updated_at)-r.created_at)::numeric,1) as elapsed_s,
    round(sum(greatest(0,extract(epoch from c.created_at-c.previous_done)))::numeric,1) as thinking_s,
    round(sum(greatest(0,extract(epoch from c.done_at-c.taken_at)))::numeric,1) as browser_s,
    round(sum(greatest(0,extract(epoch from c.taken_at-c.created_at)))::numeric,1) as queue_s,
    count(c.id) filter(where c.tool='read_page') as read_page,
    count(c.id) filter(where c.tool='read_page' and c.args->>'after_action'='true') as internal_reads,
    count(c.id) filter(where c.tool='options') as options,
    count(c.id) filter(where c.tool='screenshot') as screenshots
  from public.drive_runs r left join commands c on c.run_id=r.id
  where r.created_at > now()-interval '24 hours'
  group by r.id
)
select * from metrics order by created_at desc;
