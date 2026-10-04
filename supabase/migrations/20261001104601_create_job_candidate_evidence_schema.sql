-- Applied directly to the database by another agent; pulled from the migration history so the repo matches it.

create table if not exists public.candidate_profiles (
  id uuid primary key default gen_random_uuid(),
  canonical_linkedin_url text not null unique,
  public_identifier text,
  headline text,
  current_position jsonb not null default '{}'::jsonb,
  public_skills jsonb not null default '[]'::jsonb,
  evidence_status text not null default 'discovered' check (evidence_status in ('discovered','apify_verified','apify_pending','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_experience (
  id uuid primary key default gen_random_uuid(),
  candidate_profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  employer text,
  title text,
  start_date text,
  end_date text,
  is_current boolean,
  source_url text not null,
  observed_at timestamptz not null,
  unique(candidate_profile_id, employer, title, start_date, end_date, source_url)
);

create table if not exists public.candidate_education (
  id uuid primary key default gen_random_uuid(),
  candidate_profile_id uuid not null references public.candidate_profiles(id) on delete cascade,
  school text,
  degree text,
  field text,
  start_date text,
  end_date text,
  source_url text not null,
  observed_at timestamptz not null,
  unique(candidate_profile_id, school, degree, field, start_date, end_date, source_url)
);

create table if not exists public.source_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  actor_id text,
  run_id text,
  dataset_id text,
  item_id text,
  request_url text,
  input_payload jsonb not null default '{}'::jsonb,
  status text not null,
  observed_at timestamptz not null default now(),
  error_text text,
  unique(provider, run_id, dataset_id, item_id)
);

create table if not exists public.job_candidate_evidence (
  id uuid primary key default gen_random_uuid(),
  posting_id text not null references public.postings(id) on delete cascade,
  candidate_profile_id uuid references public.candidate_profiles(id) on delete set null,
  source_url text,
  source_run_id uuid references public.source_runs(id) on delete set null,
  observed_at timestamptz not null default now(),
  label text not null default 'public_role_holder_proxy',
  education_evidence jsonb not null default '{}'::jsonb,
  current_position jsonb not null default '{}'::jsonb,
  previous_experience jsonb not null default '[]'::jsonb,
  employer_match text,
  role_function_match text,
  level_match text,
  education_match text,
  relevant_history jsonb not null default '[]'::jsonb,
  matched_requirements jsonb not null default '[]'::jsonb,
  missing_unknown_requirements jsonb not null default '[]'::jsonb,
  status text not null check (status in ('exact','adjacent','employer_match_only','unsupported','insufficient_public_evidence','apify_pending')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(posting_id, candidate_profile_id, source_url)
);

alter table public.candidate_profiles enable row level security;
alter table public.candidate_experience enable row level security;
alter table public.candidate_education enable row level security;
alter table public.source_runs enable row level security;
alter table public.job_candidate_evidence enable row level security;

create index if not exists idx_jce_posting_id on public.job_candidate_evidence(posting_id);
create index if not exists idx_ce_candidate_id on public.candidate_experience(candidate_profile_id);
create index if not exists idx_cedu_candidate_id on public.candidate_education(candidate_profile_id);
