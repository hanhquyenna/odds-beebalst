-- What an employer's open jobs say about hiring there, worked out live from the table (nothing is stored, so it is always current):
-- how many jobs are open, how many are first jobs, how many do not need Dutch, how many mention visas or relocation, how many applicants a job usually has,
-- and which fields, cities and skills come up most.
create or replace view public.employer_hiring with (security_invoker = true) as
select e.employer, e.open_jobs, e.first_jobs, e.no_dutch_jobs, e.visa_mentions, e.avg_applicants, e.pay_stated,
  (select coalesce(jsonb_agg(jsonb_build_object('name', t.c, 'n', t.n) order by t.n desc), '[]'::jsonb)
     from (select split_part(j.region, ',', 1) c, count(*) n from public.active_jobs j where j.employer = e.employer and j.region is not null and j.region <> '—' group by 1 order by 2 desc limit 3) t) as cities,
  (select coalesce(jsonb_agg(jsonb_build_object('name', t.f, 'n', t.n) order by t.n desc), '[]'::jsonb)
     from (select j.family f, count(*) n from public.active_jobs j where j.employer = e.employer and j.family is not null and j.family <> 'Other' group by 1 order by 2 desc limit 3) t) as fields,
  (select coalesce(jsonb_agg(jsonb_build_object('name', t.s, 'n', t.n) order by t.n desc), '[]'::jsonb)
     from (select s, count(*) n from public.active_jobs j, unnest(j.skills) s where j.employer = e.employer group by 1 order by 2 desc limit 5) t) as skills
from (
  select employer,
    count(*) as open_jobs,
    count(*) filter (where level in ('Internship', 'Entry')) as first_jobs,
    count(*) filter (where not dutch_required) as no_dutch_jobs,
    count(*) filter (where visa_mention) as visa_mentions,
    round(avg(nullif(nullif(regexp_replace(coalesce(applicants::text, ''), '[^0-9]', '', 'g'), '')::numeric, 0)))::int as avg_applicants,
    count(*) filter (where pay_posted is not null) as pay_stated
  from public.active_jobs group by employer
) e;
grant select on public.employer_hiring to anon, authenticated;
notify pgrst, 'reload schema';
