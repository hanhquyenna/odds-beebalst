# Deploying odds

Pipelines, all on a push to `main`:

| Workflow | What it does | Needs |
| --- | --- | --- |
| `ci.yml` | lint, unused code, unit and browser tests | nothing |
| `deploy-odds.yaml` | ships the web app to S3 + CloudFront at https://odds.beeblast.co | the repository variables and the AWS role below |
| `deploy-supabase.yaml` | ships the edge functions to the Supabase project | secret `SUPABASE_ACCESS_TOKEN`, variable `SUPABASE_PROJECT_REF` |

## Setup (this repository already deploys; the Supabase project moved)

## 2. Supabase (project `gdavxkaioqlfvfunmtxd`)

**GitHub (Settings › Secrets and variables › Actions)**

- **Edge Functions**: three, each routing by sub-path (see its `index.ts`):
  `account` (`/account/shoo`, `/account` with `{ action }`), `profile` (`/profile/import`, `/profile/read`) and `jobs`
  (`/jobs/add`, `/jobs/check`, `/jobs/check-public`, `/jobs/morning`, `/jobs/welcome`, `/jobs/people`).
  Deploy with `supabase functions deploy <name> --project-ref gdavxkaioqlfvfunmtxd --use-api`.
  `supabase/config.toml` sets which functions are open (`verify_jwt = false`) and which need a signed-in user; the
  CLI reads it, so do not add `--no-verify-jwt` by hand and do not drop that file. If `account` or `jobs`
  ever require a sign-in, QR codes, guest accounts, the hourly checks and the morning message stop working.
- **Function secrets** (set in Supabase, never in the repo): `VAPID_KEYS`, `VAPID_PUBLIC_KEY`, `VAPID_CONTACT`,
  `MORNING_SECRET`, `CHECK_SECRET`, `PUBLIC_CHECK_SECRET`, `APIFY_TOKEN`, `APIFY_JOB_TOKEN`, `TYPESAFE_API_KEY`,
  `DAILY_LIMIT`, `ANON_LIMIT`, `GLOBAL_LIMIT`.
- **Migrations**: every file in `supabase/migrations` has a unique version and is recorded as applied, so
  `supabase db push` has nothing to do today. New migrations need a new 14-digit version
  (`YYYYMMDDHHMMSS_name.sql`); two files with the same version break `db push`.
- **Scheduled jobs (pg_cron)**: the hourly open/closed checks (`/jobs/check`, `/jobs/check-public`), and
  `/jobs/morning` at 06:00 and 07:00 UTC (it only sends on the run where it is 8:00 in Amsterdam, so summer and winter
  time both work).
- **The morning message** uses the app's own job filters, bundled into `supabase/functions/jobs/match.js`. After
  changing `src/lib/filters.ts`, run `scripts/build-morning-jobs.sh` and deploy `jobs`.

**CloudFront (terraform in `beeblastco/infra`).** `odds_supabase_url` pins the Supabase address into the site's
Content-Security-Policy. Set it to the new project's address and apply, or the browser blocks every call to the backend.

**Supabase.** Secret `SHOO_APP_ORIGINS` = `https://odds.beeblast.co` (comma-separated site origins that may sign in).

- To switch it on: set the secret `SHOO_APP_ORIGINS` to the site's origin(s), comma-separated
  (`supabase secrets set SHOO_APP_ORIGINS=https://your-domain --project-ref gdavxkaioqlfvfunmtxd`), then deploy
  `account`. `config.toml` keeps `account` callable before sign-in (it checks the Shoo token itself).
- In Supabase, Authentication, URL Configuration: set Site URL to the production address and add it (with `/**`) to
  Redirect URLs. Today the Site URL is `http://localhost:3000`.

1. Sign-in and deploy (the first commit).
2. The queue: Apply drops a job in, Broods works it in the person's Chrome, the report comes back.
3. The extension as hands for Broods: read the page, click and type, screenshots.
4. Job list and job pages, then the interview-chance model, on one shared core.
