# What LinkedIn's (and Indeed's) applicant count measures, and how to scale it to total applicants

Research date: 2026-10-11. Evidence quality legend: **[OFFICIAL]** = LinkedIn/Indeed/vendor documentation; **[VENDOR DATA]** = ATS or recruitment-marketing vendor data (customer base only, often promotional); **[ANECDOTE]** = recruiter claims, blogs, social media, forums.

## Q1. LinkedIn: what does "N applicants" count (Easy Apply vs off-site clicks), dedup, labels, wording changes, caps?

### Takeaway
LinkedIn has published no help article that defines the public "applicants" badge. Its ad documentation does say that for off-site apply jobs LinkedIn can see only **Apply clicks**, never completed applications. Recruiters and analysts agree with that: on an off-site (company ATS) posting the number is mostly people who clicked Apply. On an Easy Apply posting it is submissions made on LinkedIn. The public display stops at "Over 100 applicants", and reposted jobs can carry their old count forward.

### Cited Findings
- [OFFICIAL] LinkedIn Campaign Manager defines two separate metrics. "Job Apply Clicks" is the "Number of clicks on your job's Apply button collected through the ad set or ad". "Job Applications" is the "Number of job applications collected through the ad set or ad". If applications are collected "through a site other than LinkedIn, you'll only be able to review reporting on Job Apply Clicks." — [LinkedIn Help: Job applicants metrics in Campaign Manager](https://www.linkedin.com/help/lms/answer/119095)
- [OFFICIAL, partner integrations only] LinkedIn's developer documentation for Apply with LinkedIn records one event when the member "has clicked Apply for that job" and a separate one when the member "has started the application" after consenting. So LinkedIn's own data model treats a click and an application as different events. — [Microsoft Learn: Apply with LinkedIn use cases](https://learn.microsoft.com/en-us/linkedin/talent/apply-with-linkedin/awli-usecases)
- [SECONDARY quote of OFFICIAL] Resunova quotes LinkedIn Recruiter help as saying that for postings that send applicants to an external site, "LinkedIn doesn't keep a record of who applied for your jobs", and that employers cannot see applicant numbers in Job Analytics for those postings. Resunova gives no URL, and I could not verify the quote on linkedin.com. Resunova also says LinkedIn has **not** documented the badge as click-based, so the claim rests on recruiter testing. Recruiters report that the counter goes up as soon as Apply is clicked, before the external page loads. — [Resunova, "LinkedIn's Applicant Count Is Measuring Clicks, Not Applications"](https://www.resunova.io/blog/linkedin-applicant-count-clicks-not-applications/)
- [ANECDOTE] Easy Apply submissions are completed and recorded on LinkedIn. With the plain Apply button, LinkedIn "loses track" of who finishes on the company ATS. The display is capped at "Over 100 applicants", so 101 and 4,000 look identical. Reposted or refreshed listings can carry forward an older tally. Fresh listings may show a "Be an early applicant" label. — [Hiration blog](https://www.hiration.com/blog/over-100-applicants/)
- [ANECDOTE] Recruiter "@getmethatjob" says on TikTok (780k views) that the count tracks people who click Apply, not people who finish, and that "loads of people" abandon. The example posting showed 113 applicants. LinkedIn gave no comment. Published 7 Jan 2024. — [Daily Dot](https://www.dailydot.com/news/linkedin-lying-about-number-of-applicants/)
- [ANECDOTE] An employer who paid to promote a videographer job in New York says LinkedIn reporting showed "applicant clicks and NOT applicants" (TikTok, approx. April 2024). — [TikTok @jerryjhlee](https://www.tiktok.com/@jerryjhlee/video/7356356682743565610)
- [ANECDOTE] A Team Blind thread reports that reposted jobs do not reset the counter. — [Team Blind](https://www.teamblind.com/post/linkedin-applicant-count-ny1hws10)
- [ANECDOTE] Third-party browser extensions say they read the exact count from LinkedIn's API or Premium insights and replace the "Over 100" text. They also say even Premium shows only "100+". This means the exact number exists server-side but is hidden. The claim is unverified. — [Chrome Web Store: LinkedIn Exact Applicant Counter](https://chromewebstore.google.com/detail/linkedin-exact-applicant/bckkpagmbcpfomemacgpcladlpdckiop?hl=en)
- Comparable click-based counters on other sites:
  - [OFFICIAL] USAJOBS counts people who "started applying" and continued to the agency, and says the number "may not" show completed applications. — [USAJOBS Help](https://help.usajobs.gov/faq/application/applicant-count)
  - [OFFICIAL] We Work Remotely says its apply analytics count clicks. Its example of 2,011 clicks "doesn't mean 2,011 people applied". — [WWR Support](https://support.weworkremotely.com/where-do-i-see-the-people-that-have-applied-for-my-job)

### Inferences
- Treat the badge as two different quantities depending on apply type:
  - **Easy Apply:** about the number of submissions made on LinkedIn. This is a floor on the LinkedIn channel only.
  - **Off-site apply:** about the number of people who clicked Apply on LinkedIn. This is an upper bound on applications that came from LinkedIn.
- Deduplication is very likely per member (one logged-in member clicking twice counts once), but no source confirms it.
- "Over 100" should be treated as right-censored: the true value is ≥101, with no upper bound.
- The "Be among the first 25 applicants" label most plausibly means fewer than 25. No source found documents it.
- Because counts can carry over through reposts, the count can include applicants from an earlier version of the same posting. That supports the app's existing "count is a floor carried forward" logic.

### Gaps
- No official LinkedIn Help Center article defining the public "N applicants" badge was found.
- I could not find a sourced date for the wording change to "N people clicked apply" on off-site postings. The anecdotal sources above (2024) already describe the badge as "clicks", but none documents when LinkedIn changed the label text.
- No source documents the exact bucket thresholds ("first 25", "Over 100", "200+") or whether counts below 100 are exact or rounded.
- No source covers deduplication rules (logged-out clicks, repeat clicks, the same person on duplicate postings).

## Q2. Indeed and Glassdoor: do they show counts, and what do they mean?

### Takeaway
I found no documentation of a public, job-seeker-facing applicant count on Indeed or Glassdoor. On the employer side, Indeed counts only applications completed on Indeed. For redirect ("apply on company site") jobs, Indeed can track only clicks, so the employer view can show 0 applicants.

### Cited Findings
- [VENDOR, third-party] Indeed "can only report completed applications that are submitted through Indeed". Jobs that redirect to an external careers page can show 0 applicants even while people apply elsewhere. For those jobs the trackable metric is clicks. — [Augusta Care support](https://support.augusta.care/hc/en-us/articles/19713153791501-Indeed-Why-Does-My-Job-Show-0-Applicants)
- No result described Glassdoor's applicant display. — (search returned nothing relevant)

### Inferences
- If the app ever reads an Indeed or Glassdoor number, treat it like LinkedIn: submissions for on-platform apply, and clicks or nothing for redirect apply.

### Gaps
- Whether Indeed shows job seekers any applicant count (e.g., an "urgently hiring" or "many applicants" style badge) is not documented in the sources found.
- Glassdoor's behaviour is undocumented in the sources found.

## Q3. Share of applicants and hires by channel (LinkedIn vs career site vs Indeed vs referrals vs universities), especially NL and internships

### Takeaway
No source splits applications by channel with LinkedIn shown on its own.
- Vendor data puts all job boards at about **49–61% of applications**, career sites at **13–35%**, and referrals at about **9–12% of hires**. These are mostly US small- and mid-size businesses.
- In the Netherlands, job seekers prefer Indeed over LinkedIn: 45% vs 36% name it their favourite job board (2025).
- For student internships, older European data has universities as a major channel (about 36%).

### Cited Findings
- [VENDOR DATA] **CareerPlug**, 2024 data (2025 Recruiting Metrics Report, more than 60,000 small businesses, more than 10M applications):
  - Job boards produced 61% of applications and 42% of hires.
  - Company career pages produced 13% of applications and 26% of hires.
  - Average click-to-apply conversion was 6%.
  - There were 180 applicants per hire.
  - Sources: [Interview Guys summary](https://blog.theinterviewguys.com/?p=17443); [StaffingHub](https://staffinghub.com/hiring/company-pages-referrals-result-in-more-hires-recruiting-metrics-report/); [CareerPlug](https://www.careerplug.com/recruiting-metrics-and-kpis/)
- [VENDOR DATA] **CareerPlug**, older data:
  - 2020: the share of applicants hired was 0.22% from job boards, 19.17% from referrals and 5.18% from career pages.
  - 2021 healthcare: Indeed and ZipRecruiter brought 77% of applicants, but only about 1% of them were hired.
  - Partner job boards are 60% of all CareerPlug applications.
  - Source: [CareerPlug](https://careerplug.com/?p=8614) (search-result snippets)
- [VENDOR DATA] **Fountain** (mostly hourly roles): job boards were 49.38% of applications and 19.12% of hires; career sites were 34.93% of applications and 28.93% of hires. — [Fountain](https://www.fountain.com/posts/why-you-need-to-invest-in-your-career-site)
- [VENDOR DATA] **Gem** (via Upplai, year not stated): job boards and social were 49% of applications and 24.6% of hires; direct sourcing was 2.5% of applications and 9.94% of hires. — [Upplai](https://www.uppl.ai/job-application-response-rate)
- [VENDOR DATA] **Ashby** (250K hires, mostly tech companies): inbound applications (job boards, LinkedIn and career page combined) were 43–52% of all hires in 2021–2025. — [Ashby: How many hires come from inbound](https://ashbyhq.com/talent-trends-report/reports/inbound)
- [VENDOR DATA] **Breezy HR 2024** (24M+ applications): Indeed was the source of 62% of hires, and referrals of 12% of hires (up 3 points YoY). Indeed's own write-up is promotional. — [Breezy HR 2024 report](https://breezy.hr/resources/hiring-reports/source-of-hire-report-2024); [Indeed summary](https://www.indeed.com/lead/indeed-leading-source-of-hire-breezy-hr)
- [VENDOR DATA] **TalentNest 2022** (Canada and US): the hiring rate per applicant was 13.8% for referrals and 3.2% for the corporate website. — [TalentNest PDF](https://www.talentnest.com/wp-content/uploads/2023/05/TalentNest%20Source%20of%20Hires%202022.pdf)
- [SURVEY, NL] **Intelligence Group**, about 1,500 active job seekers, data from 2025, published 5 Mar 2026:
  - Indeed is the favourite job board for 45% (38% in 2024).
  - LinkedIn is the favourite for 36% (37% in 2024).
  - Women: 52% Indeed, 38% LinkedIn. Men: 38% Indeed, 34% LinkedIn.
  - Niche and regional boards are gaining.
  - Source: [Werf&](https://www.werf-en.nl/data-donderdag-indeed-favoriete-jobboard/); [Flexnieuws](https://www.flexnieuws.nl/2026/03/indeed-verstevigt-koppositie-niche-en-regionale-jobboards-winnen-terrein/)
- [SURVEY, NL] **NBB'24**, a usage measure rather than "favourite": LinkedIn 61%, Indeed 49%, Nationale Vacaturebank 14%. — [recruitmenttraining.pro](https://recruitmenttraining.pro/nieuws/vacaturesites-in-nederland/)
- [SURVEY, NL, undated] Intelligence Group: 1 in 5 Dutch people who found a job in the past year did so through their own network. — [Personeelsnet](https://www.personeelsnet.nl/bericht/werkzoekenden-gebruiken-de-vijf-gouden-kanalen-niet)
- [SURVEY, EU students, 2018, dated] **JobTeaser/EDHEC** (about 1,350 students and young graduates) on how they found their last internship:
  - 43% via the internet
  - 36% via the university (careers webpage, forums, alumni, professors)
  - 21% via personal contacts
  - Source: [CEU](https://www.ceu.es/blog/en/2018/study-shows-youngsters-trends-when-starting-their-first-job/)

### Inferences
- Scale the LinkedIn count with LinkedIn's share of *applications*, not hires. Assumed LinkedIn shares for an NL graduate or internship role at a large employer:
  - Job boards in total are about 50–60% of applications.
  - In NL, LinkedIn is roughly on par with Indeed, and is likely stronger for white-collar, graduate and English-language roles. LinkedIn's usage share (61%) beats Indeed's (49%) in NBB'24.
  - Career sites, university career portals, referrals and niche boards make up the rest.
- A plausible LinkedIn share of all applications is **25–50%**, with about 35% as the central estimate.
  - For multinational English-language internships, LinkedIn is probably at the high end (40–50%).
  - For Dutch-language, MBO-level or hourly roles, it is probably at the low end (15–25%), because Indeed dominates there.

### Gaps
- None of the vendors found publish an application-share figure for LinkedIn on its own: not Greenhouse, SmartRecruiters, Ashby, Jobvite or iCIMS.
- No 2020–2026 Dutch source breaks down *applications* by channel. Intelligence Group measures job-seeker preference and usage, not where applications actually arrive.
- No 2020–2026 source gives internship-specific channel shares for the Netherlands (university career services, Handshake/JobTeaser, career site, LinkedIn). I also found no data from UWV or CBS on this.

## Q4. Conversion: what share of LinkedIn off-site "Apply" clicks become completed applications?

### Takeaway
No published benchmark measures the step from a click on LinkedIn's Apply button to a completed external application. The only figure found is one hiring manager's unverified guess that about 20% never submit. Appcast's widely cited apply rate (about 5–6%) measures a different, earlier step and must not be used here.

### Cited Findings
- [ANECDOTE] A hiring manager estimated that about 20% of people counted as applicants never submit after clicking through, and said the estimate "might be too generous". The author notes no published data exists. — [Resunova](https://www.resunova.io/blog/linkedin-applicant-count-clicks-not-applications/)
- [VENDOR DATA] Appcast apply rate, which runs from a click on a job ad to a completed application (379M clicks, 30M+ applications, 1,300+ US employers):
  - 6.1% in 2024, up about 35% during the year.
  - 5.19% median in 2025.
  - It falls with application length: 5.37% for applications taking 1–5 minutes, 3.09% for 16+ minutes.
  - These figures are secondary reports; I did not reach Appcast's own page.
  - Sources: [Joveo](https://www.joveo.com/blog/what-is-apply-rate/); [Pin](https://www.pin.com/blog/recruitment-funnel-benchmarks)
- [VENDOR DATA] CareerPlug average click-to-apply was 6% in 2024. — [StaffingHub](https://staffinghub.com/hiring/company-pages-referrals-result-in-more-hires-recruiting-metrics-report/)
- [SURVEY, 2018, dated] Only 12% of career-page visitors apply. — (cited via [Interview Guys / SmartRecruiters search snippet](https://blog.theinterviewguys.com/?p=17443))

### Inferences
- The Apply click is a strong intent signal, made after the job ad was already viewed. Completion after that click should therefore be far higher than 5–6%.
- The likely loss comes from people abandoning at an ATS login wall, a long form (Workday-style ATS) or a mismatch they spot on the company page.
- Working assumption for completion after the click:
  - **50–80%** (central about 65%) for a long corporate ATS such as Workday or SuccessFactors, which is what Philips-type employers use.
  - **70–90%** for a short form (Greenhouse, Lever, Ashby).
- These ranges are assumptions anchored on the single "about 20% never submit" anecdote plus Appcast's evidence that longer forms lose more applicants. They are not measured values.

### Gaps
- No LinkedIn, Appcast, ATS or academic source measures the completion rate for LinkedIn's off-site Apply click.

## Q5. Recommended multiplier from the displayed LinkedIn count to total applicants across all channels

### Takeaway
Use a different multiplier for each apply type. These are inferred ranges built from the findings above; no source publishes them.
- **Easy Apply** count: about **×2–4**, central ×2.8.
- **Off-site apply** count: about **×1.0–3.0**, central ×1.8.
- **"Over 100"**: treat as a floor of 101 before applying the multiplier.

### Cited Findings
- Inputs:
  - The LinkedIn share of applications is not published. Job boards in total are 49–61% of applications ([CareerPlug via StaffingHub](https://staffinghub.com/hiring/company-pages-referrals-result-in-more-hires-recruiting-metrics-report/), [Fountain](https://www.fountain.com/posts/why-you-need-to-invest-in-your-career-site), [Upplai/Gem](https://www.uppl.ai/job-application-response-rate)).
  - In NL, LinkedIn is the favourite job board for 36% and Indeed for 45% ([Werf&](https://www.werf-en.nl/data-donderdag-indeed-favoriete-jobboard/)).
  - The off-site count measures clicks ([LinkedIn Help](https://www.linkedin.com/help/lms/answer/119095); [Resunova](https://www.resunova.io/blog/linkedin-applicant-count-clicks-not-applications/)).
  - The display is capped at "Over 100" ([Hiration](https://www.hiration.com/blog/over-100-applicants/)).

### Inferences
- **Model:** total ≈ displayed × c / s, where:
  - c = completion rate after a click. Use c = 1 for Easy Apply. For off-site apply use about 0.5–0.9, central 0.65.
  - s = LinkedIn's share of all applications. Use about 0.25–0.5, central 0.35.
- **Easy Apply:** 1/0.5 to 1/0.25 gives **×2.0–4.0**, central **×2.9**. For a Dutch-language or hourly role where Indeed dominates (s ≈ 0.15–0.25), the multiplier is ×4–7.
- **Off-site apply:** 0.5/0.5 = ×1.0 up to 0.9/0.25 = ×3.6. A sensible band is **×1.0–3.0**, central 0.65/0.35 ≈ **×1.9**.
- **Worked example:** "48 applicants" on an off-site Philips internship gives about 48 × 1.9 ≈ **90**, with a band of about 50–145. The same 48 on Easy Apply gives about 140, with a band of about 95–190.
- **Adjustments:**
  - Raise s (lower the multiplier) for English-language tech or multinational roles where LinkedIn dominates.
  - Lower s for roles promoted heavily via university career portals, Indeed or referral drives.
  - Reposted jobs may already include earlier applicants, which supports the app's carry-forward floor logic.
- Show the result as a range in the UI rather than a single point, given that every input except the cap is an assumption.

### Gaps
- None of the inputs c (completion after click) or s (LinkedIn share of applications) has a published 2020–2026 measurement for NL internships. Both are assumption-driven.
- The best way to calibrate them would be employer-side ATS source reports, for example asking a recruiter or using any public "applications by source" disclosures from Dutch graduate employers. None were found.
