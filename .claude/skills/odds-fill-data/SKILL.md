---
name: odds-fill-data
description: Fill the per-job data odds shows (outreach contacts, recruiters, hiring managers, past hires, Glassdoor reviews, LinkedIn company facts, revenue/net worth/growth) for the newest internship and entry jobs that do not need Dutch, using Apify on free credits and Wikidata. Use when asked to check coverage, "fill in the data", find recruiters/hiring managers/past hires, refresh company facts, or pick an Apify actor for odds.
---

# Fill per-job data for odds

Scope is always the same: jobs in `app_jobs` with `level_view in ('Internship','Entry')`, `dutch_required is not true`, posted in the
last 30 days (`coalesce(posted_on, current_date - days_open)`), **newest first**. Every script below already selects and orders that way.

Rule: nothing a person reads is written by a model. Data comes from the source (LinkedIn, Glassdoor, Wikidata) and is kept or dropped by
fixed rules in the scripts (same company by name or LinkedIn page, in the Netherlands, title fits the role and level). A model may only
format.

## Setup

- `.env.secrets` must hold `SUPABASE_ACCESS_TOKEN` (Management API, used for every read and write) and `APIFY_TOKEN`. The user fills these
  in themselves; never write a token into any other file or into chat. Load with `set -a; . ./.env.secrets; set +a`.
- Check the Apify account first (free plan: $10 a month):
  `curl -s -H "Authorization: Bearer $APIFY_TOKEN" https://api.apify.com/v2/users/me/limits` → `current.monthlyUsageUsd` vs `limits.maxMonthlyUsageUsd`.
  A 401 `user-or-token-not-found` means the token is wrong or revoked.
- Only pay-per-event (PPE) or per-result actors run on free credits. Rental actors (`FLAT_PRICE_PER_MONTH`) need a paid plan: skip them.

## Which actor for what (tested 11 Oct 2026 on the free plan)

| Data | Script | Actor | Measured cost | Verdict |
|---|---|---|---|---|
| Recruiters + hiring managers (outreach) | `scripts/find-people.ts` | `harvestapi/linkedin-profile-search`, Short mode | $0.05 per search (25 people) | Good. Two searches per employer (recruiting/HR; managers in the jobs' departments, seniority 200/210/220) |
| Past hires ("successful candidates") | `scripts/find-past-hires.ts` | `harvestapi/linkedin-profile-search`, Full mode, `pastCompanies` + `pastJobTitles` | $0.10 per search (15 full profiles) | Good. One search per employer + title words; `--reuse-last` re-reads the last paid run for free |
| LinkedIn company page (size, founded, HQ, schools, functions, headcount) | `scripts/fill-linkedin-company.ts` | `harvestapi/linkedin-company` (`searches` by name, or `companies` by page) | ~$0.004 per company (a 1-company test only shows the start fee) | Excellent and cheap. `--refresh` re-reads known pages for a new headcount (growth) |
| Glassdoor reviews (and the review averages the job page shows) | `scripts/fill-glassdoor.ts` | `kaix/glassdoor-reviews-scraper` | ~$0 per review (start fee only) | Best. Many companies in one run |
| Finding a company's Glassdoor page | inside `fill-glassdoor.ts` | `apify/google-search-scraper`, query `"<name> glassdoor reviews"` | ~$0.0015 per company; minimum run cap $0.50 | Good. `site:glassdoor.nl/Reviews ...` returns nothing: use the plain query |
| Revenue, profit, net worth (market value / total assets), headcount by year | `scripts/wikidata_history.py` | none (Wikidata, free) | free | Covers the larger companies only; small firms publish nothing |
| More LinkedIn jobs | `scripts/pull-linkedin-public.ts` (free, no Apify) | or `valig/linkedin-jobs-scraper` | $0.001 per 10 jobs | valig is cheap and has description, posted date, applicants |
| More Indeed jobs | `scripts/pull-indeed.ts` | or `valig/indeed-jobs-scraper` (`country: "nl"`) | $0.001 per 10 jobs | Cheap, but many Dutch-language and non-entry jobs: the intake rules must filter |
| News | none | GDELT (free) | free | |

Tested and not worth it:
- `schesds/glassdoor-reviews`: $0.05 for 5 reviews and 190 s (10x kaix, 60x slower).
- `burbn/glassdoor-company-search`: complete company data by name, but $0.08 per company (4 actor starts).
- `curious_coder/linkedin-jobs-scraper`: $0.018 per 10 jobs (18x valig).
- `memo23/glassdoor-scraper-ppr`: fine ($0.005 for 5 reviews) but kaix is cheaper.

## Order on a small budget

1. `python3 scripts/wikidata_history.py --write` (free)
2. `bun scripts/fill-linkedin-company.ts --limit 400` (~$0.004 a company)
3. `bun scripts/fill-glassdoor.ts --limit 100` (cents)
4. `bun scripts/find-people.ts --limit N` (N searches × $0.05)
5. `bun scripts/find-past-hires.ts --limit N` (N searches × $0.10)

Every script takes `--dry` to show what it would do for free. Measure price on 10+ items, not 1 (a single item often shows only the start fee). Run a `--limit 1` first after any change and look at the stored rows before
the full run. Scripts stop on an Apify credit error.

## Checking coverage

Run the coverage query in `references/coverage.sql` through the Management API (`POST https://api.supabase.com/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query`
with `{"query": ...}`); it returns, for the jobs in scope, how many have contacts, recruiters, hiring managers, past hires, reviews,
revenue, revenue growth, profit, net worth, headcount growth, LinkedIn facts, news and nothing at all.

## Gotchas

- `job_people` is per employer, not per job; `jev.role` is `recruiter` or `hiring_manager` for rows these scripts write.
- `employer_glassdoor_reviews.employer` has a foreign key to `employer_glassdoor`: insert the employer row (id, url) first.
- `candidate_profiles.current_position` and `job_candidate_evidence.current_position` are jsonb (`{title, employer, start_date, end_date, employment_type}`);
  `evidence_status` must be `apify_verified`, `avatar_status` `available`/`unavailable`.
- harvestapi returns months as words ("May"): the scripts convert them.
- `employer_money` keeps one row per employer, kind and year; `employer_headcount` keeps `source` (`linkedin` or `wikidata`): never compare across sources.
- The Management API throttles: the scripts retry on 429.
