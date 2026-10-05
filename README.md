# odds

Jobs in the Netherlands for international students: internships, traineeships, entry-level jobs and working-student jobs, in one list, with what each one pays, what you would keep after Dutch tax, whether it clears a visa salary minimum, and an estimate of your interview chance from your own profile.

The interview chance is an estimate built from published studies, not a measurement of any one job. Nothing here is tax, legal or immigration advice.

## What it does

- **One list from many boards.** Public sector, employers' own career sites and applicant-tracking boards, open feeds and LinkedIn pages, merged so the same job found twice shows once. The page opens on internships, traineeships and entry jobs that do not need Dutch.
- **Filters** for level, language (English / Dutch needed, multi-select), field, industry, city, pay, workplace, source, sponsor and how recently it was posted. A job that asks for Dutch is marked in the list.
- **Take-home pay.** Pay as the employer states it; otherwise a labelled estimate (internship allowance, traineeship range, or the typical pay for the occupation from Statistics Netherlands). Open a level to see the year and month after income tax and health insurance, with the 30% ruling and the visa route as boxes you tick.
- **Interview chance** from your CV or LinkedIn export and what you tick. Nothing is a hard gate: what a job asks for that you do not have is listed beside the chance, and ticking it shows what it would change.
- **What to put on your CV**: what the posting asks for, sorted by how much it insists, in the same words for every job.
- **People to ask for a referral**, an outreach tracker with stages, and message drafts.

## How the data works

Everything shown comes from a table of postings in Supabase (Postgres). Views (`app_jobs`, `active_jobs`, `active_internship_entry`) decide which postings are active, which are duplicates and which level each is, so the app, the tables and the numbers cannot drift apart.

Fields that postings do not state (kind of job, occupation group, industry, minimum years, degree, Dutch, student requirement, requirement tiers) are read from the full text with [TypeSafe](https://typesafe.ai) Jev, and samples were re-checked by independent reviewers. Where a reading is not sure, the field stays empty and the app says so instead of guessing. Every figure traces to a source; the sources are listed in the app under "How it works" and "Research". [docs/DATA.md](docs/DATA.md) says how each part of the data is made, kept current and checked.

| Part | Where |
| --- | --- |
| Tax, pay bands, visa thresholds, interview-chance model | `src/lib/engine.ts`, `src/lib/spec.ts`, `src/lib/skill-tiers.ts` |
| Filters and the default view | `src/lib/filters.ts`, `src/components/JobFilters.tsx` |
| Job list and job panel | `src/components/JobBoard.tsx`, `JobDetail.tsx`, `JobPersonal.tsx` |
| People and outreach | `src/components/People.tsx`, `src/lib/suggest.ts`, `src/lib/outreach-stage.ts` |
| Supabase views and migrations | `supabase/migrations/` |
| Edge functions (profile reading, people lookup, open/closed checks) | `supabase/functions/` |
| Data scripts (reading with Jev, audits, people pre-fill) | `scripts/` |

## Run it

You need [Bun](https://bun.sh) and your own Supabase project.

```bash
bun install
cp .env.example .env.local        # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the anon key only)
bun run dev                       # http://localhost:5173
bun run test                      # unit tests
bun run build                     # typecheck and production build
```

The schema changes since 1 Oct 2026 are in `supabase/migrations/` (`supabase db push`); the base `postings` and reference tables predate them and are not in the repository, so a fresh project needs a copy of the live schema first. Deploying the app and the edge functions is in [docs/DEPLOY.md](docs/DEPLOY.md). The pipeline scripts in `scripts/` read their keys (Supabase access token, TypeSafe key, Apify token) from environment variables for one command and never from a file; `.env.secrets.example` shows the names. **Never commit `.env.local` or a service-role key.**

## Security and privacy

- Every table in the public schema has row-level security on. Anonymous visitors can read job and reference tables only; profiles and applications are readable by their owner only; everything else, including the stored people table, is closed to direct access and served through edge functions.
- The anon key in a browser build is public by design and is limited by those policies. Keys for writing data, the Supabase management token and the third-party keys stay in your environment.
- The people suggestions are names and job titles of professionals taken from public LinkedIn pages. Think about LinkedIn's terms and about GDPR before you publish or run your own copy.

## Known gaps

- Pay: most postings state no pay, so most figures are labelled estimates.
- "Where people in this job went next" covers five occupations and comes from Flemish careers (JobHop).
- LinkedIn-sourced jobs have no scheduled open/closed check yet; the other sources are checked hourly.
- Postings that publish no date show "Date not shown".

## License

All rights reserved. The code is public so it can be read, not so it can be copied, run, sold or reused: see [LICENSE](LICENSE). To ask for permission, open an issue. The job postings, employer names and logos, Statistics Netherlands, IND and Belastingdienst figures, and any people data belong to their own owners and sources.
