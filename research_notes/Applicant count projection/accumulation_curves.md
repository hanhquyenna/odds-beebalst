# Accumulation curves: how applications build up after a job posting goes live

Scope note: the app's current model is final = count x sqrt(L / t) with L = 28 days, which treats cumulative applications as F(t) = sqrt(t / L), a power law with exponent 0.5. In the notes below, a model "matches" a source when its implied shares land near the source's reported shares. All arithmetic marked (calc) is mine, done on the cited numbers. Nothing marked (calc) is a published statistic.

## 1. What share of applications arrive by day 1, 3, 7, 14 and 30? Is there a half-life?

### Takeaway
The only rigorous posting-level dataset is Davis and Samaniego de la Parra's Dice.com data: 125M applications, US tech jobs, 2012-2017. It shows about 45% of applications within 48 hours and about 60% within 96 hours. Its daily rate per live posting drops from about 2.4 on day 2 to about 1.0 a day afterwards. Ashby's ATS data (13-14M applications, 2021-2024) shows week 1 at 2-3x each later week, then a "steady state". No source publishes a half-life or a fitted curve. Both datasets are consistent with a power law F(t) = (t/L)^a with a between about 0.4 and 0.6, so the square-root shape is defensible. The right L depends on how long postings actually stay live.

### Cited Findings
**Primary academic source: Davis and Samaniego de la Parra, "Application Flows" (NBER WP 32320, April 2024, revised Dec 2025; data Jan 2012 to Dec 2017, Dice.com, US)**
- Dataset: 7.5M raw vacancy postings (5.6M "standard"), 125.3M applications. 77.4M of those applications went to Recruitment & Staffing firms and 47.9M to Direct Hire clients (Table 6). — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- "45 percent of applications flow to vacancies posted within the previous 48 hours, and 60 percent go to those posted in the previous 96 hours. Older postings attract relatively few applications." The same holds separately for Direct Hire and for staffing-firm postings (Appendix Fig. C.1). — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Table 5, all standard postings: 45.3% of applications within the first 48h and 59.9% within 96h. Mean applications per posting are 11.0 equal-weighted and 88.1 flow-weighted. — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Mean daily applications per posting by posting age (Fig. 3): "2.1 applications in their first day online and 2.4 applications on their second day... Afterwards, the application flow rate drops sharply to 1.0 per day and even fewer as postings age further." Day 0 is often a partial day. — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Posting lives are short. The median completed posting lasts 7.0 days and the mean 9.4 days. Percentiles: p10 1.0, p25 2.9, p75 14.0, p90 22.7 days. "Half of all standard postings last one week or less... Only 26 percent stay active for more than two weeks." The modal duration is 24-48h (Table 4). — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Typical pattern, covering about 75% of postings: "a large majority of applications arrive within the first week or two after posting, and the client permanently removes the posting within 30 days." — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Earlier versions report slightly different numbers. The 2017 draft has 41% within 48h and 56% within 96h on about 80M applications. — [St. Louis Fed, 2018](https://www.stlouisfed.org/on-the-economy/2018/april/how-quickly-people-apply-jobs). The UChicago summary has 39% and 54% on 66M applications and 8M postings, with an average application window of "nine days" in tech-oriented sectors. — [UChicago News, 31 Aug 2017](https://news.uchicago.edu/story/looking-job-you-may-have-only-nine-days-apply)
- A 2023 arXiv paper using Dice and Glassdoor data says postings get 75% of their applications in the first 7 days, citing Davis and Samaniego de la Parra (2017). It uses this to justify keeping only each posting's first 7 days of data. This is secondary; the 7-day figure does not appear in the NBER text I read. — [arXiv 2305.02587](https://arxiv.org/pdf/2305.02587)

**ATS vendor data: Ashby 2023 Applications Per Job report (vendor report, but large n). Covers 13M applications, Jan 2021 to Apr 2023, mostly US tech companies with 1-1,500 employees. A Feb 2024 update covers about 14M applications, Jan 2021 to Jan 2024.**
- The first week is "consistently 2-2.5x higher than following weeks." The section heading says "2.5-3x higher than all following weeks", so the report is internally inconsistent. The curve has "a strong peak in the first week," then "a sharp decline," then "a steady state." Ashby recommends using the weeks 2-4 average to forecast future volume. — [Ashby 2023 Trends Report](https://www.ashbyhq.com/talent-trends-report/reports/2023-trends-report-applications-per-job)
- Average applications in a job's first 4 weeks: business roles 57 (2021) to 202 (2023); technical roles 60 to 174. — [Ashby 2023 Trends Report](https://www.ashbyhq.com/talent-trends-report/reports/2023-trends-report-applications-per-job)

**Other vendor and industry claims (weaker; treat as marketing)**
- HireHive (an ATS that sponsors jobs on Indeed): "approximately 90% of the total number of applicants will apply for a role within the first 5 days," based on its customers' data. It says postings get pushed to pages 3-4 of listings by day 3. No n or date given. — [HireHive](https://hirehive.com/indeed-job-sponsoring/)
- Appcast economists (webinar): "over 50% of applications are submitted within the first ten days." No methodology given. — [Appcast webinar recap](https://www.appcast.io/job-market-trends-for-recruiters/)
- A LinkedIn engineering paper says postings in LinkedIn's repository have "an average lifespan of ~3 weeks." — [LinkSAGE, arXiv 2402.13430](https://arxiv.org/html/2402.13430v1)

### Inferences
- (calc) Fit to the Dice numbers. Fitting F(t) = (t/L)^a through F(2d)=0.45 and F(7d)=0.75 gives a = ln(0.75/0.45)/ln(3.5) ≈ 0.41 and L ≈ 14 days. This fit predicts F(4d) = (4/14)^0.41 ≈ 0.60, which matches the reported 59.9% almost exactly. So on Dice, cumulative applications follow a power law with exponent about 0.4 over an effective life of about 2 weeks. That is close to sqrt in shape but with a shorter life. The 75%-at-7-days point is secondary, so the fit carries that uncertainty.
- (calc) Using only the two primary points (45.3% at 2d, 59.9% at 4d), a = ln(59.9/45.3)/ln 2 ≈ 0.40. The same exponent comes out without the secondary point.
- (calc) Fit to Ashby. With L = 28 days, the power law's week-1 to weeks-2-4-average ratio is about 3.9x at a = 0.41, 3.0x at a = 0.5 (sqrt) and 2.3x at a = 0.6. Ashby's 2-3x therefore implies a ≈ 0.5-0.65 for 4-week postings at startups and scale-ups. The app's sqrt sits at the front-loaded edge of that range. Sqrt's weekly shares are 50% / 20.7% / 15.9% / 13.4%. Ashby describes weeks 2-4 as a "steady state", which is flatter than sqrt.
- (calc) The data reject pure exponential decay. An exponential fitted to Dice's 45% at 2d implies a half-life of about 2 days and 99% by day 14, so it leaves no tail. That contradicts both Dice's ongoing ~1/day trickle per live posting and Ashby's flat weeks 2-4. A burst plus constant baseline fits Ashby better: F(t) = B(1 - e^(-t/τ)) + (1 - B)(t/L). Calibrated to Ashby with week 1 = 2.5x baseline, B ≈ 0.27 of the total, τ ≈ 2 days and L = 28. That calibration gives F(1d) ≈ 0.13, F(3d) ≈ 0.29, F(7d) ≈ 0.44, F(14d) ≈ 0.64, F(21d) ≈ 0.82.
- (calc) Projection multipliers final/count for each model:

| read at day t | sqrt, L=28 (current) | power a=0.41, L=14 (Dice fit) | burst+baseline (Ashby fit, L=28) |
|---|---|---|---|
| 1 | 5.29x | 2.95x | ~7.6x |
| 2 | 3.74x | 2.22x | ~4.5x |
| 3 | 3.06x | 1.88x | ~3.5x |
| 7 | 2.00x | 1.33x | ~2.25x |
| 14 | 1.41x | 1.00x | ~1.57x |
| 21 | 1.15x | 1.00x | ~1.22x |

  The biggest modeling decision is L, the real posting life, not the exponent. Dice-like short-lived postings warrant much smaller multipliers than the current model gives. Long-lived ATS postings (Ashby-like) warrant about the same multipliers or larger.
- Per-active-posting daily rate (Dice Fig. 3): about 2.4 on day 1 falling to about 1.0 within a few days, then decaying slowly. The rate ratio between day 1 and days 3-7 is about 2-2.5x. Under t^(-0.5) the instantaneous rate at day 1.5 is 2x the rate at day 6, which is consistent with a ~0.5 exponent.

### Gaps
- No source publishes a fitted functional form, half-life or day-by-day cumulative curve beyond 96 hours from primary data. The Dice Fig. 2/3 bar values are only in the chart, and the PDF text did not include them.
- No public LinkedIn or Indeed (Hiring Lab) posting-age curve was found. Every "LinkedIn says apply in the first 24h / 44h" claim traced back to unsourced career blogs, so none were used.
- No primary data on day-30 share for postings that actually stay up 30 days.

## 2. Does the curve differ by role level, brand size, remote vs on-site, or Easy Apply vs external apply?

### Takeaway
The only rigorous heterogeneity evidence is from Dice. High-volume job titles are more front-loaded (about 50% within 48h) than low-volume ones (about 33%). Specialist engineering and sales roles are slow. Employer size shows no clear effect in Dice or Ashby. I found no posting-age curve for internships or entry-level roles, for remote vs on-site, or for Easy Apply vs external apply.

### Cited Findings
- Dice Table 5, share of applications within 48h / 96h by job-title quintile of mean applications per posting:

| quintile | apps per posting | within 48h | within 96h |
|---|---|---|---|
| top | 22.3 | 49.8% | 64.0% |
| 2nd | 10.8 | 44.8% | 59.7% |
| 3rd | 7.4 | 38.6% | 53.7% |
| 4th | 5.4 | 38.1% | 52.9% |
| bottom | 3.4 | 32.9% | 48.3% |

  — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Dice Table 5 by job function, 48h / 96h: Developer 49.9 / 64.2; Business Analyst 49.5 / 63.1; Administrator 45.3 / 60.2; Engineer 40.9 / 55.7; Analyst 39.5 / 54.4; Help Desk 29.7 / 45.4; Sales/BD 28.5 / 43.6; Mechanical Engineer 26.0 / 41.1; Electrical Engineer 24.4 / 40.6. — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Dice found no simple relationship between employer size and applicant pool size. "The largest employers draw the smallest applicant pools," and firms with 5-9 employees draw the most per vacancy (Appendix C.2). — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Ashby found no "significant differences" by company size. It says the first-week spike "holds across job categories by year," and it did not analyze seniority or remote status. — [Ashby 2023 Trends Report](https://www.ashbyhq.com/talent-trends-report/reports/2023-trends-report-applications-per-job)
- Dice job seekers apply in bursts. In 63% of search spells the seeker submits all their applications within the first 48 hours, and half of all applications come from spells less than 2 weeks old. — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Dice day-of-week and seasonal effects (2017 version): applications per posting are about 45% higher on Mon/Tue than on Friday and 4x higher than on Saturday. They fall 30% in December vs October and rise 60% in January. — [UChicago News, 2017](https://news.uchicago.edu/story/looking-job-you-may-have-only-nine-days-apply)
- Easy Apply vs external: LinkedIn marketing claims Easy Apply can capture "2x as many applicants" (vendor claim). — [LinkedIn Business](https://business.linkedin.com/talent-solutions/product-update/recruiting-and-candidate-search-tool/workable/easy-apply). LinkedIn's displayed count for external-apply jobs is widely reported to count Apply clicks rather than completed applications (blog and recruiter claims, unverified). — [Hiration](https://www.hiration.com/blog/over-100-applicants/)
- Displaying the count changes behavior. A LinkedIn field experiment (2.3M users, 16 days in March 2012) showed some users the number of applicants. Those users were 3.5% more likely to finish an application, with a larger effect for women. — [Gee, Management Science 2019 / IZA DP 10372](https://docs.iza.org/dp10372.pdf); [Tufts Now, 2018](https://now.tufts.edu/2018/04/23/telling-job-seekers-how-many-other-people-have-applied-increases-applications-could)

### Inferences
- (calc) Per-quintile power-law exponent from the 48h to 96h step, a = ln(F96/F48)/ln 2: top quintile ≈ 0.36, 2nd ≈ 0.41, 3rd ≈ 0.48, 4th ≈ 0.47, bottom ≈ 0.55. Popular, high-volume postings are more front-loaded, with a lower exponent. Big-brand internships and graduate roles likely behave like the top quintile because they get heavy alert and search traffic early. Under that assumption a sqrt model would over-project them when read early. Low-traffic niche roles (specialist engineering, sales) are close to sqrt or flatter. This is extrapolated from US tech data, not measured on internships.
- One adjustment the data support: let the exponent depend on volume, roughly 0.35-0.4 for high-volume postings and 0.5-0.55 for low-volume ones.
- External-apply counts on LinkedIn likely inflate the level (clicks rather than applications) but not necessarily the shape. No evidence was found on whether click-based counts accumulate on a different curve.

### Gaps
- No posting-age curve for internships, graduate or entry-level roles, or for remote vs on-site postings, from any source.
- No independent data on Easy Apply vs external-apply accumulation timing.

## 3. What is the empirical decay shape, and are there fitted parameters?

### Takeaway
No source publishes fitted parameters. The two quantitative datasets fit a power law with exponent about 0.4 (Dice) to 0.5-0.65 (Ashby) far better than a single exponential. A front burst plus near-constant baseline is also consistent with Ashby's "peak, sharp decline, steady state" description.

### Cited Findings
- Ashby describes the shape qualitatively: "a strong peak in the first week," then "a sharp decline," then "a steady state." — [Ashby 2023 Trends Report](https://www.ashbyhq.com/talent-trends-report/reports/2023-trends-report-applications-per-job)
- Dice reports a daily per-posting rate of about 2.1 on day 0 and 2.4 on day 1, then "drops sharply to 1.0 per day and even fewer as postings age further." — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- Dice also finds completed posting duration rises with application volume. Postings with 0 applications have a median life of 4.0 days; postings with 20+ applications have a median of 10.0 days (Table 4). — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- A US patent on job-post rotation describes rotating a job once it has about 100 applications or has been open about 25 days. This is design practice, not evidence. — [USPTO 11010720](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11010720)

### Inferences
- Recommended forms, in order:
  1. Power law F(t) = min(1, (t/L)^a). Use a ≈ 0.4-0.5, L = expected posting life, and a lower a for high-volume postings.
  2. Burst plus baseline, F(t) = B(1 - e^(-t/τ)) + (1 - B)·t/L, with τ ≈ 1.5-2 days and B ≈ 0.25-0.45. Use this when postings stay up a long time with steady trickle.
  3. Exponential with a single half-life is not supported.
- The sqrt form is a reasonable central estimate of shape. The larger error source is L = 28. Dice's median life is 7 days, its mean 9.4 and its p75 14. Ashby forecasts over 4 weeks. LinkedIn's average lifespan is about 3 weeks. If the app can observe when a posting closes or estimate it per source, it should use that L.
- Survivor bias: Dice's 45%/60% shares are partly front-loaded because many postings close within days. For a posting known to stay open about 28 days, the Ashby-calibrated shapes are more relevant.
- (calc) Because posting life rises with volume, popular postings are both more front-loaded and longer-lived. These effects pull the multiplier in opposite directions.

### Gaps
- No published curve fit, so parameter ranges here are my back-of-envelope fits to 2-3 published points.

## 4. Does reposting, refreshing or "promoted" status reset the curve?

### Takeaway
No quantitative study measures a curve reset from reposting, refreshing or promotion. The evidence is mechanism-level: freshness drives visibility, Dice postings often have offline/online spells, and LinkedIn reposts reportedly carry the old count forward (anecdotal).

### Cited Findings
- Many Dice vacancies are posted, taken offline for hours or days, and made visible again. Posting age measured net of offline spells gives similar results (median 6.9 vs 7.0 days). — [NBER w32320](https://www.nber.org/system/files/working_papers/w32320/w32320.pdf)
- HireHive says listings fall to pages 3-4 by about day 3 and sells sponsored (paid) Indeed jobs to counter it (vendor claim). — [HireHive](https://hirehive.com/indeed-job-sponsoring/)
- Appcast economists advise keeping postings "fresh" because most applications arrive early (vendor advice, no data). — [Appcast](https://www.appcast.io/job-market-trends-for-recruiters/)
- Blog and forum claims say LinkedIn reposts carry their old applicant count along (unverified). — [Hiration](https://www.hiration.com/blog/over-100-applicants/); [Blind thread](https://www.teamblind.com/post/huge-number-of-applicants-on-linkedin-ieu8xfpz)
- The German IAB Job Vacancy Survey puts the share of reposted vacancies at 0.56, used as a calibration target in Mercan and Schoefer. This concerns vacancy reposting, not applications. — [Mercan & Schoefer, AER: Insights 2020](https://eml.berkeley.edu/~schoefer/schoefer_files/Replacement_Hiring_Mercan_Schoefer_May2019.pdf)

### Inferences
- If a repost shows a fresh "posted X days ago" date but keeps the old count, the app will read a large count at small t and over-project badly. Two guards help: cap projections (for example, final ≤ count × a maximum multiplier), and use the first-seen date where the app has tracked the posting.
- Promotion or sponsorship likely adds a second burst. A plausible model is a new burst term starting at the promotion date. No data quantifies it.

### Gaps
- No data on the size of a refresh or promotion bump on Indeed, LinkedIn or company career sites.

## 5. Netherlands / Europe-specific data

### Takeaway
I found no Netherlands or European source that reports applications by days since posting. European online-job-ad research (Cedefop/Eurostat) covers vacancy counts, not application timing.

### Cited Findings
- Eurostat and Cedefop online-job-ad work focuses on inferring vacancy counts and discusses coverage and representativeness problems. It has no application-flow data. — [Eurostat 2020](https://ec.europa.eu/eurostat/documents/3888793/12287170/KS-TC-20-008-EN-N.pdf/6a86d53e-d0b8-d608-988d-d91f0cef6c21?t=1611673495829)
- RF Berlin (Germany) studies how age limits in job ads shift who applies, not when. — [RF Berlin](https://www.rfberlin.com/research-insights/too-old-to-apply-for-a-job/)
- Chile (Trabajando.com, Banfi and Villena-Roldán, JOLE 2019) is the main non-US job-board study. A secondary citation says unemployed seekers dislike older ads (age measured in weeks), but I did not verify exact estimates in the original. — [MPRA 91756](https://mpra.ub.uni-muenchen.de/91756/1/MPRA_paper_91756.pdf)

### Inferences
- With no European data, US curves have to serve as the prior. NL internship postings on LinkedIn and Indeed use the same freshness-ranked feeds and alerts, so the mechanism should carry over. Dutch internships are often posted months ahead with fixed start dates, which could lengthen L. This is a hypothesis, not data.
- The best NL-specific evidence would be the app's own repeated reads of the same postings, which would let it fit a and L per source.

### Gaps
- No NL or EU data from Indeed Hiring Lab NL, LinkedIn Economic Graph NL, Nationale Vacaturebank, Werkzoeken.nl, StepStone or Textkernel/Jobdigger on application timing.
- Searches for Greenhouse, Lever, Workable, SmartRecruiters, TalentLyft, Recruitics, Joveo, Textio and Gem timing curves returned nothing with numbers within the search budget. These remain unchecked rather than confirmed absent.
