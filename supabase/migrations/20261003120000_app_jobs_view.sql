-- The database decides which jobs the app shows. No snapshot, nothing to sync: every query reads the live table.
--   app_jobs                 every active posting (not closed, and a real job), with its level and which posting it was merged into. What the app reads.
--   active_jobs              one row per job: duplicates across platforms merged. What you look at in Supabase.
--   active_internship_entry  active_jobs at internship and entry level.
-- Active:  closed_at is empty, usable is empty or at least 0.5, and not posted more than 180 days ago (older ones are evergreen talent-pool listings).
-- Merged:  the same employer, title and city is one job; the posting kept is the employer's own site, then AcademicTransfer, Magnet.me, Indeed, Glassdoor, then the rest.
-- Level:   Jev's reading when it is at least 0.8 sure, otherwise the app's own title, seniority and years rules (ported from levelOf in src/lib/engine.ts).
create or replace view public.app_jobs with (security_invoker = true) as
with base as (
  select
    p.id, p.employer, p.employer_display, p.ats, p.source, p.title, p.region, p.cat, p.cbs_group, p.url, p.ind_sponsor, p.ind_sponsor_name, p.years_min,
    p.dutch_required, p.visa_mention, p.junior_title, p.degree_asked, p.skills, p.pay_posted, p.applicants, p.applicants_text, p.valid_through, p.seniority,
    p.posted_at, p.days_open, p.freshness_state, p.fetched_at, p.title_clean, p.level_jev, p.level_conf, p.usable, p.industry, p.workplace, p.job_type,
    p.dutch_jev, p.family, p.closed_at, p.last_checked, p.posted_on,
    case
      -- What kind of first job it is, read by Jev from the whole posting (scripts/jev-kind.mjs, only where it is 0.8 sure). It decides the level for these.
      when p.role_kind in ('internship', 'working_student') then 'Internship'
      when p.role_kind in ('traineeship', 'entry_job') then 'Entry'
      -- Not a first job at all (a PhD, a postdoc, a professor, a role that asks for experience): out of the internship and entry levels.
      when p.role_kind = 'other' then 'Not stated'
      -- A traineeship or management trainee programme is a paid first job, not an internship, whatever the reading said (it lumps them together).
      when p.title ~* '\y(trainee|traineeship|traineeships)\y' and p.title !~* '\y(intern|internship|stagiair\w*|stage|meewerkstage|werkstudent|working student|graduation)\y' then 'Entry'
      -- Jev's reading, where it is at least 0.8 sure.
      when p.level_conf >= 0.8 and p.level_jev in ('internship', 'entry', 'mid', 'senior', 'manager', 'director') then initcap(p.level_jev)
      -- Otherwise the same rules the app has always applied to the title (src/lib/engine.ts levelOf), in the same order.
      when p.title ~* '\y(director|vice president|vp|svp|evp|head of|head,|managing director|general manager|country manager|chief)\y' then 'Director'
      when p.title ~* '\y(intern|internship|stagiair\w*|stage|meewerkstage)\y' or p.seniority = 'Internship' or p.title ~* '\y(werkstudent|working student)\y' then 'Internship'
      when p.title ~* '\y(trainee|traineeship)\y' then 'Entry'
      when p.title ~* '\y(development|graduates?|leadership|talent|rotational|early careers?|future leaders?|young professionals?|fast ?track)\s+(programme|program|track|scheme)\y' then 'Entry'
      when p.title ~* '\y(senior|sr\.?|staff|principal|architect)\y' then 'Senior'
      when p.title ~* '(\yteam ?lead|\ytech lead|\ylead |\ymanager\y|\ysupervisor|\yteamleider)' then
        case when p.title ~* '\y(account|product|project|programm?e?|brand|customer|client|relationship|partner(ship)?|community|content|social media|marketing|campaign|category|channel|sales|business development|change|release|delivery|service|vendor|procurement|implementation|onboarding|portfolio|risk|compliance|quality|solutions?|technical account|engagement)\s+(\w+\s+)?manager\y'
                  and p.title !~* 'team ?lead' then
               case when p.seniority = 'Mid-Senior level' then (case when coalesce(p.years_min, 0) >= 5 then 'Senior' else 'Mid' end)
                    when p.seniority = 'Internship' then 'Internship'
                    when p.seniority in ('Entry level', 'Associate') then 'Entry'
                    when p.seniority in ('Director', 'Executive') then 'Director'
                    when p.years_min is not null then (case when p.years_min <= 2 then 'Entry' when p.years_min <= 4 then 'Mid' else 'Senior' end)
                    else 'Not stated' end
             else 'Manager' end
      when p.title ~* '\y(junior|jr\.?|graduate|starter|entry|associate|assistant|young professional)\y' then 'Entry'
      -- Last, the seniority label and the years the posting asks for.
      when p.seniority = 'Mid-Senior level' then (case when coalesce(p.years_min, 0) >= 5 then 'Senior' else 'Mid' end)
      when p.seniority = 'Internship' then 'Internship'
      when p.seniority in ('Entry level', 'Associate') then 'Entry'
      when p.seniority in ('Director', 'Executive') then 'Director'
      when p.years_min is not null then (case when p.years_min <= 2 then 'Entry' when p.years_min <= 4 then 'Mid' else 'Senior' end)
      else 'Not stated'
    end as level_view
  from public.postings p
  where p.closed_at is null and (p.usable is null or p.usable >= 0.5)
    -- A posting dated more than 180 days ago that is still listed is nearly always an evergreen talent-pool entry, not an opening: kept in the table, left out of the app.
    and (p.posted_on is null or p.posted_on >= current_date - 180)
), keyed as (
  select b.*,
    trim(regexp_replace(lower(coalesce(b.employer_display, '')), '[^a-z0-9]+', ' ', 'g')) || '|' ||
    trim(regexp_replace(regexp_replace(lower(coalesce(b.title, '')),
      '\m(m ?/ ?f ?/ ?[dx]|f ?/ ?m ?/ ?[dx]|m ?/ ?v ?/ ?x|m ?/ ?w ?/ ?d|h ?/ ?f ?/ ?x|all genders|gender neutral)\M', ' ', 'g'),
      '[^a-z0-9]+', ' ', 'g')) || '|' ||
    trim(regexp_replace(lower(split_part(split_part(coalesce(b.region, ''), ';', 1), ',', 1)), '[^a-z0-9]+', ' ', 'g')) as job_key
  from base b
), ranked as (
  select k.*,
    row_number() over (
      partition by k.job_key
      order by
        case lower(k.ats)
          when 'workday' then 0 when 'greenhouse' then 0 when 'ashby' then 0 when 'smartrecruiters' then 0 when 'successfactors' then 0
          when 'recruitee' then 0 when 'lever' then 0 when 'teamtailor' then 0 when 'personio' then 0 when 'workable' then 0
          when 'academictransfer' then 1 when 'magnet.me' then 2 when 'indeed' then 3 when 'glassdoor' then 4 else 5 end,
        k.posted_on desc nulls last, k.id
    ) as pick_rank
  from keyed k
)
select r.*, first_value(r.id) over (partition by r.job_key order by r.pick_rank) as kept_id, pp.skill_tiers, pp.enrollment, pp.role_kind
from ranked r join public.postings pp on pp.id = r.id;

-- active_jobs and active_internship_entry are replaced in place (create or replace): their first columns, in order, are the ones other views
-- (active_internship_entry_candidates) already read, and the new columns are added at the end.
create or replace view public.active_jobs with (security_invoker = true) as
select
  a.id, a.employer, a.employer_display, a.ats, a.source, a.title, a.region, a.cat, a.cbs_group, a.url, a.ind_sponsor, a.ind_sponsor_name, a.years_min,
  (a.dutch_required or coalesce(a.dutch_jev, 0) >= 0.8) as dutch_required,
  a.visa_mention, a.junior_title, a.degree_asked, a.skills, a.pay_posted, a.applicants, a.applicants_text, a.valid_through, a.seniority,
  a.posted_at, a.posted_on, a.fetched_at, a.last_checked,
  a.level_view as level,
  a.level_jev, a.level_conf, a.usable, a.industry, a.workplace, a.job_type, a.dutch_jev, a.family,
  case when a.posted_on is not null then (current_date - a.posted_on::date) else a.days_open end as days_open,
  -- new, at the end:
  a.title_clean, a.closed_at, a.level_view, a.job_key, a.kept_id, a.pick_rank,
  case when (case when a.posted_on is not null then (current_date - a.posted_on::date) else a.days_open end) <= 6 then 'fresh'
       when (case when a.posted_on is not null then (current_date - a.posted_on::date) else a.days_open end) <= 44 then 'active' else 'aging' end as freshness_state,
  a.skill_tiers, a.enrollment, a.role_kind
from public.app_jobs a
where a.pick_rank = 1;

create or replace view public.active_internship_entry with (security_invoker = true) as
select * from public.active_jobs where level in ('Internship', 'Entry');

grant select on public.app_jobs, public.active_jobs, public.active_internship_entry to anon, authenticated;

-- What the app opens with: first jobs that do not need Dutch (the app's default filters are level = internship/entry and language = English).
-- active_internship_entry above keeps the Dutch-required ones too, so it is the bigger number.
create or replace view public.active_internship_entry_english with (security_invoker = true) as
select * from public.active_internship_entry where not dutch_required;
grant select on public.active_internship_entry_english to anon, authenticated;
