# Engine data plan: calibrate the interview chance on large data

**Handoff file.** Any agent picking this up: read this whole file first, then continue at the first unchecked step in
"Steps". Update "Progress log" and the checkboxes after every step, and commit this file with the work.

Owner: Kien. Repo: odds-beebalst, branch `track-philips-sustainability-internship` (push there; main gets merged later).
Last updated: 2026-10-11 (evening).

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

### G. Second data round (2026-10-11 evening): the downloaded-but-unread files
Script: `scripts/research/more_effects_2.py` (within-vacancy or within-cell linear probability, clustered by cell, put on the probit scale at the
study's base rate). Output: `research-data/more-data/more_effects_2.csv`.
- [x] G1. **GEMM full file, all five countries** (`gemm/GEMM_v3_5.csv`, 18,833 with an outcome): the design also randomised a school grade,
      praise from a former employer and a warmth line, never used before. Overqualified **+0.084 (se 0.028)**: no country negative
      (ES +0.145, DE +0.063, UK +0.047, NL +0.031, NO +0.016). Underqualified **-0.338 (0.070) in NL** but about 0 elsewhere (DE -0.003, ES -0.037,
      NO -0.056, UK -0.094): the engine's value is the Dutch one, which is right for odds. Grade -0.018 (0.019), praise +0.028 (0.019), warmth +0.028 (0.019):
      nothing worth a part. First generation -0.222, second generation -0.218 (0.027).
- [x] G2. **GEMM NL full file** (Thijssen et al., `studies/thijssen-2021-jimi-nl/NL_26112018.dta`, 4,325): first generation -0.310 (0.048) vs the
      engine's nonEu -0.293; **stating Dutch proficiency on an immigrant's letter: +0.008 (0.048), no effect**; communication skills +0.048 (0.043).
- [x] G3. **Phillips 2019** (Washington DC, 2,260, interview within vacancy): +0.073 (0.041) per year of experience up to 5, -0.003 (0.007) per
      year beyond: the engine's "+0.055 per year beyond the ask, cap 3" has the right size and shape.
- [x] G4. **Pan & Zhang 2021** (China, 19,221, within vacancy): top-50 vs 51-100 university +0.123 (0.018); top-5% GPA +0.014 (0.018); each of six
      programming skills listed about 0 (mean +0.000).
- [x] G5. **L'Horty et al. 2023** (France): volunteering +0.052 (0.032), extra-curricular +0.017, a skills line +0.017, indicative only (8,776 of
      12,866 outcomes blank; the candidate's experience barely varies within an ad, so it cannot settle under/overqualified).
- [x] G6. **One number per part from every callback experiment** (`scripts/research/meta_effects.py`, DerSimonian-Laird random effects; ratings
      of hypothetical candidates are listed but kept out of the pool):

      | part | pooled (90% CI) | ships | studies |
      | --- | --- | --- | --- |
      | underqualified | -0.280 [-0.513, -0.046], I2 94% (NL -0.34, elsewhere ~0) | -0.263 x (0.4-1.2) | 3 |
      | overqualified | +0.013 [-0.073, +0.100] | -0.053 | 3 |
      | non-EU / first generation | -0.285 [-0.399, -0.170] | -0.293 | 3 |
      | per year of experience (first few) | +0.044 [+0.022, +0.066], I2 0% | +0.055 | 3 |
      | elite school / employer (callbacks) | +0.072 [+0.008, +0.135] | +0.060 | 3 |
      | skills listed | +0.004 [-0.010, +0.017] | engine's skills part up to +-0.2 | 4 |
      | grades / GPA | -0.001 [-0.028, +0.025] | 0 | 2 |
      | volunteering / extra-curricular | +0.038 [-0.003, +0.079] | 0 | 2 (indicative) |

      **Every shipped value is inside the 90% interval.** The prestige disagreement of section C is settled: the 3.6x larger Kessler number is a rating;
      in callbacks the pooled value is +0.072, the engine ships +0.06. Ratings exaggerate (Kessler GPA +0.44 as a rating, 0 in callbacks).

### H. Is the additive probit leaving anything on the table? (2026-10-11 evening)
- [x] H1. `scripts/research/model_compare.py`: the engine (parts x shipped multipliers) against free coefficients, logistic with every pairwise
      interaction, gradient boosting and a neural network (MLP 32-16, the "deep learning" check), all with the same job-side level per group, on
      47,816 applications (parts.jsonl + Swiss + Eriksson-Rooth + Bertrand-Mullainathan). Output `research-data/backtest/model_compare.csv`.
      **NL held out (nothing Dutch trained on): engine AUC 0.588, log loss 0.6246, slope 0.96 - the best of the five on all three**
      (free 0.583, boosting 0.586, interactions 0.579, MLP 0.575). Leaving each study family out, the engine is best on GEMM, Eriksson-Rooth,
      Oreopoulos and Sweden. The flexible models find one interaction (Oreopoulos: foreign name x big firm) that does not carry to other data.
      **Reading: no deep model is warranted for the strength side;** the data are randomised experiments with a few factors, where an additive
      probit is the right shape. More data per factor helps; more model does not.
- [x] H2. One real fault found: on Bertrand-Mullainathan the engine ranks **backwards** (within-ad AUC 0.495). Cause: the overqualified penalty hits the
      experienced resumes that are called more. Setting the overqualified multiplier to 0: B&M 0.495 -> 0.547, all datasets 0.5692 -> 0.5704,
      **NL 0.5701 -> 0.5694 (-0.0007, noise)**, Spain +0.0015, Germany -0.0016, Swiss -0.004. With G1 (GEMM +0.084) and G6 (pooled +0.013), the
      evidence says the overqualified penalty should go. **Waiting for Kien's decision (it moves every chance with "much more experience than asked").**

### I. The pile when a posting shows no count: tested on our own Dutch postings (2026-10-11 evening)
- [x] I1. `scripts/research/export_pile.ts` exports our 1,203 postings with a LinkedIn applicant count (758 employers) with the engine's own fallback for
      the same posting (`pileFor` tier constant) and posting/employer facts; `scripts/research/pile_model.py` compares guesses with cross-validation
      grouped by employer (no employer in both parts). Target: the count projected to end of life exactly as `projectedApplicants()` does.

      | guess | typical factor off | within x2 | rank (Spearman) | bias |
      | --- | --- | --- | --- | --- |
      | engine fallback (tier constants) | x1.93 | 52% | **0.02** | **x1.4 too high** |
      | one number for every posting | x1.73 | 58% | - | - |
      | employer's other postings (median; the engine's second source) | x1.60 | 64% | 0.38 | ~0 |
      | **ridge on posting and employer facts** | **x1.59** | **70%** | 0.34 | ~0 |
      | gradient boosting / MLP / ridge + title words (TF-IDF) | x1.63 / x1.63 / x1.58 | 67% / 67% / 68% | 0.33 / 0.29 / 0.34 | ~0 |

      **The tier constants do not rank postings at all and run 40% high.** Median projected LinkedIn pile by tier: elite 192 (ships 600), large 129
      (220), mid 138 (150), small 110 (60), unknown 44 or less (180); internships 44, other jobs 133. What moves the pile (ridge): LinkedIn followers,
      an English posting, Entry rather than Internship, Data/AI, the Randstad; less for Sales, IT and small cities. Caveat: LinkedIn counts only
      LinkedIn applications (a floor; B5 puts off-site interest at 60-70% of what LinkedIn counts), so totals may be 1.5-2x these; even so 600 for
      elite is too high and 60 for small too low.
      **Proposal (waiting for Kien):** replace the tier constants with the ridge model (or at least re-fit the constants x a channel factor), and
      re-run the comparison every month as more counts come in.

### K. Engine changes after Kien's review of the persona table (2026-10-11, late; SNAPSHOT_MODEL odds-v2.3-factors-as-ratios)
Kien's objection: a Goldman Sachs IB internship scored almost the same as a Van Oord finance internship (24.1% vs 22.3%), and the spread
from weakest to strongest (0.8% to 40.6%) did not make sense. Checked against the data, then changed (all in src/lib/odds-v2.ts):
- [x] K1. **Top employer in the same line of work** (`eliteSameLine`, +0.15): `prestige` shrank every known name to 0.4 x (learned from
      Oreopoulos' big-firm callbacks). Kessler's recruiters rate a top-firm internship +0.215; Oreopoulos' callbacks for a well-known firm in
      the same occupation are about +0.05. Tried on the Oreopoulos rows held out: +0.06 AUC 0.6854, +0.10 0.6854, **+0.15 0.6873 (best)**,
      +0.215 0.6742 (worse). So +0.15, only for an elite name in the job's own line; other names keep `prestige`.
- [x] K2. **A second internship in the line** +0.127 (Kessler) instead of +0.08.
- [x] K3. **First internship**: a degree in the line of work now counts for 0.74 of a role (was 0.55), so one same-line internship adds +0.09
      to +0.10 probit over the same graduate without it, as Baert et al. 2021 (+12.6% invitations) and Nunley et al. 2016 (+14%) measured.
      Before: x1.97 at odds' typical pile; after: x1.13.
- [x] K4. **Factors keep the studies' ratios at low callback rates** (`factorScale`, POSITION_KEYS): GEMM shows the minority/native ratio holds as
      the base falls (0.75 at 43%, 0.73 at 16%), while one probit step multiplies a low chance far more. Ratio-type parts (origin, Dutch,
      foreign degree, names, second internship, referral, tailored, skills, degree in field) are shrunk, at the person's own position, until a
      small step changes the chance by the ratio it has at a 25% base. Position parts (relevance, years, under/overqualified) are never shrunk, so
      a strong applicant still stands well above a weak one in a mixed pile. No effect at a 25%+ base (all the experiments: GEMM NL unchanged).
- [x] K5. **Referral and tailored letter halved** on the log-odds scale (OR 1.49 -> 1.22, 1.31 -> 1.145): vendor numbers; the one experiment
      (Paths2Include) finds a referral +0.008.
- [x] K6. **Missing years, by level** (Kien: "brutal for senior, lighter below"): senior (5+ years asked) 0.8 + 3 short + 9 short^2 times the
      GEMM step (1.4x one year short of seven, 5.4x with three of seven, 12.8x with none; the one place a single thing may take more than
      three quarters of a chance); mid unchanged (0.4 + 0.8 short); first jobs 0.25 + 0.5 short. Senior Finance Manager asking 7+ years, a
      finance profile: 1y 0.9%, 3y 8.4%, 5y 28.5%, 6y 37.6%, 7y 52%. Mid asking 3: 1y 38.9% vs 3y 48.4%.
- Persona table, Finance Intern, mid company, 150 on LinkedIn (before -> after): weakest 0.8 -> 1.3%; non-EU no experience MSc 6.4 -> 11.2%;
  non-EU one internship 12.6 -> 12.6%; EU basic Dutch 17.6 -> 17.6%; Dutch one internship (Van Oord) 22.3 -> 22.3%; Goldman Sachs IB alone
  24.1 -> 26.9%; Dutch two internships incl. GS 26.6 -> 31.2%; + referral + tailored 40.6 -> 38.3%. GS analyst into Senior Finance Manager
  (7+ asked, has 3): 36.4 -> 6.8%.
- Checks: parts re-exported (5,649 of 34,549 rows changed); held-out within-group AUC GEMM NL 0.5701 -> 0.5701, DE 0.5381 -> 0.5391, NO
  0.5803 -> 0.5813, ES 0.5717 -> 0.5679 (softer first-job shortfall; GEMM ES underqualified is about 0), UK same, Oreopoulos 0.6854 -> 0.6873.
  `bun run check` 956 tests on a clean tree; e2e 9/9 (landing 310.2 kB, budget raised 310 -> 312 for these 0.3 kB). Not done yet: dropping
  the overqualified penalty (H2), the skills span (G6) and the pile model (I1).

### J. Searched, not available (2026-10-11 evening)
- Nunley, Pugh, Romero & Seals 2016 (internships, majors; Labour Economics): no public data. Arellano-Bover, Bussotti, Nunley & Seals (IZA DP 17552;
  majors, minors, extracurriculars, internship type): the IRB requires the firms to stay anonymous, no data. Braun et al. 2026 (arXiv 2604.01933,
  36,880 applications, task content): no data posted. Farber, Silverman & von Wachter (RSF 2017): no openICPSR deposit found by search (the data report
  lists project 113434: check it in the browser with Kien's login). SCP "Foreigners need not apply" (Dutch, extra experience compensates): no dataset
  found. Applicants per posting for the Netherlands: no open source (commercial feeds carry postings, not applicants); our own counts (section I)
  are the best Dutch data there is.

## Decisions so far
- 2026-10-11 (evening), waiting for Kien: (1) drop the overqualified penalty (H2); (2) replace the pile tier constants with the ridge model from our postings (I1); (3) shrink the skills part from +-0.2 to about +-0.06 (G6: listed skills pool to +0.004; a job-relevant combination was +1.4 pp on 14.5% in the earlier search).
- 2026-10-11: posting applicant count is a floor, projected forward (commit 83074ae). Mileway intern: 63% → 22%.
- 2026-10-11: user approved downloading the LinkedIn postings dataset and Kline et al. replication data.
- No LinkedIn scraping without the user explicitly accepting the ToS risk (see report section on legal).

## Progress log
- 2026-10-11 (late): K1-K6 engine changes after Kien's review (see K).
- 2026-10-11 (evening, session "Engine"): G (GEMM 5-country signals, GEMM NL full file, Phillips, Pan & Zhang, L'Horty), G6 meta-analysis, H (engine vs free / interactions / boosting / MLP: the engine wins on NL; the overqualified penalty is the one fault), I (pile model on our 1,203 Dutch counts: the tier constants do not rank and run 40% high; ridge is best), J (sources searched). No engine change made; three proposals wait for Kien.
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

### L. Counts are one site's share (2026-10-11, after Kien's review; SNAPSHOT_MODEL odds-v2.4-other-channels)
- The count a posting shows ("48 applicants", or an employer's average of them) is only who applied through that site. Many apply on the
  employer's page, through other boards or agencies. `pileFor()` now multiplies the projected count by `OTHER_CHANNELS = 2`.
- 2 is an assumption bounded by the report's channel figures (off-site 1.9x, Easy Apply 2.8x as totals) and by B5 (off-site counts about 60-70% of
  Easy Apply per view). It is not measured: the data to measure it is the same posting counted on two sites, which we do not have.
- Effect: every pile read from a count is twice as large, so chances at those jobs fall. Piles with no count (typical by employer size) are unchanged,
  as they already are totals (Greenhouse 183). Persona fixtures were halved so they still describe the piles their names say; ranges unchanged.
- Follow-up, same day: a small count (5 applicants -> pile 11 -> 99% chance) is the most misleading case, since an early read says least. The count-based pile is
  now pulled halfway on the log scale towards the typical pile for the employer's size (`COUNT_WEIGHT = 0.5`, an assumption like the 2). Probe, internship, strong
  applicant: 5 shown -> was 99%, now pulled up to a pile in the tens; the referral and tailored boosts are only +3 to +5 points and were not the cause.
  `startupFinance` persona range lowered 50 -> 35 for the same reason.
- Validation, same day: every live posting (3,324) against 8 personas, with and without a referral and tailored letter: no NaN, p always within FLOOR..CEILING,
  low <= p <= high, a referral never lowers the chance. Medians sit near 1-2% because most postings are in other fields or levels than the persona (as they should);
  99th percentiles 12-39%. Top end: a strong person in a small pile could still be shown 90%+, so `capped()` bends everything above 30% towards `CEILING = 0.65`
  (identity below 30%, monotone, never reached). 0.65 is a judgement: the best-matched CVs in the experiments were called back well under 2 in 3. Snapshot model v2.5.

### M. The pile learned per line of work (2026-10-11, SNAPSHOT_MODEL odds-v2.6-pile-prior)
- Found in our own data: 457 of the 1,144 postings with a LinkedIn reading say "Be among the first 25 applicants" (fewer than 25) and 144 say "Over 200 applicants"
  (at least 200). They were stored as 25 and 200 and used as counts. Only 543 are real counts (min 5, one below 25).
- `scripts/research/export_pile_counts.ts` -> `research-data/pile-prior/counts.csv`; `scripts/research/pile_prior.py` fits a lognormal on the log count with
  interval censoring (lt / exact / gt), mean = intercept + 0.293 log(1+age) + field + level + employer tier, ridge lambda 3 picked by 5-fold cross-validation.
  Held-out log-likelihood -3,638 against -3,808 for one pooled average (hand-set constants cannot beat the pooled one by construction). sigma 1.21.
  Effects (log scale): software +0.64, data +0.59, product +0.33, finance +0.27, risk +0.28, sales -0.39, HR -0.56, customer support -0.47; internship -0.70, mid +0.39;
  elite +0.32, large +0.27, unknown employer -0.78. Written to `src/lib/pile-prior.json`, used by `src/lib/pile-prior.ts`.
- `pileFor()` now: prior at the read age; a bound ("first 25") is the prior cut at the bound (truncated-normal mean); an exact count is pulled towards the prior by
  sigma^2/(sigma^2 + 0.35^2) = 92% on the count (0.35 an assumption); then the old sqrt growth to end of life, times OTHER_CHANNELS = 2. No count at all: the prior itself.
  This replaces the hand-set tier piles (600/220/150/60/180) and the halfway pull (COUNT_WEIGHT) added earlier today. Elite employers keep a floor of 600 (the readings cannot see past 200).
- Caveats: the readings are LinkedIn only and mostly small and mid employers; the age slope is cross-sectional (see B5); the field effects are what LinkedIn shows, not the whole market.
- Next: validate the field ordering against UWV's spanningsindicator (vacancies per short-term WW recipient, 93 occupation groups, dataset on uwv.nl/nl/arbeidsmarktinformatie/datasets;
  needs a manual download) and CBS vacancies by sector (80474ned).
