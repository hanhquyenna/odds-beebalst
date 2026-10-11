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
- [x] A1. Days open (closed_at − posted_on), NL postings, by ats (2026-10-11):
      magnet.me n=153 med 30 (p25 17, p75 63); workday n=140 med 18 (15-25); linkedin n=87 med 31 (16-32.5);
      academictransfer n=78 med 33 (29-47); greenhouse n=31 med 45 (24-121); ashby n=11 med 70; recruitee n=4 med 17; lever n=2.
      All together median 28, p75 43 (n=506). Median age at read of an applicant count: 9 days (n=350).
      Caveat: closed_at is when our checker noticed the close, so these are upper bounds (by the check interval).
- [x] A2. Decision: keep L = 28 for LinkedIn counts (the only source with applicant counts; LinkedIn's 31 is partly its 30-day
      auto-close, but NL ATS boards also stay open 18-45 days, unlike the US 8-14 in the report). Do NOT drop to 14.
      Possible refinement later: L = 18 when the same job is also on a Workday board.

### B. LinkedIn Job Postings 2023-24 (pile size and growth curve)
- [ ] B1. Download to `research-data/linkedin-postings/` (git-ignored, as all of research-data/). Source: OpenML dataset 45952
      "Linkedin_Job_Postings" (copy of Kaggle arshkon "LinkedIn Job Postings 2023-2024" postings.csv), licence CC BY-SA,
      https://openml.org/data/v1/download/22120395/Linkedin_Job_Postings.arff, 521,840,572 bytes, 123,849 rows, 28 columns.
      Download started 2026-10-11 (slow, ~1 MB/s). If it is incomplete, rerun:
      `curl -L -C - -o research-data/linkedin-postings/Linkedin_Job_Postings.arff <url above>`.
      Analysis script: `scripts/research/linkedin_postings.py` (reads the ARFF, writes `research-data/linkedin-postings/summary.json`).
- [ ] B2. Profile it: rows with `applies`, distribution of applies (median, p75, p90) by experience level (Internship, Entry level),
      company size, remote, and whether the job is Easy Apply (`application_type`) vs off-site.
- [ ] B3. Cross-sectional growth curve: applies vs age at scrape (scrape time − original listed time), fit cumulative
      F(t) = (t/L)^a pooled and by level; compare with sqrt (a = 0.5) and research priors (a 0.4-0.5, L 14).
- [ ] B4. Easy Apply vs off-site ratio of applies (supports the channel multiplier ×2.8 / ×1.9 in the report, or not).
- [ ] B5. Write results here; propose new parameters for `projectedApplicants()` / `pileFor()`.

### C. More field-experiment data (profile strength)
- [ ] C1. Deming et al. 2016: unzip `research-data/deming/deming.zip`, map columns to the engine's parts like `export_gemm.py`.
- [ ] C2. Kline, Rose & Walters 2022 (QJE 137(4), doi 10.1093/qje/qjac024), 83k+ applications to 108 large US employers.
      Replication data: openICPSR project 198284 V1, https://www.openicpsr.org/openicpsr/project/198284/version/V1/view
      **Needs a free openICPSR login to download: Kien must download it** (agents may not create accounts) and put the files in
      `research-data/kline/`. Then map columns like `export_gemm.py`.
- [ ] C3. Kroft, Lange & Notowidigdo 2013 (optional).
- [ ] C4. Add to the backtest (`loop.py` / `learn.py`), re-learn multipliers, report AUC and calibration slope per dataset,
      **with NL (GEMM NL) held out as the check**. Only adopt new multipliers if NL does not get worse.

### D. Apply to the engine
- [ ] D1. Change `projectedApplicants()` / `pileFor()` to the parameters from A and B (keep tests: `src/lib/odds-v2.test.ts`).
- [ ] D2. Update `learned_multipliers.json` if C improves NL.
- [ ] D3. Rebuild MCP core, run checks, e2e, commit, push, deploy mcp. Recheck Mileway example (posting p38c15dfe4b42).

- [ ] D4. Staleness in the chance itself: a posting older than its typical life is probably filled (rolling review). Today it only
      loses the "Most likely to hear back" tag and is not suggested (`likelyFilled()`, `LIKELY_FILLED_AFTER_DAYS = 30` in
      odds-v2.ts, done 2026-10-11). Next: multiply the chance by P(still reviewing | days open), e.g. survival of NL postings by age
      from A1 data, and show it on the job page.

### E. Outcome loop for when users come (build later, after D)
- [ ] E1. Snapshot the predicted chance + inputs when a job is marked Applied (app and Claude connector).
- [ ] E2. Ask "heard back?" 2-3 weeks later (interview / rejected / nothing), store with the snapshot.
- [ ] E3. Calibration view: predicted vs actual by bucket; feed `learn.py`.

## Decisions so far
- 2026-10-11: posting applicant count is a floor, projected forward (commit 83074ae). Mileway intern: 63% → 22%.
- 2026-10-11: user approved downloading the LinkedIn postings dataset and Kline et al. replication data.
- No LinkedIn scraping without the user explicitly accepting the ToS risk (see report section on legal).

## Progress log
- 2026-10-11: plan written.
- 2026-10-11: A1-A2 done (keep L = 28).
- 2026-10-11: user asked: suggestions newest first, and no "Most likely to hear back" on a 45-day-old job. Done: similarMix sorts
  newest first and skips postings > 30 days; hearBackFor skips them too (tests in src/lib/tailor.test.ts). MCP core rebuilt and
  deployed. Next: B1 (OpenML dataset id 45952 "Linkedin_Job_Postings", 123,849 rows, 28 features).
- 2026-10-11: B1 download running; analysis script written and tested on a partial file (scripts/research/linkedin_postings.py,
  stdlib only; times are 'YYYY-MM-DD HH:MM:SS' strings, missing = '?'). C2 needs Kien to download from openICPSR (login).
  Next: when the .arff is 521,840,572 bytes, run the script (B2-B4), then write results under B5.
