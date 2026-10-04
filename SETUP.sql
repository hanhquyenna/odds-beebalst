-- odds: everything the database needs, in one paste. Safe to run again.
-- Part 1: LinkedIn import limits (supabase/migrations/20261001120000_linkedin_imports.sql)
-- Run in Supabase, SQL Editor. Counts LinkedIn imports per user so the paid scraper cannot be run up.
create table if not exists public.linkedin_imports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'profile',
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists linkedin_imports_user_day on public.linkedin_imports (user_id, created_at desc);
alter table public.linkedin_imports enable row level security;
-- No policies: only the Edge Function (service role) reads and writes it.

-- Already created it without `kind`? Run:  alter table public.linkedin_imports add column if not exists kind text not null default 'profile';

-- Part 2: the data work queue and its tables (DATA_REQUIREMENTS.sql)
-- odds: the data work queue, as a table the team and ChatGPT can read, plus the tables the results go into.
-- Run this once in the Supabase SQL Editor. It is safe to run again (create if not exists, upserts).
--
--   public.data_requirements          what data we need, which fields, from where, who does it
--   public.data_requirements_status   the VIEW to read: each requirement with how many rows are in, and its state
--   result tables                     platform_observations, intern_pay_observations, study_effects,
--                                     market_tightness, skill_aliases, requirement_labels, fit_ratings
--
-- All tables are private: row-level security is on and there is no policy, so only the service role can read or
-- write them. The app never touches them.

-- ------------------------------------------------------------------ Jev's column on postings
alter table public.postings add column if not exists requirements jsonb;
comment on column public.postings.requirements is 'Jev reading: [{"text": verbatim line, "tier": must|strong|optional|nice, "kind": skill|tool|experience|education|language|other}]; [] when read and none found';

-- ------------------------------------------------------------------ result tables
create table if not exists public.platform_observations (
  id bigint generated always as identity primary key,
  employer_key text not null,            -- copy postings.employer exactly
  employer_name text not null,
  platform text not null,                -- glassdoor, linkedin, indeed, employer site, job board name, ...
  metric text not null check (metric in ('applicants', 'interview_rating', 'positive_interview_share', 'interview_reports', 'interview_process', 'intake_applications', 'intake_places')),
  value numeric,                         -- the number, as shown (a share as 0 to 1)
  value_text text,                       -- when the figure is words (the interview steps)
  unit text,                             -- count, rating_5, share, text
  n_reports integer,                     -- how many reports the figure rests on, if shown
  posting_id text,                       -- postings.id when the figure is about one posting
  source_url text not null,
  read_date date not null,
  quote text not null check (char_length(quote) <= 220),
  confidence text check (confidence in ('high', 'medium', 'low')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.intern_pay_observations (
  id bigint generated always as identity primary key,
  employer_key text not null,
  employer_name text not null,
  scope text,                            -- all interns, HBO, WO, master, relocation, other
  min_eur_month integer,
  max_eur_month integer,
  gross_or_net text check (gross_or_net in ('gross', 'net', 'not stated')),
  hours_per_week numeric,
  source_type text not null check (source_type in ('employer site', 'vacancy page', 'official', 'job board', 'self-reported')),
  source_url text not null,
  source_date date not null,
  quote text not null check (char_length(quote) <= 220),
  confidence text check (confidence in ('high', 'medium', 'low')),
  notes text,
  created_at timestamptz not null default now(),
  constraint intern_range_sane check (min_eur_month is null or (min_eur_month between 100 and 3000)),
  constraint intern_range_order check (min_eur_month is null or max_eur_month is null or min_eur_month <= max_eur_month)
);

create table if not exists public.study_effects (
  id bigint generated always as identity primary key,
  study text not null,                   -- short name: "Bertrand & Mullainathan 2004"
  authors text,
  year integer,
  country text,
  design text,                           -- correspondence experiment, audit, register, meta-analysis
  n integer,                             -- applications or observations
  signal text not null,                  -- what changed: experience, language, internship, degree level, gap, skills match, referral, origin
  effect_kind text check (effect_kind in ('multiplier', 'ratio', 'percentage_points', 'share')),
  effect_value numeric,
  ci_low numeric,
  ci_high numeric,
  source_url text not null,
  read_date date not null,
  quote text not null check (char_length(quote) <= 220),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.market_tightness (
  id bigint generated always as identity primary key,
  occupation_code text,
  occupation_label text not null,
  region text,
  period text not null,                  -- 2026Q2, 2026-08
  indicator text not null,               -- vacancies per unemployed, spanningsindicator, ...
  value numeric not null,
  unit text,
  source text not null,
  source_url text not null,
  read_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.skill_aliases (
  id bigint generated always as identity primary key,
  skill text not null,                   -- our dictionary name, e.g. "excel", "financial reporting"
  alias text not null,
  lang text not null check (lang in ('en', 'nl')),
  source text not null,                  -- ESCO alternative label, etc.
  source_url text,
  created_at timestamptz not null default now(),
  unique (skill, alias, lang)
);

create table if not exists public.requirement_labels (
  id bigint generated always as identity primary key,
  posting_id text not null,
  line_text text not null,               -- the requirement line as written in the posting
  tier text not null check (tier in ('must', 'strong', 'optional', 'nice', 'not a requirement')),
  labeler text not null,
  labeled_at timestamptz not null default now()
);

create table if not exists public.fit_ratings (
  id bigint generated always as identity primary key,
  posting_id text not null,
  profile_ref text not null,             -- which CV (an id, never a name)
  rater text not null,
  rater_type text not null check (rater_type in ('recruiter', 'student')),
  rating text not null check (rating in ('yes', 'maybe', 'no')),   -- would you interview this person?
  rated_at timestamptz not null default now()
);

alter table public.platform_observations enable row level security;
alter table public.intern_pay_observations enable row level security;
alter table public.study_effects enable row level security;
alter table public.market_tightness enable row level security;
alter table public.skill_aliases enable row level security;
alter table public.requirement_labels enable row level security;
alter table public.fit_ratings enable row level security;

-- ------------------------------------------------------------------ the queue
create table if not exists public.data_requirements (
  id text primary key,                   -- R01 ...
  area text not null,                    -- Interview chance | CV match | Validation
  requirement text not null,             -- what we need
  why text not null,                     -- what it changes in the app
  assignee text not null check (assignee in ('chatgpt', 'human', 'jev', 'internal')),
  method text not null,                  -- how to get it, step by step
  sources text,                          -- where to look
  target_table text,                     -- where the rows go
  target_metric text,                    -- for platform_observations: the metric value(s), comma separated
  target_fields text,                    -- the columns to fill
  target_rows integer,                   -- how many rows make this done
  priority integer not null default 2,   -- 1 first
  notes text
);
alter table public.data_requirements enable row level security;

insert into public.data_requirements (id, area, requirement, why, assignee, method, sources, target_table, target_metric, target_fields, target_rows, priority, notes) values
('R01', 'Interview chance', 'Applicant count for each posting that does not have one yet', 'Gives every job its own base rate: expected interviews per vacancy divided by applicants.', 'chatgpt',
 'Take postings from the employers with the most internship and graduate postings. Open each posting URL. Read the applicant count shown on the page ("over 200 applicants", "people applied"). Record the count as shown, with the date. Skip pages that show no count.',
 'LinkedIn posting pages, Indeed, Magnet.me, Nationale Vacaturebank, employer applicant systems', 'platform_observations', 'applicants',
 'employer_key, employer_name, platform, metric=applicants, value, unit=count, posting_id, source_url, read_date, quote, confidence', 150, 1,
 'Pages that only say "over 200" give 200 as the value and the words in value_text. Do not estimate.'),
('R02', 'Interview chance', 'Published intake: applications received against places, for graduate and trainee programmes', 'A real per-employer rate for the programmes students apply to most.', 'chatgpt',
 'For each of the 40 employers with the most graduate, trainee or internship postings, search the careers site and press pages for "applications" against "places" or "spots" for the programme. Record both figures with the year they refer to.',
 'Employer careers sites, annual reports, press releases', 'platform_observations', 'intake_applications,intake_places',
 'employer_key, employer_name, platform=employer site, metric (intake_applications or intake_places), value, unit=count, source_url, read_date, quote, confidence', 40, 2,
 'Two rows per programme, one per metric. Only where the employer itself states both.'),
('R03', 'Interview chance', 'Interview statistics per employer (calibration only)', 'A check on how strict each employer''s funnel is. Never shown to users.', 'chatgpt',
 'Use the owner''s own signed-in browser session. For the 40 employers with the most internship and graduate postings, open the employer''s interview page and read the figures visible on screen: interview difficulty rating, share of positive interview experiences, number of interview reports, and the stated steps. One page at a time, 10 to 15 seconds between actions, at most 30 pages a session and 2 sessions a day. Stop at any login prompt, captcha, verification or warning and tell the owner.',
 'Glassdoor interview pages (calibration only)', 'platform_observations', 'interview_rating,positive_interview_share,interview_reports,interview_process',
 'employer_key, employer_name, platform=glassdoor, metric, value or value_text, n_reports, source_url, read_date, quote, confidence=low', 120, 2,
 'Self-reported and not for display. No page copies, no reviewer details, quote up to 25 words.'),
('R04', 'Interview chance', 'Internship allowance for employers whose postings state none', 'Precise internship pay instead of an average.', 'chatgpt',
 'Use the instructions in CHATGPT_PROMPT_intern_pay.md. First the employer''s own careers pages, then other vacancy pages, then official and collective sources. Glassdoor intern pay only as a last resort and only with the owner present.',
 'Employer careers sites, vacancy pages, CAO and government sources, Nuffic, CBS', 'intern_pay_observations', NULL,
 'employer_key, employer_name, scope, min_eur_month, max_eur_month, gross_or_net, hours_per_week, source_type, source_url, source_date, quote, confidence', 40, 2,
 'Keep amounts as written. If two sources disagree keep both rows.'),
('R05', 'Interview chance', 'Labour-market tightness per occupation', 'A competition prior for how hard it is to get hired in each line of work.', 'chatgpt',
 'Pull published tables through their open APIs or downloads: CBS vacancies, UWV Spanningsindicator, ROA labour-market indicator, Indeed Hiring Lab NL. Record each indicator per occupation and period with its source link.',
 'CBS StatLine, UWV, ROA, Indeed Hiring Lab', 'market_tightness', NULL,
 'occupation_code, occupation_label, region, period, indicator, value, unit, source, source_url, read_date', 60, 3,
 'UWV Spanningsindicator needs the owner to download the CSV from ArbeidsmarktInZicht (captcha).'),
('R06', 'Interview chance', 'Effect sizes of CV signals from correspondence studies', 'Replaces single-study multipliers with sourced ranges per signal.', 'chatgpt',
 'From published correspondence-study reviews (for example Baert 2018) and the original studies, record for each signal (experience, language, internship, degree level, over-qualification, employment gap, skills match, referral, origin) the effect, its sample, country, year and confidence interval where given.',
 'Published studies and reviews (open access or abstract-level only)', 'study_effects', NULL,
 'study, authors, year, country, design, n, signal, effect_kind, effect_value, ci_low, ci_high, source_url, read_date, quote', 30, 2,
 'Quote up to 25 words that contain the figure. Never paraphrase a number.'),
('R07', 'Interview chance', 'Dutch field-experiment microdata request (Thijssen, Coenders & Lancee; GEMM)', 'Occupation- and region-specific anchors for how a fitted application is answered.', 'human',
 'Check whether the data is public in the data archive (DANS) or the UvA repository. If not, email the authors with the request template in PLAN_data_accuracy. Record the date sent and the answer in notes.',
 'DANS, UvA repository, the authors', NULL, NULL, NULL, NULL, 2, 'Not verified that the data is public.'),
('R08', 'CV match', 'Skill aliases and Dutch terms for the skill dictionary', 'Stops real skills being missed ("Word", "analytics", Dutch wording).', 'chatgpt',
 'For each skill in the app''s dictionary (src/lib/skills.ts), pull ESCO alternative labels in English and Dutch through the ESCO API and record one row per alias with its source link.',
 'ESCO API (alternative labels, English and Dutch)', 'skill_aliases', NULL, 'skill, alias, lang, source, source_url', 500, 2, NULL),
('R09', 'CV match', 'Jev requirement tiers for every posting', 'Compulsory against nice-to-have, so the fit and the gates are fair.', 'jev',
 'Follow JEV_REQUIREMENTS_SPEC.md: write postings.requirements for each posting, [] when read and none found.',
 'Posting text in postings.body', 'postings', NULL, 'requirements', NULL, 1, 'Target is every posting; the view counts postings with the column filled.'),
('R10', 'Validation', 'Hand-labelled requirement tiers for 100 postings', 'Measures how often the tiers (Jev or rules) are right. Ship at 90% or better.', 'human',
 'Pick 100 postings across industries and levels. For each requirement line choose a tier, or mark it not a requirement. Two people label 30 of the postings so agreement can be measured.',
 'Postings in the app', 'requirement_labels', NULL, 'posting_id, line_text, tier, labeler', 100, 1, 'Rows count as one per posting labelled.'),
('R11', 'Validation', 'Recruiter and student ratings of 30 CV and job pairs', 'Checks the fit score ranks pairs the way people would. Needs Spearman 0.5 or better.', 'human',
 'Choose 30 pairs. Each rated by 3 raters: would you interview this person? yes, maybe or no.',
 'Owner''s network', 'fit_ratings', NULL, 'posting_id, profile_ref, rater, rater_type, rating', 90, 1, '30 pairs times 3 raters.'),
('R12', 'Interview chance', 'Outcome log from users', 'The only way the estimate becomes measured. About 30 results per group.', 'internal',
 'Build the log in the app (applied, interview, offer, rejected, no reply, with dates and the fit and chance shown). Consent on first use, shown only as groups of 10 or more.',
 'The app', NULL, NULL, NULL, NULL, 3, 'Not started.')
on conflict (id) do update set
  area = excluded.area, requirement = excluded.requirement, why = excluded.why, assignee = excluded.assignee, method = excluded.method,
  sources = excluded.sources, target_table = excluded.target_table, target_metric = excluded.target_metric, target_fields = excluded.target_fields,
  target_rows = excluded.target_rows, priority = excluded.priority, notes = excluded.notes;

-- ------------------------------------------------------------------ the view to read
create or replace view public.data_requirements_status
with (security_invoker = true) as
select
  r.id, r.priority, r.area, r.requirement, r.assignee, r.target_table, r.target_metric, r.target_fields, r.method, r.sources, r.why, r.notes,
  coalesce(case when r.target_table = 'postings' then (select count(*) from public.postings) else r.target_rows end, 0) as target_rows,
  c.rows_collected,
  greatest(coalesce(case when r.target_table = 'postings' then (select count(*) from public.postings) else r.target_rows end, 0) - c.rows_collected, 0) as rows_missing,
  case
    when r.target_table is null then 'manual'
    when c.rows_collected = 0 then 'open'
    when c.rows_collected >= coalesce(case when r.target_table = 'postings' then (select count(*) from public.postings) else r.target_rows end, 0) then 'done'
    else 'in progress'
  end as state
from public.data_requirements r
cross join lateral (
  select case r.target_table
    when 'platform_observations' then (select count(*) from public.platform_observations o where r.target_metric is null or o.metric = any (string_to_array(r.target_metric, ',')))
    when 'intern_pay_observations' then (select count(*) from public.intern_pay_observations)
    when 'study_effects' then (select count(*) from public.study_effects)
    when 'market_tightness' then (select count(*) from public.market_tightness)
    when 'skill_aliases' then (select count(*) from public.skill_aliases)
    when 'requirement_labels' then (select count(distinct posting_id) from public.requirement_labels)
    when 'fit_ratings' then (select count(*) from public.fit_ratings)
    when 'postings' then (select count(*) from public.postings where requirements is not null)
    else 0
  end as rows_collected
) c
order by r.priority, r.id;

comment on view public.data_requirements_status is 'Read this first: every data requirement with how many rows are in and whether it is open, in progress, done or manual.';
