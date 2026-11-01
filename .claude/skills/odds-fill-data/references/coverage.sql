-- Coverage of the per-job data for the internship and entry jobs of the last 30 days that do not need Dutch.
with pool as (
  select id, lower(trim(employer)) e1, lower(trim(coalesce(employer_display, employer))) e2
  from app_jobs where level_view in ('Internship','Entry') and dutch_required is not true
    and coalesce(posted_on, current_date - days_open) >= current_date - 30
),
people as (
  select lower(employer) emp,
    coalesce(jev->>'role' = 'recruiter', false) or headline ~* '(recruit|talent acquisition|talent partner|sourcer|\mhr\M|human resources|people partner|early careers|campus)' as is_recruiter,
    coalesce(jev->>'role' = 'hiring_manager', false) or (headline ~* '(\mmanager\M|\mhead\M|\mlead\M|director|team ?lead|supervisor|chief|\mvp\M)' and not headline ~* '(recruit|talent|\mhr\M|human resources|people partner|sourcer)') as is_manager
  from job_people where coalesce(jev->>'decision_final', '') <> 'reject'
),
has as (
  select p.id,
    exists (select 1 from job_candidate_evidence c where c.posting_id = p.id and c.validation_status = 'validated' and c.status in ('exact','adjacent')) past_hires,
    (select count(*) from people j where j.emp in (p.e1, p.e2)) contacts,
    exists (select 1 from people j where j.emp in (p.e1, p.e2) and j.is_recruiter) recruiter,
    exists (select 1 from people j where j.emp in (p.e1, p.e2) and j.is_manager) hiring_manager,
    exists (select 1 from employer_facts f where lower(f.employer) in (p.e1, p.e2)) linkedin_facts,
    exists (select 1 from employer_glassdoor_reviews r where lower(r.employer) in (p.e1, p.e2)) reviews,
    exists (select 1 from employer_money m where lower(m.employer) in (p.e1, p.e2) and m.kind = 'revenue') revenue,
    (select count(distinct m.year) from employer_money m where lower(m.employer) in (p.e1, p.e2) and m.kind = 'revenue') >= 2 revenue_growth,
    exists (select 1 from employer_money m where lower(m.employer) in (p.e1, p.e2) and m.kind = 'net_profit') profit,
    exists (select 1 from employer_money m where lower(m.employer) in (p.e1, p.e2) and m.kind in ('market_value','total_assets')) net_worth,
    (select count(distinct h.read_on) from employer_headcount h where lower(h.employer) in (p.e1, p.e2) and h.source = 'wikidata') >= 2
      or (select count(distinct h.read_on) from employer_headcount h where lower(h.employer) in (p.e1, p.e2) and h.source = 'linkedin') >= 2 headcount_growth,
    exists (select 1 from employer_news n where lower(n.employer) in (p.e1, p.e2)) news
  from pool p
)
select count(*) jobs,
  count(*) filter (where contacts >= 1) contacts_any, count(*) filter (where recruiter) recruiter, count(*) filter (where hiring_manager) hiring_manager,
  count(*) filter (where past_hires) past_hires, count(*) filter (where reviews) reviews, count(*) filter (where linkedin_facts) linkedin_facts,
  count(*) filter (where revenue) revenue, count(*) filter (where revenue_growth) revenue_growth, count(*) filter (where profit) profit,
  count(*) filter (where net_worth) net_worth, count(*) filter (where headcount_growth) headcount_growth, count(*) filter (where news) news,
  count(*) filter (where contacts = 0 and not past_hires and not linkedin_facts and not revenue and not reviews and not news) nothing
from has;
