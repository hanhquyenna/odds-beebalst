# Data report, 2026-10-11: what data we have for the interview-chance engine, where it is, what was done to it

Written for Kien. Companion to `docs/ENGINE_DATA_PLAN.md` (the working plan). Everything below was done on 2026-10-11 on this computer.

**Where things are.** All data is in `/Users/kien/Documents/Files/odds-beebalst/research-data/` (about 460 MB). That folder is **git-ignored**: the
data exists only on this computer. The scripts that read it are committed in `scripts/research/`. A Python environment with pandas, statsmodels,
scikit-learn and Excel readers is in `research-data/.venv`.

**One search was still running when this was written** (the sweep of the audit studies in Baert's register, `more-data/studies/`). Its downloads are
on disk but **not yet reviewed**. The funnel and vacancy-statistics search (`more-data/funnel/`) has finished: section 6 reports it. Figures
from the searching agents are theirs; where I checked something myself I say so.

---

## 1. Summary

- The engine's strength parts were already learned from GEMM (19,181 applications, 5 countries), Oreopoulos (12,910, Canada) and
  Carlsson-Eriksson-Rooth (Sweden language). Today I added **nine more experiments** and checked the engine against them.
- **Result: the engine's numbers hold up.** Years of experience, minority name, foreign degree, host-language level, a second internship and the
  "more qualified than asked" penalty are all within about 1.5 standard errors of what the engine ships, in independent data from Sweden,
  Switzerland, the US and four other European countries.
- **No engine multiplier was changed.** Re-learning with the new data moved some multipliers, but the ones that moved depend on inputs I had to
  assume (how many years each ad asked for), so I kept the shipped values (section 4).
- **Three real disagreements are open** (section 5): employer prestige, referral, and how much same-field experience matters.
- **One correction to my own work:** I first reported that "special skills" on a CV raise callbacks a lot. That was wrong (section 7).
- Separately from the data, I changed the engine in one place (older postings get a lower chance, section 8) and built the outcome loop that will
  let real users' results check the model from now on.

---

## 2. The datasets, one by one

"Rows" are applications (or resumes, or vignettes). "Used" says what I did with it. Paths are under `research-data/`.

### 2.1 Already in hand before today (not touched today, listed for completeness)

| Dataset | Rows | Path | What it is |
| --- | --- | --- | --- |
| GEMM (5 countries: NL, DE, ES, NO, UK) | 19,181 (NL 4,402) | `gemm/GEMM_v3_5.csv` | Correspondence test: origin (Dutch / EU non-native / non-EU), under- / fit / over-qualified, 10 occupations. The engine's origin and qualification effects were learned here. |
| Oreopoulos 2011 (Canada) | 12,910 | `oreopoulos/`, `backtest/oreo.jsonl` | Foreign name, foreign degree, foreign experience, big-firm experience. |
| Carlsson, Eriksson & Rooth (Sweden) | 3,153 | `sweden/`, `backtest/sweden.json` | Host-language level 1 to 4 across 17 occupations. |
| LinkedIn Job Postings 2023-24 | 106,919 read, 22,613 with `applies` | `linkedin-postings/` | Applicants per posting. Cannot calibrate growth (flat cross-section); channel ratio only. |
| Our own postings | 2,529 with a posting date | `posting-life/postings.jsonl` | Exported from our database today to measure how long postings stay up. |

### 2.2 Downloaded today and analysed by me

| Dataset | Rows | Path | Source and access | Licence |
| --- | --- | --- | --- | --- |
| **Deming et al. 2016** (US, school type and degree level) | 10,484 | `deming/data/Postsecondary_Credentials_Replication/DYAGK_audit_data.dta` | Harvard Dataverse DVN/P8ETJ0. Needed a name-and-email guestbook, which I submitted with your details as you asked. | CC0 |
| **Swiss correspondence test** (German-speaking Switzerland 2017-18) | 2,366 | `more-data/swiss/c_DataLong.xls` (+ codebook PDF/XML) | Zenodo 6675500. Open. | CC-BY |
| **Eriksson & Rooth 2014** (Sweden: experience, unemployment, minority name) | 8,466 | `more-data/112740/AER_2012_1097_Data/Dataset_Hiringexperiment.dta` | openICPSR 112740, with your login. | AEA / openICPSR terms |
| **Bertrand & Mullainathan 2004** (US: experience, skills, honours, race name) | 4,870 | `more-data/116023/lakisha_aer.dta` | openICPSR 116023, with your login. | openICPSR terms |
| **Kessler, Low & Sullivan 2019** (US employer ratings 1-10: top employer, internship, GPA) | 2,880 (Penn) + 3,440 (Pitt) | `more-data/231422/data/Data/Raw/IRRData_*.dta` | openICPSR 231422, with your login. | openICPSR terms |
| **Kline, Rose & Walters** (US, 108 large employers: race, gender, age names) | 83,643 | `more-data/198284/replication/data/data.dta` (17 MB) | openICPSR 198284, with your login. | CC-BY-NC |
| **Paths2Include** (recruiter vignettes: Germany, Norway, Poland, Romania) | 15,036 | `more-data/sweep/paths2include-osf/hiring_discrimination_dataset.dta` | OSF 74q69. Open. Found by a background search. | not stated in the metadata I read |
| **Karachi IT resume audit** (Pakistan) | 2,032 | `more-data/karachi/` | Harvard Dataverse DVN/DOM4OS. | open |

For the openICPSR downloads I accepted openICPSR's standard terms (do not identify research subjects; cite the data) after reading them, and filled
in the two profile fields it required (Department and Role) with "Other".

### 2.3 Downloaded by the background searches and reported to me; I did **not** analyse these myself

Reported by the searching agents; I checked only that the files exist. Treat the descriptions as theirs.

| Dataset | Rows (as reported) | Path under `more-data/` | What it is, as reported |
| --- | --- | --- | --- |
| Pan & Zhang 2021 (China) | 19,221 resumes | `gaps/pan-zhang-2021/`, `sweep/china-ideology-2021/` | Callback by university tier (top 50 vs 51-100), top-5% vs top-45% GPA rank, major, one skill per CS resume, employer type. Harvard Dataverse CLZZTW, CC0. |
| L'Horty et al. 2023 (France) | about 7,400 vacancy-by-profile rows | `gaps/lhorty-2023-volunteering/` | Seven profiles with volunteering / activities / skills lines against "none". Mendeley Data, CC BY 4.0. |
| Phillips 2019 (Washington DC) | 2,260 | `sweep/phillips-commutes-dc-2019/` | Interview outcome by commute distance, work gap, years of work experience (1.5 to 34). |
| Hollister (Canada) | 3,878 | `sweep/hollister-mobility-canada/` | Callback by job-hopping profile, company size, COVID period. |
| Cowgill (recruiter decisions) | 864 recruiter ratings + 43 MB pairwise file | `sweep/cowgill-delegation-hiring/` | Recruiter interview decisions with candidate elite school, big-company experience, internship. A rating, not a callback. |
| Disability / gender audit | 2,144 | `sweep/disability-gender-osf/` | Wheelchair user vs not, immigrant flag, callback. Low relevance. |
| Swedish parental-leave audit | 960 | `sweep/swedish-parental-leave-zenodo/` | Interview by parental-leave intention. Low relevance. |
| Legislative-internship emails (US) | 21,734 | `sweep/hassell-legislative-internships/` | Email responses to internship requests. Weak relevance. |
| Ruedin vignettes (Switzerland) | 211 + 197 | `sweep/ruedin-vignettes-hiring/` | Small survey experiment on origin. |
| Veteran resume, referrer-gender, outsiders conjoint | small | `sweep/` | Low relevance. |
| Zschirnt & Ruedin 2016 meta-analysis data | 781 study-level rows | `sweep/zschirnt-ruedin-meta/` | Majority vs minority invitation counts by study; **study level, not applications**. |
| Studies folder | 22 folders | `studies/` | GEMM OSF copy, Agan & Starr, Gaddis, Pedulla, Quillian-Lee six-country meta, Thijssen Dutch tests, Carlsson 2025, and more. **Search still running; not reviewed.** |
| Funnel folder | 62 files, 93 MB | `funnel/` | CBS, Eurostat, Nuffic, HBO-Monitor, Ashby, Indeed Hiring Lab, JOLTS (UWV and IND blocked). Reported in section 6. |

---

## 3. What I did to the data

1. **Posting survival** (our own 2,529 postings). Kaplan-Meier with delayed entry, because we only started watching on 2026-09-30 and ignoring that
   makes old postings look longer-lived. Script: `scripts/research/posting_survival.py`. Output: `posting-life/survival.json`.
2. **Deming** (10,484): job-fixed-effects linear probability, errors clustered by job, as in the authors' do-file. Script:
   `scripts/research/deming_effects.py`.
3. **Swiss test** (2,366): ran every application through the engine (`scripts/research/export_swiss.ts` builds a profile and a posting for each row and
   records the engine's score per part), then compared. Script: `scripts/research/swiss_check.py`. Nothing was trained on it.
4. **Eriksson-Rooth, Bertrand-Mullainathan, Kessler, Kline, Paths2Include**: estimated the effect of each factor the engine has a part for, in probit units
   (the same scale as the engine's strength), and printed it next to what the engine ships. Script: `scripts/research/new_data_effects.py`.
   Callbacks use probit; Kessler and Paths2Include are 1-10 ratings, so they use ordered probit.
5. **Re-learning the multipliers** (`research-data/backtest/learn.py`, the same loop used to build the shipped multipliers). Three runs: the original data
   (reproduced the shipped multipliers exactly), plus Swiss, plus Swiss + Eriksson-Rooth + Bertrand-Mullainathan (white names). For the last two,
   `scripts/research/export_swiss.ts` and `export_more.ts` produce the engine's parts per row. Held-out Dutch results (GEMM NL) were compared each time.
   I made small local edits to `learn.py` (a `PARTS` environment variable and ceiling specs for the new datasets); it lives in the git-ignored folder.
   **I restored the shipped `learned_multipliers.json` and the other output files after each run.**
6. **Nothing was copied out of this computer.**

---

## 4. Findings: the engine against the new data

Units: probit units, the engine's own scale (a step of 0.1 moves a 10% chance to about 11.5%). "Ships" is the engine's value after its learned multiplier.

| Part | Data says | Engine ships | Source and size |
| --- | --- | --- | --- |
| Extra years of experience, per year beyond 2 (cap 3) | +0.039 (se 0.015) | +0.055 | Eriksson-Rooth, 8,466 callbacks |
| | +0.83 percentage points within an ad (se 0.60); engine implies +0.8 | | Bertrand-Mullainathan, 4,870 |
| Minority / non-EU name | -0.378 (0.034) | -0.293 | Eriksson-Rooth |
| | -0.336 Ukrainian, -0.425 other ethnic group | | Paths2Include, 15,036 ratings |
| | -0.17 (0.03), engine -0.29 | | Swiss, 2,366 |
| Degree from outside the host country | -0.075 (0.020) | -0.043 | Paths2Include |
| Host-language B2 instead of C2 | -0.105 (0.020) | -0.170 (dutchBasic) | Paths2Include |
| More education / experience than asked | -0.009 (0.036) | -0.053 | Eriksson-Rooth |
| | -0.22 (0.15), engine -0.98 | | Swiss, 186 rows only |
| A second internship | +0.127 (0.032) | +0.079 | Kessler (rating) |
| School standing | selective vs non-selective public school: x0.98 [0.70, 1.26], no effect | prestige multiplier 0.40 | Deming |
| Associate's degree (a degree above the minimum) | +0.009 (0.011) | degreeInField +0.085 | Kline |
| Whole strength scale on never-seen data | probit slope **0.66** (se 0.12); within-job AUC 0.554 (GEMM NL 0.57) | 1.0 would be exact | Swiss: the engine's spread is about 1.5x too wide there |

**Re-learning outcome.** With Swiss + Eriksson-Rooth + Bertrand-Mullainathan the learner moved: years 0.69 to 0.55, overqualified 0.63 to 0.43,
underqualified 0.67 to 0.57, EU-non-native 1.51 to 1.93, Dutch language 0.81 to 1.06, non-EU 1.19 to 1.23. Held-out Dutch results hardly moved
(AUC 0.5689 to 0.5706, log loss 0.6239 to 0.6229, both well inside noise); Eriksson-Rooth test AUC 0.568 to 0.577; Swiss 0.527 to 0.521.
**Not adopted**, because years / underqualified / overqualified depend on how many years each ad asked for, which none of these datasets recorded
(I assumed 2), and EU-non-native depends on my guess that German and French names signal "EU non-native". The only clean number, non-EU, moved
by 0.04.

---

## 5. Three real disagreements, not resolved

1. **Employer prestige.** Kessler finds a top employer on the first job worth +0.215; the engine ships +0.06. But Kessler measures a would-hire
   rating on hypothetical resumes. The background search found callback evidence (Oreopoulos "very large firm" +0.046, +0.079 for foreign names;
   Gaddis elite vs less selective university about +0.32 on a 1,904-resume US audit; Pan & Zhang +0.12 for a top-50 university in China; Mihut, Nunley
   and Oreopoulos finding about 0 for ordinary rank differences). Reading from that search: a clearly elite name helps, ordinary prestige does not.
2. **Referral.** The engine ships +0.247 (from Ashby's 52% vs 35% screen pass). In Paths2Include a referral changes the recruiter's rating by
   +0.008 (se 0.017): nothing. Ashby is vendor and observational; Paths2Include is a rating of hypothetical candidates. Worth a real test.
3. **How much same-field experience matters.** The engine's relevance part spans about 1.4 probit units between a same-line role and an unrelated one,
   and the multiplier is **not identified** by the data it was learned on (every GEMM row has the same relevance, so it is absorbed by the
   occupation intercepts). Evidence today: two years of unrelated experience instead of similar costs -0.251 (Paths2Include rating); a callback study the
   search found (Mihut, 2,400 applications) has a high skills match at 19.1% against 3.9%, about 0.9 probit. So the true span looks closer to
   0.3 to 0.9 than 1.4. This is the largest open question because it moves every chance on the site.

---

## 6. Funnel and vacancy statistics (search finished; reported by the agent, files not yet opened by me)

**Headline: nothing open gives applicants per posting or an interview rate for the Netherlands.** What exists, in `more-data/funnel/` (93 MB):

- **CBS StatLine** (`cbs/`, 20+ tables via the OData API): open vacancies 374.8k and new vacancies 354.5k per quarter in 2026 Q2, so an open vacancy
  lasts about 95 days on average (agent's own derivation: stock / flow); 396k unemployed (about 0.95 vacancies per unemployed; agent's derivation);
  vacancies by sector, region and occupation back to 2011/2018; unemployment by duration; labour-market position of higher-education leavers
  2006/07 to 2023/24; international students by nationality; residence permits by basis for stay. Job-search duration of school leavers only for
  1991-2001 (7.0 months in 1991, 4.7 in 2001).
- **Nuffic stay rates** (`nuffic/`, report PDF): 42.1% of international graduates are still in the Netherlands one year after graduating and 25.3% after five
  years (30,020 people, cohorts 2013-14 to 2018-19); of those who stay, 41.8% have a paid job after one year and 79.6% after five (Dutch graduates 64.9% and
  89.6%).
- **HBO-Monitor 2024 and 2025** (`hbo_monitor/`): 83% of university-of-applied-sciences graduates find a job directly; 92% of bachelor graduates did an
  internship and **19% of them had to apply more than four times for it** (27% in technical sciences). Useful as the one Dutch number on how many
  internship applications it takes.
- **Ashby** (`ashby/`, 13M applications, mostly US tech, Jan 2021 to Apr 2023): weekly inbound applications per job rose from 13 to 42 (business)
  and 13 to 36 (technical) between 2021 and 2023; the first week gets 2 to 3 times the weekly volume of later weeks. US, direct applications only.
- **Eurostat** (`eurostat/`): Dutch job-vacancy rate 3.9% in 2025 Q4 (365,600 vacancies); unemployment by duration; recent-graduate employment 92.7%.
- **Indeed Hiring Lab, Netherlands** (`indeed_hiringlab/`, CC-BY 4.0): daily postings index 2020 to 2026-10-02 (latest new-postings index 91 against 100 in Feb 2020).
- **US JOLTS** (`jolts/`): context only.
- **Blocked:** UWV datasets (interactive builder, no files), IND register (web lookup only), Eurograduate (order form), WO-monitor microdata,
  Kaggle (login). **Rejected:** synthetic hiring-pipeline sets (Hugging Face, Kaggle), scraped job-board copies, Djinni (no applicant counts).
- **Greenhouse's "228 applications per posting"** came from a news article only; not verified.

**What this means for the model.** The strength half of the engine now rests on about 150,000 experimental applications. The *pile* half
(applicants per posting, interview slots) still rests on assumptions plus US vendor figures (Ashby, Greenhouse); no open Dutch source exists. The
one thing the Dutch data does give is a sanity check on posting life: CBS's 95-day average open vacancy sits closer to the *no-sweep* reading of our
own postings (median 84 days) than to the 31-day one, which is why the older-posting discount uses the middle of the two. Our own outcome loop
(section 8) is the only path to real Dutch interview rates.

---

## 7. A correction to my own earlier result

I first reported that "special skills" on a Bertrand-Mullainathan resume raised callbacks by +0.41 probit units, twice the engine's assumed span.
That came from a regression without ad fixed effects. In that experiment the high-quality resumes were sent to different ads than the low-quality
ones, so comparing across ads is confounded. Within the same ad (the comparison that counts): special skills +0.65 percentage points (se 1.31),
computer skills -0.19 (1.32), honours +1.88 (2.28): no effect. The experience effect (+0.83 pp) is unchanged. The script and the plan are corrected
(commit c2e1b4d); the plan notes the correction. The same background search found the same pattern in other experiments: listed skills are near zero
or small in callbacks, with the exception of job-relevant combinations such as programming plus data analysis (+1.4 pp on a 14.5% base) and
language quality in the written application (+7 pp from the lowest to the highest level, Sweden).

---

## 8. What changed in the product (separate from the data work)

- **Older postings get a lower chance** (`stillReviewing()` in `src/lib/odds-v2.ts`): up to 14 days, nothing; then 0.82 at 21 days, 0.75 at 28, 0.55 at 35,
  0.47 at 56, 0.33 at 84. Postings with a closing date still ahead get no discount (81% of the older English postings). The curve is the middle of two
  readings of when our checker saw postings close (62% still open at 28 days counting every close, 87% leaving out three days when the checker
  swept many old postings at once), so it is an estimate, not a measurement. It re-fits once the checker has run for months.
- **Outcome loop:** when someone marks a job applied we keep the chance shown and what it was worked out from (no CV text, no names); 14 days later
  Home asks "did you hear back?"; the answer feeds `scripts/research/outcomes_report.py`, which compares predicted with actual. This is the only data
  source that will ever measure the *Dutch internship* case directly. Nothing to calibrate yet.
- **Nothing else in the engine changed.** `learned_multipliers.json` and the constants in `odds-v2.ts` are as they were this morning, except the
  older-posting factor.

---

## 9. Blocked, rejected, not found

- **Needs a form with personal details, not done:** Behaghel et al. (guestbook), Pedulla 2020 (guestbook; the file is in `studies/pedulla-2020`
  per the search, unreviewed), the Dutch "Human Resources, Hiring and Discrimination" survey on DANS (guestbook flag, CC-BY-NC-ND).
- **Needs an openICPSR login, not opened by the agents:** Farber, Silverman & von Wachter (unemployed workers, ads' required experience recorded;
  project 113434) and Neumark, Burn & Button (age; 113433). You have the login: these are worth downloading next because Farber records the
  experience the ad asks for.
- **No public data found:** Gaddis (data), Mihut, Nunley, Baert's internship and volunteering studies, Agan & Starr (a folder exists in `studies/`; not checked),
  Kroft-Lange-Notowidigdo.
- **Rejected:** scraped Glassdoor/Indeed copies (against terms), RecruitView (forbids use for employment decisions), career-trajectory sets without
  outcomes (JobHop, OpenResume), the OSF "meta-reanalysis" (an empty template), Karachi (not relevant, kept but unused).
- **Not searched (blocked):** GESIS, Mendeley (partly), UK Data Service catalogue, GitHub (rate limit).

---

## 10. Where everything is, at a glance

```
research-data/                       (git-ignored, this computer only, about 460 MB)
  deming/ ............. Deming 2016 zip and data (10,484)
  gemm/ oreopoulos/ sweden/ ......... the original three datasets
  linkedin-postings/ ................ LinkedIn postings 2023-24 (pile only)
  posting-life/ ..................... our 2,529 postings and the survival curve
  backtest/ ......................... the learn-and-validate loop, parts.jsonl, shipped multipliers (restored)
  more-data/
    swiss/ karachi/ ................ Swiss test (2,366), Karachi (unused)
    112740/ 116023/ 231422/ 198284/ . Eriksson-Rooth, Bertrand-Mullainathan, Kessler, Kline (openICPSR)
    er_rows.json bm_rows.json swiss_rows.json, *_parts.jsonl .... engine parts per row
    sweep/ ......................... 13 datasets from the repository sweep (Paths2Include, Pan & Zhang copy, Phillips, Hollister, Cowgill, ...)
    gaps/ .......................... Pan & Zhang 2021, L'Horty 2023, and the analysis outputs of the prestige/skills search
    studies/ ....................... 22 folders from the Baert-register sweep (still running, unreviewed)
    funnel/ ........................ CBS, Eurostat, Nuffic, HBO-Monitor, Ashby, Indeed, JOLTS
scripts/research/ ................... (committed) posting_survival.py deming_effects.py swiss_check.py new_data_effects.py outcomes_report.py export_swiss.ts export_more.ts
docs/ENGINE_DATA_PLAN.md ........... the working plan; docs/DATA_REPORT_2026-10-11.md is this file
```

---

## 11. How to reproduce or extend

```
research-data/.venv/bin/python scripts/research/new_data_effects.py   # effects next to the engine, 6 datasets
research-data/.venv/bin/python scripts/research/swiss_check.py         # external check on the Swiss test
research-data/.venv/bin/python scripts/research/deming_effects.py
research-data/.venv/bin/python scripts/research/posting_survival.py 2026-10-11
research-data/.venv/bin/python scripts/research/outcomes_report.py     # once users answer "did you hear back?"
bun scripts/research/export_swiss.ts ; bun scripts/research/export_more.ts   # engine parts per row, for learn.py
```

Next steps that would settle the open questions: download Farber et al. (113434) from openICPSR; find any callback experiment that varies the
relevance of past experience within an ad; and let the outcome loop run.
