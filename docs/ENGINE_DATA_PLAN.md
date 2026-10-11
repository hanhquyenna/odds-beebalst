# Engine data plan: calibrate the interview chance on large data

**Handoff file.** Any agent picking this up: read this whole file first, then continue at the first unchecked step in
"Steps". Update "Progress log" and the checkboxes after every step, and commit this file with the work.

Owner: Kien. Repo: odds-beebalst, branch `track-philips-sustainability-internship` (push there; main gets merged later).
Last updated: 2026-10-11.

## Goal

Make the interview chance (src/lib/odds-v2.ts, used by src/lib/engine.ts `standing()`) rest on large, row-level data instead
of assumptions, before the app has users. Two parts of the engine, two data sources:

| Engine part | Today | Data to use |
| --- | --- | --- |
| Strength of the profile (experience, field, background, degree...) | Learned from 34,549 field-experiment applications (GEMM 19,181 incl. NL 4,402; Oreopoulos 12,910; Sweden ~2,500). NL AUC 0.57, calibration slope 1.10 | Add more open correspondence-study data: Kline, Rose & Walters 2021 (~83k), Deming et al. 2016 (10,484, already in `research-data/deming/deming.zip`, unused), Kroft et al. (~12k) |
| Size of the pile (how many apply), how it grows over a posting's life | Assumptions + US/UK reports (see `reports/Applicant count projection.md`) | LinkedIn Job Postings 2023-24 (Kaggle by arshkon / OpenML copy, ~124k postings, `applies`, `views`, listed/expiry times, CC BY-SA) |

There is **no 2-million-row dataset** in the repo. "109M" (Ashby) and "125M" (Dice/NBER) are aggregate figures quoted from
reports, not training data.

## Current state of the engine (read before changing anything)

- `src/lib/odds-v2.ts`: `pileFor()` (pile size), `projectedApplicants()` (posting count is a floor, projected as
  count × sqrt(open days / age at read), open = max(28, days since posted) capped 60, factor capped 6; no read date = count as is),
  `strengthParts()` (the z-scores), `oddsV2()`.
- `research-data/backtest/`: `learn.py` learns multipliers into `learned_multipliers.json`; `loop.py`, `final_summary_*.csv`
  (AUC / slope per dataset), `parts.jsonl` (34,549 rows of engine parts + outcome).
- After changing anything `supabase/functions/mcp/core.src.ts` imports (engine, odds-v2, filters...): run
  `sh scripts/build-mcp-core.sh`, commit `supabase/functions/mcp/core.js`, deploy:
  `supabase functions deploy mcp --project-ref ukpmpyfcnbhngkgbnkxi --use-api`.
- Checks before every commit: `bun run check` (tsc, lint, knip, tests) and `bun run e2e` (landing budget 310 kB, now ~308).
- Research report: `reports/Applicant count projection.md` (accumulation curve, LinkedIn count meaning, pools, shortlisting,
  scraping/legal). Notes in `research_notes/Applicant count projection/`.
- Supabase SQL from this machine: the CLI's direct DB is IPv6-only here; use the Management API with
  `SUPABASE_ACCESS_TOKEN` from `.env.secrets` (`set -a; . ./.env.secrets; set +a`), POST `/v1/projects/ukpmpyfcnbhngkgbnkxi/database/query`.
  Dates: use `postings.posted_on` (parsed date), not `posted_at` (free text).

## Steps

### A. Posting life from our own data (free, fast)
- [ ] A1. From `postings` with `closed_at` and `posted_on`: median/p25/p75 days open, split by `source`/`ats`
      (linkedin_apify, indeed, greenhouse, lever, ashby, workday...). Known so far: all sources together median 28, p75 43 (n=506);
      median age at read 9 days (n=350).
- [ ] A2. Decide L per source (LinkedIn/Indeed auto-close at ~30 days, so their 28 is a platform timer; ATS boards 8-14 days in
      outside data). Write the numbers here.

### B. LinkedIn Job Postings 2023-24 (pile size and growth curve)
- [ ] B1. Download to `research-data/linkedin-postings/` (OpenML copy preferred; Kaggle needs an account). User approved
      downloading on 2026-10-11. Record source URL, licence, file sizes, row counts.
- [ ] B2. Profile it: rows with `applies`, distribution of applies (median, p75, p90) by experience level (Internship, Entry level),
      company size, remote, and whether the job is Easy Apply (`application_type`) vs off-site.
- [ ] B3. Cross-sectional growth curve: applies vs age at scrape (scrape time − original listed time), fit cumulative
      F(t) = (t/L)^a pooled and by level; compare with sqrt (a = 0.5) and research priors (a 0.4-0.5, L 14).
- [ ] B4. Easy Apply vs off-site ratio of applies (supports the channel multiplier ×2.8 / ×1.9 in the report, or not).
- [ ] B5. Write results here; propose new parameters for `projectedApplicants()` / `pileFor()`.

### C. More field-experiment data (profile strength)
- [ ] C1. Deming et al. 2016: unzip `research-data/deming/deming.zip`, map columns to the engine's parts like `export_gemm.py`.
- [ ] C2. Kline, Rose & Walters 2021 replication data: download (openICPSR / authors' GitHub), record source + licence; map columns.
- [ ] C3. Kroft, Lange & Notowidigdo 2013 (optional).
- [ ] C4. Add to the backtest (`loop.py` / `learn.py`), re-learn multipliers, report AUC and calibration slope per dataset,
      **with NL (GEMM NL) held out as the check**. Only adopt new multipliers if NL does not get worse.

### D. Apply to the engine
- [ ] D1. Change `projectedApplicants()` / `pileFor()` to the parameters from A and B (keep tests: `src/lib/odds-v2.test.ts`).
- [ ] D2. Update `learned_multipliers.json` if C improves NL.
- [ ] D3. Rebuild MCP core, run checks, e2e, commit, push, deploy mcp. Recheck Mileway example (posting p38c15dfe4b42).

### E. Outcome loop for when users come (build later, after D)
- [ ] E1. Snapshot the predicted chance + inputs when a job is marked Applied (app and Claude connector).
- [ ] E2. Ask "heard back?" 2-3 weeks later (interview / rejected / nothing), store with the snapshot.
- [ ] E3. Calibration view: predicted vs actual by bucket; feed `learn.py`.

## Decisions so far
- 2026-10-11: posting applicant count is a floor, projected forward (commit 83074ae). Mileway intern: 63% → 22%.
- 2026-10-11: user approved downloading the LinkedIn postings dataset and Kline et al. replication data.
- No LinkedIn scraping without the user explicitly accepting the ToS risk (see report section on legal).

## Progress log
- 2026-10-11: plan written. Next: A1, then B1.
