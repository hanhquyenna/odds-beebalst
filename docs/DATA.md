# How the data is made

For whoever runs the data scripts. Deploying the app and the edge functions is in [DEPLOY.md](DEPLOY.md).

## Rules

- Every number traces to a source. Ranges, never invented points. With no data the app says "Not stated" instead of guessing.
- A reading that is not sure (under 0.8 from Jev) leaves the field empty. Every closing or correction is written to `public.postings_audit_log` with its reason, and bulk rewrites keep the old values in a `public.postings_*_backup` table (row-level security on, no policy).
- The palette in `src/index.css` (`:root`) is white, near-black and one orange accent. The owner chose it; do not change the hues without asking.

## Keys

The anon key in `.env.local` reads postings and reference tables. Writing needs a Supabase personal access token (`sbp_...`), sent to the Management API (`/v1/projects/<ref>/database/query`) for one command. Pipeline keys (`SUPABASE_ACCESS_TOKEN`, `APIFY_TOKEN`) live only in the environment: see `.env.secrets.example`, load with `set -a; . ./.env.secrets; set +a`. Never write one into a file in the repo.

## From posting to screen

1. **Store.** One table, `public.postings`, plus reference tables (`cbs_bands`, `cbs_age_factors`, `tax_params`, `transitions`). Jobs arrive from employer job systems, Magnet.me, AcademicTransfer, LinkedIn and the `jobs` function (`/jobs/add`).
2. **Show.** The app reads the view `public.app_jobs` (every active posting with its level and duplicate grouping). `active_jobs` is one row per job and `active_internship_entry` its internship and entry part, which the page opens on. Active means not closed and a real job; duplicates are the same employer, title and city. Defined in `supabase/migrations/20261003120000_app_jobs_view.sql`. Keep the first columns of `active_internship_entry` as they are: `active_internship_entry_candidates` is built on it.
3. **Keep current.** Three scheduled checks in the database, each closing a job with a line in `postings_audit_log`:
   - `jobs/check` (hourly): employer job systems (Workday, Greenhouse, Ashby, Lever, SmartRecruiters, Recruitee, Teamtailor, Personio). Closes after two misses. Runs land in `public.check_runs`.
   - `jobs/check-public` (hourly): Magnet.me, AcademicTransfer and EY pages, oldest checked first. Raise `take` in `supabase/functions/jobs/check-public.ts` if the pool outgrows it.
   - `close_expired_postings()` (hourly): closes a job whose own `valid_through` date has passed.
   - LinkedIn jobs are not on a schedule (Apify credit). `scripts/validate-linkedin.ts` writes a report and a `.sql` file to review and apply.

## After new jobs arrive

```bash
set -a; . ./.env.local; set +a
SUPABASE_ACCESS_TOKEN=... sh scripts/after-new-jobs.sh [family.json] [industry.json]
```

It fills a missing job field and industry (`classify-new.ts`, then `apply_classification.py`), gives every employer a logo (`fix-missing-logos.sh`), and runs `scripts/audit-display.ts`, which fails when a shown job has no logo, industry or field, or its text does not sort into sections. Name what the counting model cannot place in the two JSON files. A new employer text format that breaks the sections shows in `src/lib/job-sections.test.ts`: add the heading to `HEADINGS` in `src/lib/job-sections.ts` and a test.

## Made once

The Jev readings (`title_clean`, `level_jev`, `family`, `cbs_group`, `requirements`, `skill_tiers`), `src/lib/family-model.json`, `src/lib/intern-pay.json`, the employer pages and `public.job_people` (people to ask for a referral, read by `jobs/people`) were filled by one-off scripts. They were removed on 5 Oct 2026 and are in git history before that commit.
