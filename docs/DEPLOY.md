# Deploying odds

Pipelines, all on a push to `main`:

| Workflow | What it does | Needs |
| --- | --- | --- |
| `ci.yml` | lint, unused code, unit and browser tests | nothing |
| `deploy-odds.yaml` | ships the web app to S3 + CloudFront at https://odds.beeblast.co | the repository variables and the AWS role below |
| `deploy-supabase.yaml` | ships the edge functions to the Supabase project | secret `SUPABASE_ACCESS_TOKEN`, variable `SUPABASE_PROJECT_REF` |

## One-time setup for a new repository

**GitHub (Settings › Secrets and variables › Actions)**

| Kind | Name | Value |
| --- | --- | --- |
| Variable | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| Secret | `VITE_SUPABASE_ANON_KEY` | the project's anon key |
| Variable | `SUPABASE_PROJECT_REF` | `<project-ref>` |
| Secret | `SUPABASE_ACCESS_TOKEN` | personal access token of the account that owns the project |
| Variable | `AWS_REGION`, `AWS_ROLE_ARN`, `ODDS_S3_BUCKET`, `ODDS_CLOUDFRONT_DISTRIBUTION_ID` | the same values the old repository used |

**AWS and CloudFront (terraform in `beeblastco/infra`).** Two things there name the old repository and the old Supabase project, and
must change, or the site cannot deploy or reach its backend:

1. The deploy role's GitHub OIDC trust names the old repository (`repo:hanhquyenna/odds-beebalst`). Add this repository.
2. `odds_supabase_url` pins the Supabase address into the site's Content-Security-Policy. Set it to the new project's address, or the
   browser blocks every call to it.

**Supabase.** Secret `SHOO_APP_ORIGINS` = `https://odds.beeblast.co` (comma-separated site origins that may sign in).

## Rebuild order

1. Sign-in and deploy (the first commit).
2. The queue: Apply drops a job in, Broods works it in the person's Chrome, the report comes back.
3. The extension as hands for Broods: read the page, click and type, screenshots.
4. Job list and job pages, then the interview-chance model, on one shared core.
