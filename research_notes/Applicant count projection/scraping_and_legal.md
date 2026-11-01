# Collecting applicant-count time series to calibrate a growth model: sources, sampling, cost, and EU/NL legal constraints

Research date: 2026-10-11. Prices and terms change often. Check the live pages before you spend money.

## 1. Which public sources expose per-posting applicant counts or proxies?

### Takeaway
LinkedIn is the only major source found where a per-posting applicant count is publicly visible and can be re-read over time. Logged-out guest endpoints show it, and Apify actors package it. The count is capped ("Over 100" or "Over 200"), so above the cap it is only a lower bound. ATS job boards such as Greenhouse expose no applicant counts. I could not verify whether Indeed, Glassdoor, Werkzoeken.nl or Nationale Vacaturebank show counts to job seekers.

### Cited Findings
- **Northbell "LinkedIn Jobs Scraper with Applicant Counts (No Cookies)":**
  - It uses only LinkedIn's public guest endpoints, with no login, cookies or session tokens. Its input schema rejects fields named like cookie, session, token, auth or password. — [Apify: northbell/linkedin-jobs-applicants-scraper](https://apify.com/northbell/linkedin-jobs-applicants-scraper)
  - It is built to be re-run. History persists in a named key-value store (`linkedin-jobs-history`). Setting `onlyTrackedJobs: true` re-fetches detail pages only for jobs it already tracks. Applicants per day needs at least 2 samples. Jobs that drop out of results are emitted as `vanished` rows, and closed jobs (HTTP 404) are flagged `closed: true`. Applicant counts cannot be back-filled. — [same](https://apify.com/northbell/linkedin-jobs-applicants-scraper)
  - Cap handling: LinkedIn stops counting precisely at a threshold and shows text like "Over 200 applicants". When that happens the actor sets `applicantsPerDayReliable=false` with the note `capped-by-linkedin-so-this-is-a-lower-bound`. — [same](https://apify.com/northbell/linkedin-jobs-applicants-scraper)
  - Price is inconsistent on the page. The header says "from $1.20 / 1,000 job with applicant counts". The README says "$2.30 per 1,000 jobs with applicant counts", with 100 jobs costing $0.24 including the run start. The run-start fee is $0.01, failed fetches are not charged, and the price drops with higher Apify subscription tiers. — [same](https://apify.com/northbell/linkedin-jobs-applicants-scraper)
  - Request sizing is `requests = ceil(maxJobs/10) + maxJobs` (10 jobs per listing page). The default rate is about 20 requests per minute, so 50 jobs means 55 requests, or roughly 3 minutes. LinkedIn does not serve unlimited result pages to guests. — [same](https://apify.com/northbell/linkedin-jobs-applicants-scraper)
- **Prodiger "LinkedIn Jobs Scraper (Pay-Per-Event)":** lists applicant count among its output fields. It charges $0.005 per run start plus $0.58 per 1,000 jobs. This is from the store listing and search snippet only, and I did not check the field myself. — [Apify: prodiger/linkedin-jobs-scraper](https://apify.com/prodiger/linkedin-jobs-scraper)
- **Other LinkedIn job actors.** It is unclear whether these return applicant counts:
  - meka.im: from $0.30/1k. Its page notes that applicant counts can differ between requests. — [Apify](https://apify.com/meka.im/linkedin-jobs-scraper)
  - supreme_coder: $0.10–0.25/1k plus platform usage. — [Apify](https://apify.com/supreme_coder/linkedin-jobs-scraper.md)
  - truefetch: from $2.30/1k, 43 fields. — [Apify](https://apify.com/truefetch/linkedin-job-search)
  - curious_coder "PPR": $1.00/1k. Its issue tracker has a report of a scheduled run that ran for over 2 hours and spent more than $40 against an expected cost under $10, so set run limits. — [Apify issue](https://beta-securitybyobscurity.apify.com/curious_coder/linkedin-jobs-scraper/issues/this-scheduled-run-u-jhrRIMcQlQwMrhjz7)
- **What the LinkedIn number means:** it is mostly a tally of Apply-button clicks, not completed or screened applications. The display cap makes a role at 101 look the same as one at 4,000. — [Hiration](https://www.hiration.com/blog/over-100-applicants/)
- **The cap threshold is "Over 100" in some sources and "Over 200" in others.** — [Daily Dot, Jan 2024](https://www.dailydot.com/news/linkedin-lying-about-number-of-applicants/); [Apify northbell](https://apify.com/northbell/linkedin-jobs-applicants-scraper)
- **Greenhouse public Job Board API (confirmed):**
  - GET endpoints are public and need no authentication.
  - Job fields include `id`, `title`, `first_published`, `updated_at`, `application_deadline`, `location`, `content`, `absolute_url`, `pay_input_ranges` and `metadata`.
  - There is no applicant or application count field. The only count is `meta.total`, which is the number of jobs.
  — [Greenhouse Job Board API docs](https://docs.greenhouse.io/job-board.html)
- **Indeed:** it can only report completed applications submitted through Indeed itself. If a candidate applies on an external site, the posting can show 0 applicants. Application counts sit in the employer-side Performance Report. — [Augusta support article](https://support.augusta.care/hc/en-us/articles/19713153791501-Indeed-Why-Does-My-Job-Show-0-Applicants); [Indeed Apply help](https://au.indeed.com/help/employers/articles/what-is-indeed-apply)

### Inferences
- For the target market (NL), LinkedIn guest pages are the only practical public source of a re-readable applicant count.
- Greenhouse, and probably the other ATS boards, give a clean `first_published` timestamp and a "posting closed" signal (the job disappears from the board). That makes them useful for measuring posting lifetime, which is the censoring time, but not the applicant curve.
- Indeed's counts, even where an employer sees them, miss off-platform applies, so they are biased low as a proxy.

### Gaps
- **Lever, Workday and Ashby:** I did not check their docs this session. Their public posting APIs are widely understood to expose no applicant counts, but that is unconfirmed here.
- **Werkzoeken.nl and Nationale Vacaturebank:** I found no source on whether a candidate sees an applicant count. Check manually in a browser.
- **Indeed and Glassdoor (seeker side):** I found no authoritative source on whether they show applicant counts to job seekers.
- **Logged-out display rules:** LinkedIn's own documentation on what guests see (exact numbers versus ranges, and whether "Be among the first 25 applicants" appears for guests) was not found.

## 2. Sampling design to fit a growth curve

### Takeaway
Applications are heavily front-loaded, so sample densely in the first 72–96 hours and daily after that. Treat capped values as left-censored lower bounds, and treat the posting's close or disappearance as right-censoring. Fit one parametric saturating curve per posting, then pool by role type with a hierarchical model.

### Cited Findings
- **Davis & Samaniego de la Parra, Dice.com.** They linked about 125M applications to vacancies. The median posting duration is 7 days, and many postings last only 2–3 days. 45% of applications go to vacancies posted in the past 48 hours, and 60% to those posted in the past 96 hours. — [NBER w32320](https://nber.org/system/files/working_papers/w32320/w32320.pdf)
- **St. Louis Fed summary of earlier data from the same research** (about 80M applications, about 10M postings): 41% of applications arrive within 48 hours and 56% within 96 hours. — [St. Louis Fed, 2017](https://www.stlouisfed.org/on-the-economy/2017/november/how-quickly-people-apply-jobs)
- **Practitioner evidence, Indeed client postings.** On a 30-day posting, 50–70% of applications arrived in the first 10 days. Apply rates were fairly constant with posting age, so the decline comes from falling traffic, not from lower conversion. This is a vendor blog and weak evidence. — [Haley Marketing](https://www.haleymarketing.com/2020/08/03/age-job-posting-affect-performance-job-boards/)
- **Showing the applicant count changes behaviour.** In a LinkedIn field experiment with about 2.3M job seekers, showing the count raised application completion by about 3.5%. The rise was larger for women. — [Gee, IZA DP 10372 / Management Science 2019](https://docs.iza.org/dp10372.pdf)
- **Censoring and survivorship are observable with the northbell actor:** history rows carry `vanished` and `closed` flags, and capped values come flagged as lower bounds. — [Apify northbell](https://apify.com/northbell/linkedin-jobs-applicants-scraper)

### Inferences (recommended plan; my design, not from a source)
- **Enrolment.**
  - Enrol postings at age 24 hours or less. Use LinkedIn search sorted by date, with a "past 24h" filter, for the Netherlands, across about 6–10 role buckets (for example: software, data, marketing, sales, finance, operations/supply chain, HR, sustainability, and internships/graduate roles separately).
  - Target about 70 new postings per day, roughly 7–10 per bucket, for 4–6 weeks. That gives about 2,000–3,000 postings, or about 200–300 per bucket.
  - Bucket sizes of that order are enough for stable pooled curve parameters. This is a heuristic, not a power calculation.
- **Sampling frequency.** Sample every 6 hours (4 per day) from enrolment to 72 hours, then once a day until day 30 or until the posting closes or vanishes. That is about 12 + 27 = 39 reads per posting at most. Closures will cut the realistic average to about 20–25 reads.
- **Reposts.**
  - Keep LinkedIn's original listed time where it exists. The Kaggle schema has both `listed_time` and `original_listed_time`, see Q3.
  - Hash company + normalised title + location + description. A new job ID with the same hash within 60 days counts as a repost. Store it as a linked spell, not as a new posting with zero applicants.
  - A count that drops between reads is also a repost or reset signal, because a true cumulative count never falls.
- **"Over 100/200" caps.** Record the cap value and treat the observation as A(t) ≥ cap, which is a left-censored point in the likelihood (Tobit-style). Never treat it as equal to the cap. The time a posting first hits the cap is still informative: it is an interval-censored crossing time.
- **Right-censoring.** If a posting closes or vanishes, its last count is a lower bound on what it "would have" collected. Postings that close early are often the popular ones that filled fast, so dropping them biases the curve downward. Model the close time with its own hazard rather than deleting those postings.
- **Minimal model.**
  - Per posting, fit A(t) = A∞·(1 − e^(−t/τ)) or a Gompertz/log-logistic variant. Pool hierarchically by bucket: log A∞ and log τ are normal with bucket-level means, and company size and remote/hybrid enter as covariates.
  - With a 48-hour share around 40–45% (Dice), a first-pass prior for τ is roughly 2–4 days. This is an inference from the Dice numbers and needs checking on LinkedIn NL data.
  - The app can then project the final count from 1–2 early reads of a user's posting.
- **Cost (LinkedIn via Apify).**
  - Full plan: about 70 enrolments × about 25 reads = about 1,750 detail fetches per day, or about 52,500 per month.
    - Northbell at $1.20–2.30/1k: about $63–121 per month plus run-start fees (about $0.01 per run; at 4 runs/day, ≈$1.20/month).
    - Prodiger at $0.58/1k: about $30/month plus platform usage.
  - Pilot: 300 postings × 25 reads = 7,500 fetches, about $9–17 on northbell or $4–5 on Prodiger.
  - Run the pilot first to check field reliability and cap behaviour.
  - Arithmetic is based on listed store prices: [northbell](https://apify.com/northbell/linkedin-jobs-applicants-scraper), [prodiger](https://apify.com/prodiger/linkedin-jobs-scraper).

### Gaps
- No published LinkedIn-specific (or NL-specific) applicant-arrival curve was found. The Dice data is US tech roles only.
- It is unclear whether LinkedIn guest counts lag logged-in counts or are rounded.

## 3. Existing public datasets with applicant counts

### Takeaway
The Kaggle "LinkedIn Job Postings (2023–2024)" dataset by arshkon has `views`, `applies`, `listed_time`, `original_listed_time` and `closed_time` fields. I could not confirm whether it holds repeated snapshots per posting. It appears to be one count per posting, which gives a cross-section of (age, count) pairs, not true per-posting curves. It is mostly US data. No academic NL panel was found.

### Cited Findings
- **Size and coverage:** 124,000+ LinkedIn postings from 2023–2024, plus about 100,000 more jobs added by a second scraper. The scraper code is on GitHub. — [Kaggle: arshkon/linkedin-job-postings](https://www.kaggle.com/datasets/arshkon/linkedin-job-postings); description via the [Baselight mirror](https://baselight.app/u/kaggle/dataset/arshkon_linkedin_job_postings). Baselight shut down in July 2026, per its own redirect page, so the mirror is no longer browsable.
- **Columns:** an OpenML copy of the LinkedIn `postings.csv` lists `applies` ("Number of applications submitted"), `views`, `original_listed_time`, `closed_time`, salary fields and `formatted_work_type`. It is licensed CC BY-SA and was uploaded May 2024. — [OpenML d/45952](https://api.openml.org/d/45952)
- **Industry analyses of LinkedIn applicant counts:**
  - Resume.io reported Netflix postings averaging 84.87 applicants per day.
  - Neomam computed mean applicants within one week of posting across 130 cities, excluding locations with fewer than 100 jobs.
  - Both are marketing studies. — [Neomam](https://neomam.com/projects/competitive-job-markets/)
- **Academic:**
  - Gee (2019) used internal LinkedIn data, not public data. — [IZA DP 10372](https://docs.iza.org/dp10372.pdf)
  - Davis & Samaniego de la Parra used proprietary Dice.com application logs. — [NBER w32320](https://nber.org/system/files/working_papers/w32320/w32320.pdf)

### Inferences
- **Using the Kaggle data:**
  - Compute age = scrape time − `original_listed_time`, then fit a pooled curve of `applies` against age, by title or industry.
  - This gives a cheap US prior today. It cannot separate per-posting heterogeneity from age effects, which the daily panel in Q2 fixes.
  - `applies` is likely to be missing for many "external apply" postings, which needs checking.

### Gaps
- The Kaggle data card itself would not render, so I could not confirm the share of non-null `applies` or whether any posting appears in multiple snapshots.
- No NL or EU public dataset with time-stamped applicant counts was found.

## 4. Legal and ToS constraints (EU/Netherlands)

### Takeaway
- Scraping LinkedIn breaches LinkedIn's User Agreement. For EU users that agreement is governed by Irish law, and EU law lets an unprotected-database owner enforce such terms by contract (Ryanair, C-30/14). Systematic re-use of a protected job-ad database can also infringe the sui generis database right (Innoweb, C-202/12).
- GDPR risk is low if the app stores only job IDs, timestamps and counts. It becomes real if recruiter names or descriptions are kept: the Dutch DPA says scraping by private parties is "almost never" lawful unless very targeted.
- Practical risk for a small app is mainly account or IP blocking and a cease-and-desist, not fines. The safest designs avoid storing personal data and use user-reported outcomes or official feeds.

### Cited Findings
- **LinkedIn User Agreement** (effective 3 Nov 2025), §8.2. Users may not:
  - "Develop, support or use software, devices, scripts, robots or any other means or processes … to scrape or copy the Services, including profiles and other data";
  - "Override any security feature or bypass or circumvent any access controls or use limits";
  - copy or distribute information obtained from the Services without consent;
  - "Use bots or other unauthorized automated methods to access the Services".
  - For EU, EEA and Swiss users ("Designated Countries"), Irish law governs.
  — [LinkedIn User Agreement](https://www.linkedin.com/legal/user-agreement)
- **hiQ v. LinkedIn (US):**
  - In November 2022 the N.D. Cal. court held that LinkedIn's anti-scraping and anti-fake-profile terms are enforceable in contract. hiQ had prevailed on the CFAA "unauthorized access" question for public data.
  - In December 2022 the parties stipulated a $500,000 judgment. hiQ agreed to stop using LinkedIn data commercially without consent and to delete scraped data.
  - The judgment is stipulated, so it has no precedential value.
  — [Proskauer](https://newmedialaw.proskauer.com/2022/12/08/hiq-and-linkedin-reach-proposed-settlement-in-landmark-scraping-case/); [Wikipedia](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn); [MediaPost](https://www.mediapost.com/publications/article/380493/web-scraper-agrees-to-pay-linkedin-500000-destr.html)
- **Ryanair v PR Aviation (CJEU C-30/14, 15 Jan 2015; referred by the Dutch Hoge Raad):**
  - If a database is protected by neither copyright nor the sui generis right, the Database Directive's lawful-user exceptions do not apply.
  - The owner may therefore restrict screen-scraping by contract (website terms), subject to national law.
  — [Pinsent Masons Out-Law](https://www.pinsentmasons.com/out-law/news/website-operators-can-prohibit-screen-scraping-of-unprotected-data-via-terms-and-conditions-says-eu-court-in-ryanair-case); [MediaLaws](https://www.medialaws.eu/ecj-clarifies-database-directive-scope-in-screen-scraping-case/)
- **Innoweb v Wegener (CJEU C-202/12, 19 Dec 2013; referred by Gerechtshof Den Haag):**
  - A dedicated meta-search engine re-querying the AutoTrack car-ad database (190–200k ads, about 100,000 searches per day by GasPedaal) could be "re-utilisation" infringing the sui generis right.
  - This applies where it offers equivalent search functionality, queries in real time and presents results in the same way.
  — [IPKat](https://ipkitten.blogspot.com/2013/12/stepping-on-gaspedaal-cjeu-rules-on-re.html); [SCL](https://www.scl.org/2984-database-right-innoweb-v-wegener-cjeu-judgment/)
- **Dutch broker-listing cases (around 2009–2010; no case numbers found):**
  - Jaap.nl lost a kort geding on copyright for copying full broker listings.
  - In the Alletekoopstaandehuizen.nl appeal, both the copyright claim and the Databankenwet claim failed because there was no substantial investment in the broker data.
  — [Emerce](https://www.emerce.nl/nieuws/jaap-nl-verliest-zaak-tegen-makelaars)
- **Dutch DPA (Autoriteit Persoonsgegevens) scraping guidance (1 May 2024):**
  - Scraping by private parties and individuals is "almost never" permitted under the GDPR (AVG). In practice it is only lawful when done in a very targeted way.
  - "Public" does not mean consented.
  - The only plausible legal basis is legitimate interest (Art. 6(1)(f)), assessed from the design phase.
  — [IAPP](https://iapp.org/news/a/netherlands-dpa-issues-guidance-against-web-scraping); [Dutch IT Channel](https://www.dutchitchannel.nl/news/433543/ap-scraping-is-bijna-altijd-illegaal); [Mishcon de Reya](https://www.mishcon.com/news/dutch-data-protection-authority-releases-guidance-on-data-scraping)
- **CNIL (France) "how-to" sheets of 19 June 2025:**
  - Scraping public data can rest on legitimate interest, but only with safeguards.
  - Collection criteria must be defined in advance, and unneeded data categories filtered out.
  - Sites objecting via robots.txt or CAPTCHA should be excluded. Ignoring those signals defeats the reasonable-expectations test.
  - The sheets are soft law.
  — [Clifford Chance](https://www.cliffordchance.com/insights/resources/blogs/talking-tech/en/articles/2025/06/web-scraping-for-ai-development--the-cnil-builds-on-edpb-guidanc.html); [Hogan Lovells](https://hlc.com/en/publications/development-of-an-ai-system-cnil-issues-guidelines-regarding-collection-of-data-via-web-scraping)
- **Greenhouse states that "Job Board data is publicly available"** through an unauthenticated API. That makes ATS boards a sanctioned source for posting metadata such as `first_published` and closure. — [Greenhouse docs](https://docs.greenhouse.io/job-board.html)

### Inferences
- **Allowed or lower risk:**
  - Official public APIs (Greenhouse and similar ATS boards) for posting lifetimes.
  - Using public datasets (Kaggle CC BY-SA, with attribution and share-alike) for priors.
  - Asking app users to report their own applicant counts and outcomes, with consent. This is first-party data, needs a clear privacy notice and does not depend on ToS.
- **Contract and ToS risk:** running or buying LinkedIn guest scraping, even through Apify, breaches §8.2. Using a third-party actor does not remove the user's own ToS exposure where they are a LinkedIn member. Database-right risk is moderate for systematic daily re-reads of the same postings at scale, by analogy with Innoweb. It is lower for small samples and for storing only derived counts.
- **GDPR:**
  - Store only job ID, company, title, location, timestamps and the applicant count. Do not store recruiter or poster names, "hiring team" blocks or full descriptions. Put this in a legitimate-interest assessment.
  - Honour robots.txt, as the CNIL position implies.
  - Do not log in, use cookies or bypass rate limits, because §8.2 also bans circumventing access controls.
- **Practical risk for a small app:** a low chance of litigation, but realistic outcomes include IP blocking and a cease-and-desist letter. Keep the scraped panel internal for model calibration and never redistribute raw data, which keeps the exposure smallest.
- **Recommended path:**
  1. Use the Kaggle data now for a prior.
  2. Run a time-limited internal calibration panel only after accepting the ToS risk.
  3. Build in-app "report your posting's count / outcome" for durable, lawful data.
  4. Explore an official LinkedIn partnership or API. Access is gated, and I did not research its terms.

### Gaps
- I found no Dutch case law specifically on scraping job boards. The closest are the Innoweb and Ryanair referrals and the 2009–2010 real-estate listing cases, which have no ECLI numbers here.
- I could not read the full AP handreiking PDF or the CNIL sheets. The points above come from law-firm and press summaries.
- I found no source on whether LinkedIn has enforced against EU guest-endpoint scrapers in court.
- I did not research LinkedIn's official Jobs or Talent API access terms.
