# odds

Jobs for international students in the Netherlands, and an AI agent that applies for them in your own Chrome.

This repository is being rebuilt. The tree now starts from the parts that live in integrations and are kept as they are:

- **Google sign-in** through Shoo: `src/lib/shoo.ts`, `src/components/SignIn.tsx`, and the Supabase bridge `supabase/functions/account/shoo.ts`
- **CI/CD**: `.github/workflows/` (checks on every push, web deploy to https://odds.beeblast.co, edge functions deploy)
- **The database**: `supabase/migrations/…_baseline.sql`, the whole public schema, so the project can always be recreated

- **One list from many boards.** Public sector, employers' own career sites and applicant-tracking boards, open feeds and LinkedIn pages, merged so the same job found twice shows once. The page opens on internships, traineeships and entry jobs that do not need Dutch.
- **Filters** for level, language (English / Dutch needed, multi-select), field, industry, city, pay, workplace, source, sponsor and how recently it was posted. A job that asks for Dutch is marked in the list.
- **Take-home pay.** Pay as the employer states it; otherwise a labelled estimate (internship allowance, traineeship range, or the typical pay for the occupation from Statistics Netherlands). Open a level to see the year and month after income tax and health insurance, with the 30% ruling and the visa route as boxes you tick.
- **Interview chance** from your CV or LinkedIn export and what you tick. Nothing is a hard gate: what a job asks for that you do not have is listed beside the chance, and ticking it shows what it would change.
- **What to put on your CV**: what the posting asks for, sorted by how much it insists, in the same words for every job.
- **People to ask for a referral**, an outreach tracker with stages, and message drafts.

## How the data works

Everything shown comes from a table of postings in Supabase (Postgres). The view `app_jobs` decides which postings are active, which are duplicates and which level each is, so the app, the tables and the numbers cannot drift apart.

Fields that postings do not state (kind of job, occupation group, industry, minimum years, degree, Dutch, student requirement, requirement tiers) are read from the full text with [TypeSafe](https://typesafe.ai) Jev, and samples were re-checked by independent reviewers. Where a reading is not sure, the field stays empty and the app says so instead of guessing. Every figure traces to a source; the sources are listed in the app under "How it works" and "Research". [docs/DATA.md](docs/DATA.md) says how each part of the data is made, kept current and checked.

| Part | Where |
| --- | --- |
| Tax, pay bands, visa thresholds, interview-chance model | `src/lib/engine.ts`, `src/lib/spec.ts`, `src/lib/skill-tiers.ts` |
| Filters and the default view | `src/lib/filters.ts`, `src/components/JobFilters.tsx` |
| Job list and job panel | `src/components/JobBoard.tsx`, `JobDetail.tsx`, `JobPersonal.tsx` |
| People and outreach | `src/components/People.tsx`, `src/lib/suggest.ts`, `src/lib/outreach-stage.ts` |
| Supabase views and migrations | `supabase/migrations/` |
| Edge functions `account` (sign-in), `profile` (LinkedIn import, profile reading), `jobs` (add, open/closed checks, morning message, people lookup) | `supabase/functions/` |
| Data scripts (after new jobs, logos, LinkedIn check, bundle budget) | `scripts/` |

## Run it

You need [Bun](https://bun.sh) and your own Supabase project.

```bash
bun install
cp .env.example .env.local   # put the project address and anon key in it
bun run dev
bun run check                # types, lint, unused code, unit tests
bun run e2e                  # browser tests
```

`scripts/dump-schema.ts` rewrites the baseline from a live project.
