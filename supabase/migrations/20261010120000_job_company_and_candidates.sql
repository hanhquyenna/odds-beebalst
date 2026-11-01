-- What a job's page shows about the company and about the people who held the role before, read in one call each.
-- Both are security definer: the tables behind them stay closed to direct reads (RLS without policies), and only what these
-- functions return can be read. Employers are matched case-insensitively on the key and on the display name, because the same
-- company is stored as "adyen" in one table and "Adyen" in another.

-- The company: its scraped LinkedIn page (employer_facts), its Glassdoor numbers, the averages of its Glassdoor reviews and the
-- latest reviews themselves. Only data as scraped: no generated text.
create or replace function public.job_company(p_employer text, p_display text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with keys as (
    select distinct lower(trim(k)) as k from unnest(array[p_employer, p_display]) as k where coalesce(trim(k), '') <> ''
  ),
  facts as (
    select f.* from employer_facts f where lower(f.employer) in (select k from keys) order by (f.employer = p_employer) desc, f.fetched_at desc nulls last limit 1
  ),
  gd as (
    select g.* from employer_glassdoor g where lower(g.employer) in (select k from keys) order by g.review_count desc nulls last limit 1
  ),
  -- The same review can be stored under two spellings of the employer: kept once.
  rv as (
    select distinct on (r.title, r.review_date, left(coalesce(r.pros, ''), 80)) r.*
    from employer_glassdoor_reviews r where lower(r.employer) in (select k from keys)
    order by r.title, r.review_date, left(coalesce(r.pros, ''), 80), r.read_on desc nulls last
  )
  select jsonb_build_object(
    'facts', (select jsonb_build_object(
      'name', name, 'tagline', tagline, 'description', description, 'website', website, 'linkedin', linkedin_url,
      'founded', founded_year, 'employees', employees, 'employeeRange', employee_range, 'followers', followers,
      'type', company_type, 'headquarters', headquarters, 'locations', locations, 'industry', linkedin_industry,
      'specialities', specialities, 'topSchools', top_schools, 'topFunctions', top_functions, 'topFields', top_fields,
      'readOn', fetched_at) from facts),
    'glassdoor', (select jsonb_build_object(
      'url', glassdoor_url, 'rating', rating, 'reviews', review_count, 'recommendPct', recommend_pct,
      'ceo', ceo_name, 'ceoApprovalPct', ceo_approval_pct, 'readOn', read_on) from gd),
    'reviewStats', (select case when count(*) = 0 then null else jsonb_build_object(
      'count', count(*),
      'overall', round(avg(overall), 1), 'culture', round(avg(rating_culture), 1), 'balance', round(avg(rating_balance), 1),
      'career', round(avg(rating_career), 1), 'pay', round(avg(rating_pay), 1), 'management', round(avg(rating_management), 1),
      'diversity', round(avg(rating_diversity), 1),
      'recommendPct', round(100.0 * count(*) filter (where recommend = 'yes') / nullif(count(*) filter (where recommend in ('yes', 'no')), 0)),
      'newest', max(review_date), 'oldest', min(review_date)) end from rv),
    'money', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'amount', amount, 'currency', currency, 'year', year, 'source', source) order by year desc nulls last), '[]'::jsonb)
      from employer_money m where lower(m.employer) in (select k from keys)),
    'news', (select coalesce(jsonb_agg(jsonb_build_object('title', title, 'url', url, 'site', site, 'date', published) order by published desc nulls last), '[]'::jsonb)
      from (select distinct on (n.url) n.* from employer_news n where lower(n.employer) in (select k from keys) order by n.url, n.published desc) n),
    'reviews', (select coalesce(jsonb_agg(x order by (x->>'date') desc nulls last), '[]'::jsonb) from (
      select jsonb_build_object('date', review_date, 'title', title, 'role', role, 'status', status, 'place', place,
        'overall', overall, 'recommend', recommend, 'pros', pros, 'cons', cons) as x
      from rv order by review_date desc nulls last limit 30) t)
  );
$$;

-- The people who held this role (or one like it) before: only evidence that was checked and confirmed (validated, exact or
-- adjacent). Each comes with the public profile, the whole work history and education, newest first.
create or replace function public.job_successful_candidates(p_posting text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(x order by (x->>'status') = 'exact' desc, (x->>'confidence')::numeric desc nulls last), '[]'::jsonb)
  from (
    select distinct on (cp.id) jsonb_build_object(
      'id', cp.id,
      'name', cp.full_name,
      'headline', cp.headline,
      'currentPosition', cp.current_position,
      'location', cp.public_location,
      'avatar', case when cp.avatar_status = 'available' then cp.avatar_url end,
      'linkedin', cp.canonical_linkedin_url,
      'status', e.status,
      'confidence', e.confidence,
      'employerMatch', e.employer_match,
      'levelMatch', e.level_match,
      'experience', (select coalesce(jsonb_agg(jsonb_build_object('employer', x.employer, 'title', x.title, 'start', x.start_date, 'end', x.end_date,
          'current', x.is_current, 'type', x.experience_type, 'description', x.description) order by x.is_current desc nulls last, x.start_date desc nulls last), '[]'::jsonb)
        from candidate_experience x where x.candidate_profile_id = cp.id),
      'education', (select coalesce(jsonb_agg(jsonb_build_object('school', x.school, 'degree', x.degree, 'field', x.field, 'start', x.start_date, 'end', x.end_date)
          order by x.end_date desc nulls last), '[]'::jsonb)
        from candidate_education x where x.candidate_profile_id = cp.id)
    ) as x
    from job_candidate_evidence e
    join candidate_profiles cp on cp.id = e.candidate_profile_id
    where e.posting_id = p_posting and e.validation_status = 'validated' and e.status in ('exact', 'adjacent')
    order by cp.id, (e.status = 'exact') desc, e.confidence desc nulls last
  ) t;
$$;

revoke all on function public.job_company(text, text) from public;
revoke all on function public.job_successful_candidates(text) from public;
grant execute on function public.job_company(text, text) to anon, authenticated;
grant execute on function public.job_successful_candidates(text) to anon, authenticated;
