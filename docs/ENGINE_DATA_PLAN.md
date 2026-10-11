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
- [x] B1. Download to `research-data/linkedin-postings/` (git-ignored, as all of research-data/). Source: OpenML dataset 45952
      "Linkedin_Job_Postings" (copy of Kaggle arshkon "LinkedIn Job Postings 2023-2024" postings.csv), licence CC BY-SA,
      https://openml.org/data/v1/download/22120395/Linkedin_Job_Postings.arff, 521,840,572 bytes, 123,849 rows, 28 columns.
      Download started 2026-10-11 (slow, ~1 MB/s). If it is incomplete, rerun:
      `curl -L -C - -o research-data/linkedin-postings/Linkedin_Job_Postings.arff <url above>`.
      Analysis script: `scripts/research/linkedin_postings.py` (reads the ARFF, writes `research-data/linkedin-postings/summary.json`).
- [x] B2. Profile it: rows with `applies`, distribution of applies (median, p75, p90) by experience level (Internship, Entry level),
      company size, remote, and whether the job is Easy Apply (`application_type`) vs off-site.
- [x] B3. Cross-sectional growth curve: applies vs age at scrape (scrape time − original listed time), fit cumulative
      F(t) = (t/L)^a pooled and by level; compare with sqrt (a = 0.5) and research priors (a 0.4-0.5, L 14).
- [x] B4. Easy Apply vs off-site ratio of applies (supports the channel multiplier ×2.8 / ×1.9 in the report, or not).
- [x] B5. Results (2026-10-11, file 447,784,124 of 521,840,572 bytes = 106,919 of 123,849 rows read; 22,613 with `applies`;
      summary in research-data/linkedin-postings/summary.json):
      * Applies are small: median Internship 2 (p75 6, p90 18.6, n=335), Entry level 2 (p75 4, p90 12, n=3,399), all levels 2-4.
        Mostly small US postings; NOT representative of big Dutch internships. Do not use as a pile-size prior for NL.
      * Growth with age: flat (median 2-4 at every age 0-30 days; log-log exponent ≈ -0.06 all, -0.11 entry/intern).
        The cross-section cannot measure growth: read time is estimated (max listed_time), re-listings, early-closing popular
        postings missing from old ages. **No change to the sqrt curve from this data.**
      * Channel: applies per view (views ≥ 10): Offsite 0.105 (n=7,508), Easy Apply 0.154 (n=1,487), Complex onsite 0.171 (n=9,447).
        For the same interest LinkedIn counts ~60-70% as much on off-site jobs: supports a channel multiplier for off-site counts
        (report: ×1.9 off-site vs ×2.8 Easy Apply as totals; the ratio here only bounds the click-vs-submit gap).
      * Decision: keep `projectedApplicants()` as is. Next data for the curve must be panels (same postings read repeatedly):
        log our own reads with timestamps (plan step E / research report calibration item 2).

### C. More field-experiment data (profile strength)
- [x] C1. Deming et al. 2016: unzip `research-data/deming/deming.zip`, map columns to the engine's parts like `export_gemm.py`.
      Done 2026-10-11. The Dataverse guestbook was answered in the browser (name and email of Kien, as he asked); the real file is
      `research-data/deming/Postsecondary_Credentials_Replication.zip` (unzipped under `deming/data/`; the old 122-byte `deming.zip`
      was the guestbook error). 10,484 audit applications (5 US cities, business and health jobs), any-callback 8.2%.
      **Only one engine part maps: school standing (`prestige`).** Result (scripts/research/deming_effects.py, job fixed effects,
      90% intervals): selective against non-selective public school, business BA jobs: lift x0.98 [0.70, 1.26], i.e. no effect.
      Public school against a for-profit online one: x1.30 [1.15, 1.45] (not a Dutch situation). AA-level business jobs: no
      difference between degree types. **Reading: it agrees with the engine, which already cuts the prestige step to 0.40 of the study
      value (learned_multipliers.json); if anything it argues for 0.4 or lower, never higher. No change made.** Race and gender are
      randomised in this audit and not used by the engine, on purpose.
- [x] C2. Kline, Rose & Walters: **done 2026-10-11** (Kien made the free openICPSR login; an agent downloaded it). Project 198284 is the 2024
      "A Discrimination Report Card" package, which carries the experiment's own rows: `replication/data/data.dta`, 83,643 applications to
      108 large US employers (CC-BY-NC). Race, gender and age names only (no experience or origin), so it feeds no part of the engine directly.
      What it gives (`scripts/research/new_data_effects.py`): callback 24.0%; Black-sounding name -0.075 (se 0.006) probit units; over 40
      -0.031; associate's degree +0.009 (nothing); and **callback rates between employers run from 5% to 45% (10th-90th percentile)**, which is
      the size of the spread the engine's employer tiers cover (60 to 600 applicants).
- [ ] C3. Kroft, Lange & Notowidigdo 2013 (optional). Not on Dataverse, Zenodo or OSF (searched 2026-10-11); ask the authors or check the QJE site.
- [x] C3b. **Swiss correspondence test** (Zenodo 6675500, CC-BY, 2,366 applications, German-speaking Switzerland 2017-18; origin x qualification fit
      x occupation). Downloaded 2026-10-11 to `research-data/more-data/swiss/`, run through the engine (`scripts/research/export_swiss.ts`,
      `scripts/research/swiss_check.py`). **A true external check: nothing was trained on it.** Within job, the engine's strength has
      probit slope **0.66 (se 0.12)** (study values alone 0.83, se 0.15; 1.0 = right scale) and within-job AUC 0.554 (GEMM NL 0.57), so the
      engine's spread is about 1.5x too wide here. By factor (probit units, observed vs engine): minority name -0.17 (se 0.03) vs -0.29;
      "okay" fit instead of good -0.48 (0.08) vs -0.60; overqualified instead of good -0.22 (0.15) vs -0.98. The overqualified row is only 186
      applications and rests on my mapping of "Fit of vacancy" to years of experience (Good 3, Okay 1.5, Overqualified 9: an assumption).
- [x] C3d. **Three more experiments from the same login (2026-10-11), run through the engine next to its shipped values**
      (`scripts/research/new_data_effects.py`; probit units, the engine's own scale):
      | part | observed (se) | engine ships | data |
      | --- | --- | --- | --- |
      | years beyond 2 asked, per year (cap 3) | +0.039 (0.015) | +0.055 | Eriksson & Rooth, Sweden, 8,466 callbacks |
      | | +0.83 pp (0.60) within an ad, x1.10 on an 8% base | +0.055 (about +0.9 pp) | Bertrand & Mullainathan, US, 4,870 |
      | minority name | -0.378 (0.034) | -0.293 | Eriksson & Rooth |
      | more education than required | -0.009 (0.036) | -0.053 | Eriksson & Rooth |
      | top employer on the first job | +0.215 (0.027) | +0.060 | Kessler et al., 6,320 resumes rated 1-10 (ordered probit) |
      | a second internship | +0.127 (0.032) | +0.079 | Kessler et al. |
      | skills: "special skills" / computer skills | **+0.65 pp (1.31) / -0.19 pp (1.32) within an ad**: nothing | +-0.2 at most (an assumption) | Bertrand & Mullainathan |
      Also measured, with no part in the engine: unemployed now 9 months -0.077 (0.047) and no effect of shorter or past spells, summer jobs
      -0.036 (0.031) (Eriksson & Rooth); honours +1.88 pp (2.28) within an ad (B&M); +1 GPA point +0.438 (0.041) (Kessler, a rating).
      **Correction (same day):** the first version of this table read B&M without ad fixed effects and reported special skills +0.41 probit and honours
      +0.29. Between ads those resume features were not randomised; within the same ad they are +0.65 pp (se 1.31) and +1.88 pp (2.28): no effect.
      **Reading:** years, minority and second internship sit within about 1.5 standard errors of the shipped values, in independent data from
      two countries; the overqualification penalty is, if anything, smaller than shipped. **One real disagreement:** prestige: Kessler's
      top-employer effect is 3.6x what the engine ships (0.40 multiplier learned from GEMM and Oreopoulos callbacks), but Kessler measures a
      stated would-hire rating, not callbacks. Not changed without a callback measure that settles it. Skills: within an ad B&M finds nothing,
      so the engine's skills part (+-0.2, an assumption) is if anything too large. IT resume audit (Harvard Dataverse DVN/DOM4OS, 2,032 applications, gender and residential status): downloaded, **not used**:
      Pakistan, and none of the engine's parts maps to it.
- [x] C4. (Done 2026-10-11 with the Swiss data; see below.) (Deming checked by hand, see C1: no change. Rows not added to `learn.py` because one mappable part with no effect cannot move the multipliers.) Add to the backtest (`loop.py` / `learn.py`), re-learn multipliers, report AUC and calibration slope per dataset,
      **with NL (GEMM NL) held out as the check**. Only adopt new multipliers if NL does not get worse.

### D. Apply to the engine
- [x] D1. Change `projectedApplicants()` / `pileFor()` to the parameters from A and B (keep tests: `src/lib/odds-v2.test.ts`).
      **No change, by A2 and B5:** L stays 28 and the sqrt curve stays; neither dataset measured anything better. (The research report
      argues for L = 14 and an off-site channel multiplier; B5 supports the multiplier only as a bound, so it waits for panel data.)
- [x] D2. Update `learned_multipliers.json` if C improves NL. (Second round, below, adds Eriksson-Rooth and Bertrand-Mullainathan.)
      **Not updated (2026-10-11).** Swiss added to `learn.py` (75% of pairs train, 25% test, PARTS=... env var and a "swiss" ceiling spec added to
      the local learn.py; research-data is git-ignored). Re-learned: years 0.69 -> 0.93, overqualified 0.63 -> 0.70, foreignDegree 1.00 -> 0.87,
      the others within 0.05. **NL unchanged** (AUC 0.570 both, log loss 0.6227 -> 0.6230, slope 1.10 -> 1.09) and on the Swiss test pairs the
      shipped multipliers were no worse (AUC 0.527 vs 0.519). The rule was "adopt only if NL improves or holds and the new data supports it":
      NL holds but nothing improves, and the Swiss mapping is my assumption, so the shipped multipliers stay.
      **Second round (Swiss + Eriksson-Rooth 10,610 rows + Bertrand-Mullainathan white names 2,435; `scripts/research/export_more.ts`):**
      years 0.69 -> 0.55, overqualified 0.63 -> 0.43, underqualified 0.67 -> 0.57, euNonNative 1.51 -> 1.93, dutch 0.81 -> 1.06, nonEu 1.19 -> 1.23.
      NL held out: AUC 0.5689 -> 0.5706, log loss 0.6239 -> 0.6229 (very slightly better); Eriksson-Rooth test AUC 0.568 -> 0.577; Swiss 0.527 -> 0.521.
      **Not adopted:** underqualified, overqualified and years depend on how many years the ads asked (not recorded in Eriksson-Rooth, Swiss or
      B&M: I assumed 2), and euNonNative on my mapping of German and French names. The one clean number, the minority effect, is
      nonEu 1.19 -> 1.23, too small to matter. To change a multiplier we need data where the ask is known.
- [x] D3. Rebuild MCP core, run checks, e2e, commit, push, deploy mcp. Recheck Mileway example (posting p38c15dfe4b42).
      Done 2026-10-11 for D4. Mileway is 13 days old with a count read on day 2: unchanged at 15.4% [5.4-35] (pile 180). `bun run check`
      909 tests, `bun run e2e` 9/9, landing 308.3 kB.

- [x] D4. Staleness in the chance itself: a posting older than its typical life is probably filled (rolling review). Today it only
      loses the "Most likely to hear back" tag and is not suggested (`likelyFilled()`, `LIKELY_FILLED_AFTER_DAYS = 30` in
      odds-v2.ts, done 2026-10-11). Next: multiply the chance by P(still reviewing | days open), e.g. survival of NL postings by age
      from A1 data, and show it on the job page.
      **Done 2026-10-11** (`stillReviewing()` in odds-v2.ts, applied to p, low and high; a line on the job page; `OddsV2.reviewing`).
      Survival redone properly (`scripts/research/posting_survival.py`, Kaplan-Meier with delayed entry, 2,529 postings, closes
      observed only 2026-10-02..11): the A1 numbers were closed-only and so biased low. Two readings, because the checker swept many
      old postings on 10-02, 10-03 and 10-10 (329 of 507 closes): counting every close, 62% still open at 28 days, 31% at 56, median
      life 31; leaving the sweep days out, 87% at 28, 64% at 56, median 84. The curve used is the middle of the two (1.0 to day 14,
      0.82 at 21, 0.75 at 28, 0.55 at 35, 0.47 at 56, 0.33 at 84). Measured: how long postings stay up. Assumed: employers stop
      reading about when their postings come down. A posting with a closing date still ahead gets no discount (batch review): that
      is 81% of the English postings older than 14 days, so only ~90 of 466 are touched. On 60 old no-deadline postings the average
      chance fell from 3.97% to 3.32%. **Cannot be tightened until the checker has run for months: re-run the script then.**

### E. Outcome loop for when users come (build later, after D)
- [x] E1. Snapshot the predicted chance + inputs when a job is marked Applied (app and Claude connector).
      Done 2026-10-11. Table `chance_snapshots` (migration 20261011120000): chance, range, model name (`SNAPSHOT_MODEL` in
      src/lib/outcome-snapshot.ts: **change it whenever the engine changes in a way that moves the chance**), and jsonb with one z-score
      per factor (the shape of parts.jsonl), the pile, `reviewing`, and a few posting facts. No CV text, name, employer or title. Written by
      the app (`logApplication` in data.tsx) and by the connector (`mark_applied`); the first snapshot per job stays. Owner-read only;
      people cannot edit what was predicted or the outcome.
- [x] E2. Ask "heard back?" 2-3 weeks later (interview / rejected / nothing), store with the snapshot.
      Done 2026-10-11. `HeardBack` card on Home 14 days after applying (src/components/HeardBack.tsx, logic and tests in
      src/lib/answers-due.ts): Yes an interview / Rejected / No answer (from day 21) / Not yet (asks again in 7 days). An answer moves the
      application's stage; a trigger on `applications` writes the outcome to the snapshot (interview, offer and hired count as interview,
      an interview is never overwritten by a later rejected or no reply, moving back to applied clears it, deleting the application
      deletes the snapshot). The tracker's own stage changes and the connector go through the same trigger.
- [x] E3. Calibration view: predicted vs actual by bucket; feed `learn.py`.
      Done 2026-10-11. SQL view `chance_calibration` (no grant to the app) and `scripts/research/outcomes_report.py` (calibration by bucket
      with 90% Wilson intervals, Brier and log loss against a constant, and `research-data/backtest/outcomes_parts.jsonl` in the
      parts.jsonl format with ds `odds_users`). **Do not retrain from it below 200 answers**; answers are self-reported and people who
      hear back answer sooner, so it checks the model, it does not replace the field experiments. Tested on empty data and on 400 synthetic rows.

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
- 2026-10-11: B done (see B5): dataset cannot calibrate growth (flat cross-section); channel ratio supports an off-site multiplier.
  Next options: D4 (staleness in the chance), panel logging of our own applicant counts, C1 (Deming data), C2 when Kien downloads Kline.
- 2026-10-11 (evening): E1-E3 built and tested end to end (a throwaway guest account: apply via the connector -> snapshot -> stage ->
  outcome, tamper attempts refused, anon refused, the Home card on a 375px phone). Privacy page says what is kept. Nothing to calibrate
  until people use it: run `python3 scripts/research/outcomes_report.py` every few weeks. Remaining in this plan: C1 (Dataverse
  guestbook, Kien), C2 (openICPSR login, Kien), C3, C4 and D2 (need C1/C2).
- 2026-10-11 (data): Deming unzipped and analysed (C1); Swiss test added as an external check (C3b); learn.py re-run with it, no change to
  the multipliers (D2); more sources listed in F. The four openICPSR projects were then downloaded and analysed (C3d, C2); no multiplier changed.
- 2026-10-11 (later): D4 done as above; D1 closed as "no change"; D3 done. C1 is blocked on the Dataverse guestbook (see C1), C2 on
  Kien's openICPSR download. E1 (snapshot when a job is marked Applied) is next.

## F. More data: where it is (searched 2026-10-11)

In hand: GEMM (5 countries, 19,181), Oreopoulos (12,910), Carlsson-Eriksson-Rooth (Sweden), **Deming 2016 (10,484)**, **Swiss test (2,366)**,
LinkedIn postings 2023-24 (pile only). What is left, best first:

| Source | What it adds to the engine | Access |
| --- | --- | --- |
| **In hand (2026-10-11):** Kessler, Low & Sullivan 2019, resume ratings (openICPSR 231422) | GPA, internships, work experience, employer prestige on 2,880 resumes rated by 72 employers: the prestige and internship parts | free openICPSR login |
| **In hand:** Bertrand & Mullainathan 2004 (openICPSR 116023, `lakisha_aer.dta`, 4,870 resumes) | years of experience, education, skills, honours, volunteering, employment gaps | free openICPSR login |
| **In hand:** Eriksson & Rooth 2014 AER (openICPSR 112740) | Sweden: unemployment spells, experience, young applicants | free openICPSR login |
| Kline, Rose & Walters (openICPSR 198284, "A Discrimination Report Card", 83k) | **in hand**: employer spread of callbacks | done |
| Pedulla 2020 (Harvard Dataverse DVN/4TTCEY, 518 KB) | US race, gender, parenthood | guestbook form; low value |
| Baert et al. 2021 internships (Belgium, 1,248 CVs), Nunley et al. (US graduates: unemployment, underemployment, internships), Agan & Starr (15,000), Gaddis (elite colleges, 1,008) | internship and underemployment effects | no public file found: ask the authors |
| Lippens, Vermeiren & Baert 2023 meta-analysis, Baert's register (users.ugent.be/~sbaert/research_register.htm) | effect sizes of ~100 experiments by country and ground, for priors | paper and list only, no data file |
| Thijssen et al. (Dutch tests, A.31, A.55-A.59) | the Dutch rows | the Dutch GEMM rows are already in; the rest by request |

Looked at and rejected: Karachi audit (not relevant), OSF "meta-reanalysis of correspondence experiments" (osf.io/mgc4y: an empty extraction
template), the Swiss employer vignette survey (Zenodo 18683954: attitudes, not callbacks), JobHop and OpenResume (career paths without outcomes),
RecruitView (restricted, forbids use for employment decisions), Kaggle copies of scraped Glassdoor interview reviews (scraped against
Glassdoor's terms). **All four openICPSR projects are downloaded (`research-data/more-data/{231422,116023,112740,198284}`).** Still to get: data where the number of years the ad asks for is recorded (it would settle underqualified and overqualified), and any callback measure of employer prestige and of skills.
