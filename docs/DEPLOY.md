# Deploying odds

Pipelines, all on a push to `main`:

| Workflow | What it does | Needs |
| --- | --- | --- |
| `ci.yml` | lint, unused code, unit and browser tests | nothing |
| `deploy-odds.yaml` | ships the web app to S3 + CloudFront at https://odds.beeblast.co | the repository variables and the AWS role below |
| `deploy-supabase.yaml` | ships the edge functions to the Supabase project | secret `SUPABASE_ACCESS_TOKEN`, variable `SUPABASE_PROJECT_REF` |

## Setup (this repository already deploys; the Supabase project moved)

The AWS role, the S3 bucket, the CloudFront distribution and the branch rules stay as they are: this is the same repository.
Only the backend address changed, so:

**GitHub (Settings › Secrets and variables › Actions)**

| Kind | Name | Change |
| --- | --- | --- |
| Variable | `VITE_SUPABASE_URL` | set to `https://<project-ref>.supabase.co` (was the old project) |
| Secret | `VITE_SUPABASE_ANON_KEY` | set to the new project's anon key |
| Variable | `SUPABASE_PROJECT_REF` | new: `<project-ref>` |
| Secret | `SUPABASE_ACCESS_TOKEN` | new: personal access token of the account that owns the project |

**CloudFront (terraform in `beeblastco/infra`).** `odds_supabase_url` pins the Supabase address into the site's
Content-Security-Policy. Set it to the new project's address and apply, or the browser blocks every call to the backend.

**Supabase.** Secret `SHOO_APP_ORIGINS` = `https://odds.beeblast.co` (comma-separated site origins that may sign in).

## Rebuild order

1. Sign-in and deploy (the first commit).
2. The queue: Apply drops a job in, Broods works it in the person's Chrome, the report comes back.
3. The extension as hands for Broods: read the page, click and type, screenshots.
4. Job list and job pages, then the interview-chance model, on one shared core.
