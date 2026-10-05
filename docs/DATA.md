# How the data is made

For whoever runs the data scripts. Deploying the app and the edge functions is in [DEPLOY.md](DEPLOY.md).

## Rules

- Every number traces to a source. Ranges, never invented points. With no data the app says "Not stated" instead of guessing.
- A reading that is not sure (under 0.8 from Jev) leaves the field empty. Every closing or correction is written to `public.postings_audit_log` with its reason, and bulk rewrites keep the old values in a `public.postings_*_backup` table (row-level security on, no policy).
- The palette in `src/index.css` (`:root`) is white, near-black and one orange accent. The owner chose it; do not change the hues without asking.

## Keys

The anon key in `.env.local` reads postings and reference tables. Writing needs a Supabase personal access token (`sbp_...`), sent to the Management API (`/v1/projects/<ref>/database/query`) for one command. Pipeline keys (`SUPABASE_ACCESS_TOKEN`, `TYPESAFE_API_KEY`, `APIFY_TOKEN`) live only in the environment: see `.env.secrets.example`, load with `set -a; . ./.env.secrets; set +a`, check with `sh scripts/with-secrets.sh`. Never write one into a file in the repo.

## From posting to screen

1. **Store.** One table, `public.postings`, plus reference tables (`cbs_bands`, `cbs_age_factors`, `tax_params`, `transitions`). Jobs arrive from employer job systems, Magnet.me, AcademicTransfer, LinkedIn and the `jobs` function (`/jobs/add`).
2. **Show.** The app reads the view `public.app_jobs` (every active posting with its level and duplicate grouping). `active_jobs` is one row per job and `active_internship_entry` its internship and entry part, which the page opens on. Active means not closed and a real job; duplicates are the same employer, title and city. Defined in `supabase/migrations/20261003120000_app_jobs_view.sql`. Keep the first columns of `active_internship_entry` as they are: `active_internship_entry_candidates` is built on it.
3. **Keep current.** Three scheduled checks in the database, each closing a job with a line in `postings_audit_log`:
   - `jobs/check` (hourly): employer job systems (Workday, Greenhouse, Ashby, Lever, SmartRecruiters, Recruitee, Teamtailor, Personio). Closes after two misses. Runs land in `public.check_runs`. Dry run: `bun scripts/check-open.ts`.
   - `jobs/check-public` (hourly): Magnet.me, AcademicTransfer and EY pages, oldest checked first. Raise `take` in `supabase/functions/jobs/check-public.ts` if the pool outgrows it.
   - `close_expired_postings()` (hourly): closes a job whose own `valid_through` date has passed.
   - LinkedIn jobs are not on a schedule (Apify credit). `scripts/validate-linkedin.ts` writes a report and a `.sql` file to review and apply.

## After new jobs arrive

```bash
set -a; . ./.env.local; set +a
SUPABASE_ACCESS_TOKEN=... sh scripts/after-new-jobs.sh [family.json] [industry.json]
```

It fills a missing job field and industry (`classify-new.ts`, then `apply_classification.py`), gives every employer a logo (`fix-missing-logos.sh`), and runs `scripts/audit-display.ts`, which fails when a shown job has no logo, industry or field, or its text does not sort into sections. Name what the counting model cannot place in the two JSON files. A new employer text format that breaks the sections shows in `src/lib/job-sections.test.ts`: add the heading to `HEADINGS` in `src/lib/job-sections.ts` and a test.

## Reading postings with Jev

[TypeSafe](https://typesafe.ai) Jev reads what postings do not state. Each script reads only postings it has not read yet; `--rescan` reads them all again.

| Script | Fills |
| --- | --- |
| `jev-fill.mjs` | `title_clean`, `level_jev`, `usable` |
| `jev-family.mjs` | `family` (line of work) |
| `jev-fill2.mjs [--columns]` | years, degree; with `--columns` industry, workplace, job type, Dutch |
| `jev-occupation.mjs --write` | `cbs_group` (the pay band) |
| `jev-kind.mjs --out kind.json` | the kind of first job, read only; `role_kind` is written in a separate step |
| `jev-requirements.ts --all --write` | `requirements` (how much each line insists) |

The `.mjs` scripts write through PostgREST; to run them without the service-role key, preload the shim that sends the writes through the Management API:

```bash
SB_URL=... SB_KEY=<anon key> TYPESAFE_API_KEY=... SUPABASE_ACCESS_TOKEN=... ONLY_FILTER='first_seen=gte.2026-10-03' \
  node --import ./scripts/shim-management-writes.mjs scripts/jev-fill.mjs
```

After a requirements read, run `bun scripts/make-skill-tiers.ts` (no Jev) to fill `skill_tiers` and `years_min` with the job page's own code.

## Built from the postings

- `scripts/make-family-model.ts` writes `src/lib/family-model.json` (which line of work a CV points to). `scripts/eval-family-model.ts` measures it. Rerun after a new collection.
- `scripts/make_intern_pay.py` writes `src/lib/intern-pay.json` (allowances employers state).
- Employer pages: `extract_company_about.py` and `extract_culture_teams.ts` (the employer's own words), `fetch_employer_facts.py` (LinkedIn, Apify), `fetch_employer_news.py` (GDELT), `wikidata_fill.py` and `wikidata_financials.py`.

## People to ask for a referral

`public.job_people` holds people per employer; `jobs/people` only reads it (Google accounts only, not guests) and `src/lib/suggest.ts` (`rankForJob`) picks per job.

- `prefill-people.ts`: one Apify search per employer, judged by Jev, stores the ones it is sure of. Skips employers already in `job_people_runs`. `--dry` shows the cost first.
- `prefill-people-serp.ts`: the same through Google (SerpApi, free plan). Few results; an extra layer only.
- `store-li-people.ts` (with Jev) and `store-li-people-nojev.ts`: cards read by hand from LinkedIn people search. Rows stored without Jev carry `jev.judged = false`; `judge-li-people.ts --apply` judges them (`jev-gold.ts` tests its questions).
- `coverage-people.ts`, `coverage-entry-view.ts`, `uncovered-entry-view.ts`: how many jobs have someone the app would show.

## Checks

| Script | Checks |
| --- | --- |
| `check-data.ts` | every table the app reads, through the app's own maths |
| `check-cvs.ts`, `check-students.ts`, `e2e-cvs.ts` | the interview chance for many CVs and test students (`e2e-cvs.ts` needs the Jev key) |
| `check-profile-facts.ts` | Jev's reading of profile entries (needs the key) |
| `audit-odds.ts`, `audit-recs.ts`, `check-standard.ts` | chances, recommendations and the standard vocabulary on every live job |
| `test-linkedin-import.ts`, `test-import-function.ts` | the LinkedIn import against the real Apify actor |

Test CV files in `tests/cvs/` come from `scripts/make-cv-fixtures.py`.
