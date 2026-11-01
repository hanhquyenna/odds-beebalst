import type { Report } from "../types"

const report: Report = {
  slug: "interview-odds-base-rates",
  order: 1,
  title: "How likely is an interview? Base rates from hiring funnels",
  subtitle: "What two large recruiting-software datasets say about applications, interviews and offers, and how odds turns them into a range.",
  category: "Odds",
  minutes: 32,
  headline: { figure: "3.9%", line: "of applicants worldwide are interviewed (SmartRecruiters, 2025). odds uses 2.4–5.4% before anything about you" },
  feeds: "Interview chance",
  art: "funnel",
  abstract: "When international graduates in the Netherlands look at a vacancy, the first practical question is how likely an application is to lead to an interview. No Dutch source measures this per application, so odds builds an estimate from two large recruiting-software datasets and field experiments. This report sets out what the odds number means (an interview, not a job), how the SmartRecruiters 2025 and Ashby 2026 funnels are turned into a per-application interview share, and why the two give different answers of 2.4% and 5.4%. It compares them with other benchmarks, shows the arithmetic of the chained derivation, tests how sensitive it is to its inputs, and works through an example profile that ends at about 2% to 7%. It then checks the cumulative chance over many applications, where an earlier figure does not fully reproduce. The evidence supports a range, not a point, and the range describes groups of applicants, not any one person.",
  findings: [
    "SmartRecruiters reports that 3.9% of applicants worldwide and 5.4% in Germany are interviewed, with 1.2% and 1.4% receiving an offer [1].",
    "Chaining Ashby's 170 applications per hire and 81% offer acceptance with SmartRecruiters' 3.25 interviews per offer gives 2.4% interviews per application, which is 2.3 times lower than the German figure [1, 2, 3].",
    "Ashby's own productivity data (109M applications) puts the application to interview share at 3.6% to 4.7% and applications per hire at 291, so the chained 2.4% sits below the direct measurement [4].",
    "Twenty high-confidence Dutch self-reports give a median of 90 applications for 2 interviews, or 1.5% per application, below the vendor range but from a small and self-selected group [5].",
    "The interview-to-offer rate cannot be added to the chain, because it runs from 7% for small and medium employers to 72.2% for enterprise ones [6].",
    "The worked example ends at 1.8% to 7.4% per application, and over 20 applications the chance of at least one interview is 30% to 79% if applications were independent, which they are not [7, 8]."
  ],
  sections: [
    {
      heading: "In plain words",
      blocks: [
        { type: "h3", text: "What is the interview chance?" },
        { type: "p", text: "It is the share of applications like yours that get an interview, shown as a range such as 1.0% to 3.1%. It is a figure for a group of similar applicants, not a prediction about you, and it is not the chance of getting the job. An interview is the first step; the offer comes after it." },
        { type: "h3", text: "How do we judge it?" },
        { type: "p", text: "In three steps. First a benchmark: how often applications to jobs of this kind lead to an interview, taken from applicant-tracking data. Second, adjustments for who you are and what you did, each taken from a study that changed one thing and measured the response. Third, how well your CV matches this posting." },
        { type: "list", items: [
          "**What we read from you:** the skills and tools on your CV, your line of work, your roles and years of experience, your level, and your track record (the employers, schools, positions, prizes and grades you state), plus where you studied and worked.",
          "**What we read from the job:** the skills and tools it lists and how much it insists on each (must-have, strong plus, preferred, nice to have), its line of work and level.",
          "**What you tick:** a referral, a tailored application, an internship on your CV. These move the range by the size the studies found."
        ] },
        { type: "h3", text: "Where do the numbers come from?" },
        { type: "list", items: [
          "**Market benchmark.** Interview and hire rates from recruiting software: Ashby's 2026 data (109 million applications) and SmartRecruiters' 2025 data. They tell us how often an average application is interviewed.",
          "**Dutch hiring experiments.** Researchers sent matched CVs to real Dutch vacancies and counted callbacks (Thijssen et al. 2019 and 2021, SCP 2010). They tell us how a foreign background changes the response, and that a CV built to fit a vacancy got a positive response 18% to 54% of the time (4,211 applications).",
          "**Other controlled studies.** Internships (Baert 2021), employer and school prestige (Kessler et al. 2019), CV quality (Bertrand and Mullainathan 2004), tailoring (ResumeGo 2020) and referrals (Ashby 2026)."
        ] },
        { type: "h3", text: "How the number is built, step by step" },
        { type: "list", ordered: true, items: [
          "Start from the benchmark range for this kind of role (business, technical or other).",
          "Apply the gap the Dutch experiments found for a foreign background, if it applies to you.",
          "Apply what an internship, a referral or a tailored application did in the studies. Weak evidence moves only one end of the range, never both.",
          "Score how closely your CV matches this posting from 0% to 100%, with must-haves counting most. An average applicant sits at the benchmark.",
          "Place you inside the range: a better match than average moves you toward the top of what the Dutch experiments saw, a worse match lowers it, by at most about 23%: the Bertrand and Mullainathan study found strong CVs got 30% more callbacks than weak ones, which is a 23% drop going the other way."
        ] },
        { type: "h3", text: "How sure are we?" },
        { type: "p", text: "Every job shows a **confidence** of Low, Medium or High, with a score out of 100. It says how much we had to go on, and it is built from four equal parts: whether there were enough similar jobs to take the benchmark from, how many of the five things we compare could be read from your profile, how many skills the posting lists to compare with, and how tight the range is (do the studies agree). Each part is shown with what was found, so you can see why the score is what it is." },
        { type: "p", text: "It is not a statistical test and it does not mean the number was checked against real outcomes. It has not been: the benchmark and the background gap are measured on other applicants, mostly in other countries or not on international students, and how much each part of your CV counts in the match score is our own written scale. The range itself is the honest statement of the uncertainty, because it comes from how much the studies differ." },
        { type: "h3", text: "How much research is behind it?" },
        { type: "list", items: [
          "**9 research reports** in this app, and this one cites **32 sources**.",
          "**Hiring data:** Ashby's 2026 data covers 109 million applications, and SmartRecruiters' 2025 data covers 89 million applications in 95 countries.",
          "**Dutch experiments:** the matched-CV experiment behind the background gap sent 4,211 applications to real vacancies."
        ] },
        { type: "h3", text: "What could make it more scientific?" },
        { type: "p", text: "These are statistics that could be added to the number. None of them is built yet, so the page calls the number an estimate from research." },
        { type: "list", items: [
          "**Regression on real outcomes.** Log applications and what happened next, and fit a logistic regression with the benchmark and the study gaps as the starting values, so the data moves the estimate only as far as it justifies.",
          "**Calibration.** Report whether a stated 3% really turns out near 3%: the calibration slope, and the Brier score compared with the benchmark alone, on data held back for testing.",
          "**Confidence intervals.** Replace the range between studies with an interval from the data itself, for example by bootstrapping.",
          "**Recruiter ratings.** Ask recruiters whether they would interview a person for a posting, and fit how much each part of a CV counts to those answers.",
          "**Peer benchmark.** Compare a candidate with people who were hired into similar roles, for skills, schools and previous employers.",
          "**Meta-analysis.** Combine the studies that measure the same gap (for example foreign background in several countries) into one pooled effect with an interval.",
          "**Bias check.** Test whether the estimate is equally accurate for different groups of applicants."
        ] },
        { type: "p", text: "The rest of this report gives the sources, the arithmetic and the limits in detail." }
      ]
    },
    {
      heading: "Introduction",
      blocks: [
        {
          type: "p",
          text: "A graduate who has moved to the Netherlands, sent twenty applications and heard back from one employer has a reasonable question: is that normal? Almost nothing that is published answers it directly, and the statements that do exist usually describe something slightly different from what the reader imagines."
        },
        {
          type: "p",
          text: "odds is a job finder for international graduates that estimates interview chance, pay, net pay and permit fit from sourced data. This report is about the first of these. The figure odds prints on a posting is the probability of an interview for a profile like the reader's, on that posting. In the notation of the method notes it is the probability of an interview given this profile and this posting [3]. Read plainly, it asks what share of a large group of people with the same profile would be invited to talk if each of them sent an application like this one. It is a statement about groups. It does not say what will happen to any one person, and it says nothing about how the interview will go."
        },
        {
          type: "p",
          text: "It is also not the probability of being hired. That distinction is central to the design and needs stating at the outset, because the two are easily confused. A hire is the end of a chain in which someone reads an application, someone decides to talk to the applicant, one or more conversations take place, an offer is made and the applicant accepts. Each link has its own probability and its own, uneven, public evidence. The interview is the link for which the evidence is best and the one an applicant can influence most, and the report explains why."
        },
        {
          type: "p",
          text: "The audience makes the question pressing. For international graduates of Dutch universities, staying is the minority outcome. Among WO international graduates of the 2022/23 cohort, 30% were working in the Netherlands one year after graduating, and 57% had left the country; among those who stayed, 70% were working, against 84% of Dutch graduates [9]. Five years after graduating, 25.3% of all international graduates in the cohorts 2013 to 2022 were still in the Netherlands [10]. These figures do not describe the application stage, but they show that the path from degree to a job is not automatic for this group."
        },
        {
          type: "p",
          text: "The report asks five questions. First, what do the largest public hiring funnels say about the share of applicants who are interviewed? Second, how can two funnels that report different things be turned into one comparable quantity? Third, why do the results differ, and how wide should the resulting range be? Fourth, how does a base rate become a range for a particular profile? Fifth, what does the range imply for the chance of at least one interview over many applications?"
        },
        {
          type: "p",
          text: "A caution applies throughout. Every funnel used here was measured on employers that use recruiting software, none of them in a sample built for the Netherlands, and the field experiments that are Dutch used fictitious applicants. Where the sources disagree or are weak, the report says so, and it gives ranges rather than single numbers. Nothing here is legal, tax or immigration advice; questions about permits and sponsorship belong with the IND and the employer."
        }
      ]
    },
    {
      heading: "Data and sources",
      blocks: [
        {
          type: "p",
          text: "Four kinds of evidence are used, and they answer different questions. The first kind is vendor funnels. Companies that hire at scale use an applicant tracking system (ATS), software through which every application moves from stage to stage, such as screened, interviewed, offered and hired. Because the software records each move, its maker can publish benchmark figures for the stages. Three vendors are used here. SmartRecruiters publishes the share of applicants interviewed and offered, for the world and for Germany, from 89 million applications in 95 countries [1]. Ashby publishes applications per hire for EMEA scale-ups, stage pass rates and offer acceptance [2], and a second report on recruiter productivity with an application to interview share [4]. Employ, which combines Jobvite, Lever and JazzHR, publishes interview to offer rates by company size for 6,640 customers [6]. Greenhouse publishes applications per job for Europe, 183, from more than 6,000 companies, but that figure counts applications per vacancy, not per hire, and cannot be turned into an interview share [11]."
        },
        {
          type: "p",
          text: "The second kind is field experiments, also called correspondence tests. Researchers invent applicants whose CVs are identical except for one trait, such as a name or an internship, send them to real vacancies and record which receive a positive response, usually an invitation or a request for contact. Because everything else is held equal, a difference in responses can be attributed to the one trait. Dutch experiments used here include the Dutch arm of the GEMM study, with 4,211 applications between 2016 and 2018 [12, 13], the Dutch sample in the cross-national GEMM comparison, 4,463 applications [14], and the earlier SCP study with 1,342 valid tests in 2008 [15]. Others come from elsewhere: an internship experiment in Belgium [16], an audit study of foreign work experience that is not Dutch [17], a vendor test of cover letters in the United States [18], and a 2026 experiment in Belgium, the Netherlands and Spain on study abroad [19]. A large American audit of the 108 largest employers, with 83,000 fictitious applications, is used only as a contrast [20]."
        },
        {
          type: "p",
          text: "The third kind is self-reports. odds collected 277 rows of applications and interviews from Dutch job seekers who wrote about them on Reddit, taken from 1,352 posts in 10 subreddits. Only 20 rows are high-confidence, meaning the writer stated at least 10 applications [5]. This is survivor-biased and tiny. It is used to check the direction of the vendor numbers and is never shown as a rate."
        },
        {
          type: "p",
          text: "The fourth kind is Dutch context: how long hiring takes [21], how many employers report vacancies as hard to fill [22], and how the volume of postings has moved [23]. These do not enter the calculation. They frame it."
        },
        {
          type: "table",
          id: "tbl-sources",
          caption: "The benchmark sources used for the base rate, and what each one counts.",
          head: [
            "Source",
            "What it counts",
            "Sample",
            "Place"
          ],
          rows: [
            [
              "SmartRecruiters 2025",
              "Share of applicants interviewed and offered",
              "89M applications, 95 countries",
              "Global and Germany"
            ],
            [
              "Ashby 2026, operations",
              "Applications per hire; offer acceptance; stage pass rates",
              "180K jobs (per hire); 54M applications (acceptance)",
              "EMEA scale-ups; global customers"
            ],
            [
              "Ashby 2026, productivity",
              "Application to interview share; applications per hire",
              "109M applications, 247K jobs, 2021 to 2026",
              "Global customers"
            ],
            [
              "Employ 2026",
              "Interview to offer rate by company size",
              "6,640 customers",
              "Not stated as national"
            ],
            [
              "Greenhouse 2026",
              "Applications per job",
              "More than 6,000 companies",
              "Europe"
            ],
            [
              "Reddit self-reports, 2026",
              "Interviews per application, as written by applicants",
              "20 high-confidence rows of 277",
              "Netherlands"
            ]
          ],
          note: "None of the vendor samples was drawn for the Netherlands. Sources: SmartRecruiters 2025 [1]; Ashby 2026 [2, 4]; Employ 2026 [6]; Greenhouse 2026 [11]; odds collected Reddit posts [5]."
        },
        {
          type: "p",
          text: "{ref:tbl-sources} also shows why the sources cannot simply be averaged. They measure different events in different populations. The median is the middle value when all values are lined up from smallest to largest, so half the reports are below it and half above; the middle half of the Reddit reports runs from 0% to 10%, which is very wide. A funnel benchmark, unlike a field experiment, does not change one thing at a time, so it cannot say why two groups differ, only that they do."
        },
        {
          type: "p",
          text: "The word interview is the main hazard. The method notes observe that in one data source an interview appears to mean a phone screen and in another a scheduled round with the hiring team [3]. The vendors' own definitions were not available in full for this report, so the observation is treated as a plausible explanation rather than a proven one. The same uncertainty applies to the customers: enterprise employers across all functions hire differently from scale-ups hiring for business roles, and neither is the same as Dutch employers who post graduate vacancies."
        }
      ]
    },
    {
      heading: "What the number measures, and what comes after the interview",
      blocks: [
        {
          type: "p",
          text: "The decision to estimate the interview and not the job rests on three observations. The first is that later stages are poorly and inconsistently measured. The second is that the interview is the step an applicant can most directly influence. The third is that it happens often enough to be measured against real outcomes within a realistic amount of data."
        },
        {
          type: "h3",
          text: "Later stages are measured differently by every vendor"
        },
        {
          type: "p",
          text: "A hiring funnel narrows at each stage, as {ref:fig-funnel} sketches, and the stages after the interview are the least comparable. Consider the step immediately after it. Employ's 2026 benchmarks report how often an interview ends in an offer, and the answer depends heavily on employer size: 7% for small and medium businesses, 16.6% for mid-market and 72.2% for enterprise, as {ref:bars-employ} shows [6]. A reader might expect a smooth gradient with size. The jump from 16.6% to 72.2% is far too large for that, and the method notes explain it as a difference in definition, the enterprise figure being closer to a final round [3]. A rate that changes tenfold depending on which moment is called the interview cannot be multiplied into a chain without guessing."
        },
        {
          type: "bars",
          id: "bars-employ",
          caption: "Share of interviews that end in an offer, by employer size, in the Employ 2026 benchmark.",
          unit: "% of interviews",
          items: [
            {
              label: "Small and medium business",
              value: 7
            },
            {
              label: "Mid-market",
              value: 16.6
            },
            {
              label: "Enterprise",
              value: 72.2
            }
          ],
          note: "Employ 2026 (Jobvite, Lever, JazzHR), 6,640 customers [6]. The enterprise figure uses a different definition of the interview, so odds shows this stage as a bucket label only."
        },
        {
          type: "p",
          text: "Ashby reports two pass rates that look useful and are not: 35% of candidates pass the screen and 24% pass the onsite stage [2]. These are conditional rates among people already inside the process, so they answer how often a screened candidate goes on, not how often an applicant is screened in the first place. Reading a pass rate as an interview rate would answer a different question from the one odds asks. For the same reason odds does not use them for the base."
        },
        {
          type: "p",
          text: "There is also a limit on what nobody publishes. The number of applicants per posting is not exposed by any legitimate source, and the method notes rate confidence in it as none [3]. This is one more reason the number is a range over many postings and not a statement about one."
        },
        {
          type: "h3",
          text: "What the interview is, and what it is not"
        },
        {
          type: "p",
          text: "An interview is the first point at which a person has read the file and decided to speak to the applicant. Much of that decision rests on the applicant's side of the desk: how closely the CV matches the posting, whether the permit question is settled, whether the applicant knows someone at the employer. Later decisions depend more on circumstances that cannot be seen from outside. The product requirements state the boundary directly: odds does not predict interview performance [24]."
        },
        {
          type: "p",
          text: "The interview is also the stage that can be checked soonest. Ashby's 2026 data for business roles at EMEA scale-ups put hiring at one hire per 170 applications [2]. A rate of a few in a hundred can be measured with far fewer logged applications than a rate of less than one in a hundred, so odds can compare its proxy with real outcomes sooner. The plan for that comparison is described in Section 10."
        },
        {
          type: "art",
          id: "fig-funnel",
          kind: "funnel",
          caption: "A hiring funnel narrows at every stage. The odds number describes only the first narrowing, from application to interview, not the whole funnel down to a hire."
        },
        {
          type: "h3",
          text: "Context that does not enter the calculation"
        },
        {
          type: "p",
          text: "Three Dutch figures give context, and it is worth being explicit about what they do not show. Hiring takes 44.5 days on average according to a Dutch recruitment indicator [21]. Employers reported 45% of their vacancies as hard to fill in 2025, 44% in finance and 47% in ICT, in a survey of 3,551 employers [22]. And the Indeed Hiring Lab index of total postings in the Netherlands stood at 114.33 on 18 September 2026 (seasonally adjusted, 100 at the start of February 2020), against a peak of 172.63 on 7 June 2022 [23]. The last is plain arithmetic: 114.33 divided by 172.63 is 0.66, so the volume of postings is about a third below its peak and above its pre-2020 level."
        },
        {
          type: "p",
          text: "None of these is an interview rate. Hard-to-fill vacancies describe the employer's side of the market, not the chance an individual applicant is invited. A large stock of postings does not say how many people respond to each. The available data cannot show that the base rate moves with them, and odds does not adjust for it."
        },
        {
          type: "p",
          text: "A second source of confusion is percentages that resemble odds. Glassdoor's interview pages, for example, report the routes by which interviewees say they obtained their interview. Those are shares among people who already reached the stage, a mix of channels among survivors, and they say nothing about the chance of reaching it [25]. A last contrast is an American audit in which 24% of fictitious applications to the 108 largest employers received contact within 30 days [20]. That measures contact, in the United States, for applications built to be comparable, and is a different quantity from any figure above."
        }
      ]
    },
    {
      heading: "Two funnels and the chained derivation",
      blocks: [
        {
          type: "p",
          text: "Two vendor datasets carry most of the weight in the base rate, and they arrive in different forms. One states the quantity needed. The other states quantities from which it can be worked out."
        },
        {
          type: "h3",
          text: "The direct answer: SmartRecruiters 2025"
        },
        {
          type: "p",
          text: "SmartRecruiters' 2025 report covers 89 million applications in 95 countries. Globally, 3.9% of applicants were interviewed and 1.2% received an offer. For Germany the report gives 5.4% interviewed and 1.4% offered [1]. Its customers are enterprise employers using the SmartRecruiters ATS, across all job functions. This is the most direct answer available, because it divides applicants interviewed by applicants, which is exactly the quantity odds wants. The German figure is the nearest European number to the Netherlands that the report offers, so it is used as the upper end of the base range, labelled as a European proxy and nothing stronger."
        },
        {
          type: "p",
          text: "The global pair also yields a ratio that is useful in the next step. If 3.9% of applicants are interviewed and 1.2% receive an offer, then for each offer there were 3.9 divided by 1.2, or 3.25, interviews [1]. The same calculation on the German pair gives 5.4 divided by 1.4, or about 3.86 interviews per offer. That second ratio is this report's own arithmetic and is used only in the sensitivity check in Section 5 [8]."
        },
        {
          type: "h3",
          text: "The indirect answer: Ashby 2026, chained"
        },
        {
          type: "p",
          text: "Ashby's operations benchmark does not report an interview share directly. It reports that for business roles at EMEA scale-ups, in 180,000 jobs, it takes 170 applications to make one hire, and that across customers behind 54 million applications, 81% of offers are accepted [2]. A rate of interviews per application can be worked out from these two figures and one more, the number of interviews per offer, which the Ashby report does not give and SmartRecruiters does [3]. {ref:tbl-chain} shows the steps."
        },
        {
          type: "table",
          id: "tbl-chain",
          caption: "The chained derivation of an interview share from Ashby's applications per hire.",
          head: [
            "Step",
            "Calculation",
            "Result",
            "Source of the input"
          ],
          rows: [
            [
              "Hires per application",
              "1 divided by 170",
              "0.59% (1 in 170)",
              "Ashby 2026, business roles, EMEA scale-ups [2]"
            ],
            [
              "Offers per application",
              "0.59% divided by 0.81 acceptance",
              "0.73%",
              "Ashby 2026, offer acceptance, 54M applications [2]"
            ],
            [
              "Interviews per offer",
              "3.9% divided by 1.2%",
              "3.25",
              "SmartRecruiters 2025, global [1]"
            ],
            [
              "Interviews per application",
              "0.73% multiplied by 3.25",
              "2.4%",
              "Product of the three steps [3]"
            ]
          ],
          note: "Unrounded, 1/170 is 0.588%, divided by 0.81 is 0.726%, multiplied by 3.25 is 2.36%, which rounds to 2.4% [8]."
        },
        {
          type: "p",
          text: "The logic of each step is straightforward. One hire per 170 applications means that 0.59% of applications end in a hire. Because only 81% of offers are accepted, offers must be more frequent than hires, so dividing by 0.81 gives 0.73% of applications receiving an offer. If every offer takes 3.25 interviews, then 0.73% multiplied by 3.25 gives about 2.4% of applications reaching an interview."
        },
        {
          type: "p",
          text: "What the chain does deserves a careful reading. It takes three numbers measured on three different groups and multiplies them: scale-up business roles in EMEA, a set of customers worldwide, and a second vendor's global candidates. Each step is reasonable taken alone, but nothing ensures the errors cancel, and each step carries the definitions of its own vendor. This is the reason the result is treated as a proxy, and the method notes rate the interview rate as low in confidence for that reason [3]."
        },
        {
          type: "p",
          text: "Both results are labelled as they are found. SmartRecruiters in Germany says 5.4% of applicants are interviewed. The Ashby chain says 2.4%. The ratio between them is 5.4 divided by the unrounded 2.36, or about 2.3 [3, 8]. Neither was collected in the Netherlands, and the next section considers why they differ."
        }
      ]
    },
    {
      heading: "Why the funnels disagree, and how wide the range should be",
      blocks: [
        {
          type: "p",
          text: "A gap of a factor of about 2.3 between two large datasets is not unusual for benchmarks that measure related but distinct things. The useful question is which differences could produce it and how much each might matter. Three explanations are available from the sources, and one of them can be partly tested with the published numbers."
        },
        {
          type: "h3",
          text: "Definitions and customers"
        },
        {
          type: "p",
          text: "The first is definition, as above: if an interview is a phone screen in one system and a scheduled round in another, the two count different events. The second is the customer base. SmartRecruiters' German figure comes from enterprise employers across all functions. The Ashby chain starts from scale-ups hiring for business roles. Scale-ups grow fast and may receive applications differently from a large employer with a structured graduate intake [1, 2]. Neither is proven, because a funnel does not vary one thing while holding the others fixed."
        },
        {
          type: "h3",
          text: "A sensitivity test of the chain"
        },
        {
          type: "p",
          text: "The third explanation is the chain itself, which can be tested by changing its inputs one at a time. The published sources offer several alternatives. Ashby reports 254 applications per hire for technical roles, against 170 for business roles, and its productivity report gives 291 applications per hire for global customers [2, 4]. SmartRecruiters' German pair gives 3.86 interviews per offer in place of 3.25 [1]. {ref:tbl-sens} applies each alternative to the chain in {ref:tbl-chain}."
        },
        {
          type: "table",
          id: "tbl-sens",
          caption: "How the chained interview share changes when one input is replaced by another published figure.",
          head: [
            "Variant",
            "Applications per hire",
            "Interviews per offer",
            "Interviews per application"
          ],
          rows: [
            [
              "Baseline: business roles, EMEA scale-ups",
              "170",
              "3.25",
              "2.4%"
            ],
            [
              "Technical roles, EMEA scale-ups",
              "254",
              "3.25",
              "1.6%"
            ],
            [
              "Ashby global customers",
              "291",
              "3.25",
              "1.4%"
            ],
            [
              "Business roles with the German ratio",
              "170",
              "3.86",
              "2.8%"
            ],
            [
              "For comparison: SmartRecruiters Germany, direct",
              "not needed",
              "not needed",
              "5.4%"
            ],
            [
              "For comparison: Ashby application to interview, direct",
              "not needed",
              "not needed",
              "3.6% to 4.7%"
            ]
          ],
          note: "Variants are odds arithmetic on published inputs, with 81% offer acceptance throughout [8]; inputs from Ashby [2, 4] and SmartRecruiters [1]."
        },
        {
          type: "p",
          text: "The table shows two things. First, the chain moves by a factor of about 1.7 just by choosing a different published count of applications per hire, from 1.4% to 2.4%, and the direction is always lower than the direct measurements. Second, none of the variants comes near 5.4%. The chain is therefore fragile, but its fragility does not explain the gap to SmartRecruiters Germany. The gap must come from the definition or the customers, or from the chain's combination of unlike populations."
        },
        {
          type: "p",
          text: "A further test of consistency is available within Ashby's own data. Its productivity report gives an application to interview share of 3.6% to 4.7% by role type and 291 applications per hire [4]. Multiplying, 3.6% of 291 is 10.5 and 4.7% of 291 is 13.7, so Ashby's customers interview roughly 10 to 14 people for each hire. The SmartRecruiters ratio, 3.25 interviews per offer, divided by the 81% acceptance rate, gives about 4.0 interviews per hire [8]. These two counts differ by a factor of between two and three. The most natural reading is that Ashby's customers count earlier contacts as interviews than SmartRecruiters does, which is the definitional explanation again, now visible in published arithmetic. It is a reading, not a finding: the two reports come from different customers, and the numbers alone cannot separate the definition from the population."
        },
        {
          type: "h3",
          text: "Other evidence on the same quantity"
        },
        {
          type: "p",
          text: "Two more sources fall within or near the range, and they are shown together in {ref:rng-shares}. Ashby's direct application to interview share, 3.6% to 4.7% by role type from 109 million applications for 247,000 jobs between January 2021 and March 2026, sits inside the 2.4% to 5.4% range [4]. The Dutch self-reports are a different matter. Among the 20 high-confidence rows the median writer reported 90 applications and 2 interviews, which is 1.5% per application, and the middle half of writers ranged from 0% to 10% [5]. The notes report the 1.5% as the median rate per application, and 90 applications and 2 interviews as the median counts. Dividing 2 by 90 gives 2.2%, so the two should not be combined: a median of individual ratios need not equal the ratio of medians. The notes do not state how the median rate was computed, so all three figures are reported as they stand. The sample is small and self-selected, and people tend to write about their search when it is not going well, so a value below the vendor range is what one would expect."
        },
        {
          type: "ranges",
          id: "rng-shares",
          caption: "Interview share of applications according to each source.",
          unit: "%",
          max: 12,
          items: [
            {
              label: "odds base range (two funnels)",
              low: 2.4,
              high: 5.4
            },
            {
              label: "Ashby 2026, direct, by role type",
              low: 3.6,
              high: 4.7
            },
            {
              label: "Ashby chain variants",
              low: 1.4,
              high: 2.8
            },
            {
              label: "Dutch self-reports, middle half",
              low: 0,
              high: 10
            }
          ],
          note: "Ranges are the published or derived low and high values [1, 2, 4, 5, 8]. The Dutch self-reports are self-selected, from 20 rows with at least 10 applications."
        },
        {
          type: "p",
          text: "Put together, the picture is coherent but not precise. A few interviews for every hundred applications is the normal starting point in the vendor data, with the exact number depending on who is counted and what is called an interview. The range of 2.4% to 5.4% covers the direct vendor evidence. The Ashby chain variants fall under it, and the Dutch self-reports sit under it on average while spreading above it."
        },
        {
          type: "h3",
          text: "Why a range and not an average"
        },
        {
          type: "p",
          text: "It would be tidy to average the two, or to choose the more recent or the larger dataset. The method notes decline, on the ground that any single number here would be a choice rather than a measurement [3]. Carrying both ends forward keeps the disagreement visible, and the disagreement is itself the most accurate statement of what is known."
        }
      ]
    },
    {
      heading: "From a base rate to a range for one profile",
      blocks: [
        {
          type: "p",
          text: "The base rate describes applicants in general. A profile differs from the average in ways that are known to matter, and field experiments give estimates of how much, one trait at a time. odds applies these as multipliers to the base, with rules about which may combine. The approach is stated in the method notes [3], and this section explains each piece and its evidence."
        },
        {
          type: "h3",
          text: "A ceiling: what a matched application can reach"
        },
        {
          type: "p",
          text: "The Dutch arm of the GEMM experiment sent applications whose CVs matched the vacancy. The share of positive responses differed sharply by occupation: 54% for software developer, 27% for account manager and 18% for administrative clerk at hbo level [12]. Across all 4,211 applications the overall positive response was 38%, 1,587 applications [12]. These are Dutch, occupation-specific and measured, but they describe fictitious applicants whose CVs fit as the experiment designed them to, so they are a ceiling that a full match points to, not a forecast for a real applicant."
        },
        {
          type: "p",
          text: "The gap between this ceiling and the base rate is large. Dividing the ceiling values by the base range gives ratios from 3.3 (18% divided by 5.4%) to 22.5 (54% divided by 2.4%); the method notes summarise this as 5 to 10 times [3, 8]. The broad reading is unchanged: how well an application fits a posting appears to matter a great deal. There is no calibrated coefficient for fit, so odds shows the checklist coverage as a fact and does not multiply it in."
        },
        {
          type: "h3",
          text: "The adjustments and their evidence"
        },
        {
          type: "p",
          text: "The origin effect is the best measured. In the Dutch GEMM data the predicted positive response was 46% for natives and 35% for applicants with a migration background, and 33% for a non-Western background [13]. The ratio 35 divided by 46 is 0.76. The earlier SCP study, at hbo and wo function level, found 46% against 43% (0.93), with a gap significantly smaller than at low function level (40% against 32%) [15]. The two studies thus disagree about graduate level: SCP finds the gap roughly halves, while the Thijssen study finds no such attenuation overall [26]. odds uses 0.76 in the low bound and 0.93 in the high bound. A third option would use the non-Western figure, 33 divided by 46, or 0.72, which would lower the low bound slightly further [13]."
        },
        {
          type: "p",
          text: "Work experience mostly outside the EU receives about 12% fewer callbacks than identical local experience in an audit study of more than 8,000 fictitious resumes, a multiplier of 0.88, but not in a Dutch sample [17]. An internship raised the probability of an interview by a factor of 1.126 in a Belgian experiment on real openings, the closest labour market to the Netherlands in the set [16]. A tailored cover letter produced 16.4% callbacks against 12.5% for a generic letter and 10.7% for none, a multiplier of 1.31 over the generic letter, in a vendor test of 7,287 applications in the United States [18]. A study period or degree abroad changed nothing in a 2026 experiment with 2,100 applications to 700 real vacancies, a multiplier of 1.00 [19]. A referral is associated with a screen pass rate of 52% against 35% overall (1.49), from an ATS aggregate and so observational [2]; it is applied only when the profile has a connection at the employer. A randomised trial of writing assistance found a multiplier of 1.08 on hires among 480,948 job seekers, but it measures hires and not interviews, and is not used [27]."
        },
        {
          type: "p",
          text: "Three rules govern how the multipliers combine [3]. The first is overlap: the origin effect and the foreign-experience effect may measure the same employer reaction twice, so the low bound multiplies both (0.76 times 0.88 is 0.67) and the high bound uses only the larger effect. The second is that the strength of the evidence decides which bound it enters. Experimental results enter both bounds, a vendor test such as the cover letter study enters only the high bound, and the study-abroad result of 1.00 is shown so the reader knows it was tested. The third is a rule for later: once odds keeps a log of outcomes (not built yet) and a cell holds at least 30 of them, the measured rate is meant to replace the base."
        },
        {
          type: "h3",
          text: "A worked example"
        },
        {
          type: "p",
          text: "The method notes work through a profile applying for an indirect tax accountant position: a non-EU applicant with an internship, mostly non-EU experience and a tailored application [7]. {ref:tbl-example} reproduces the arithmetic for both bounds."
        },
        {
          type: "table",
          id: "tbl-example",
          caption: "Low and high bound for the example profile, step by step.",
          head: [
            "Step",
            "Low bound",
            "High bound",
            "Evidence"
          ],
          rows: [
            [
              "Base rate",
              "2.4%",
              "5.4%",
              "Ashby chain and SmartRecruiters Germany [1, 2]"
            ],
            [
              "Origin effect",
              "x 0.76",
              "x 0.93",
              "GEMM NL 2021; SCP 2010 at hbo and wo level [13, 15]"
            ],
            [
              "Foreign experience",
              "x 0.88",
              "left out (overlap)",
              "Audit study, not Dutch [17]"
            ],
            [
              "Internship",
              "x 1.126",
              "x 1.126",
              "Belgian field experiment [16]"
            ],
            [
              "Tailored application",
              "left out (vendor)",
              "x 1.31",
              "US vendor test [18]"
            ],
            [
              "Result per application",
              "1.8%",
              "7.4%",
              "Shown as about 2% to 7%, proxy estimate [7]"
            ]
          ],
          note: "Low bound: 2.4% x 0.76 x 0.88 x 1.126 = 1.8%. High bound: 5.4% x 0.93 x 1.126 x 1.31 = 7.4%. Arithmetic checked in odds research notes [8]."
        },
        {
          type: "p",
          text: "Each line of the calculation can be checked. In the low bound, 0.76 times 0.88 is 0.669, and 2.4% times 0.669 times 1.126 is 1.81%. In the high bound, 5.4% times 0.93 is 5.02%, times 1.126 is 5.65%, times 1.31 is 7.41%. The printed range is therefore about 2% to 7%, labelled as a proxy estimate [7]. An earlier version of the calculation gave 4.5% to 6.2%. The method notes point out that it looked more confident only because it hid both the disagreement between the funnels and the overlap between penalties [3]. The wider range is the more honest one."
        },
        {
          type: "p",
          text: "The example also shows the direction in which more favourable traits push. A variant with a referral appears in the product requirements, which give a high-end figure of 5.4% x 0.76 x 1.31 x 1.13 x 1.49, about 9% [24]. Rechecking: 0.054 times 0.76 times 1.31 times 1.13 times 1.49 is 0.0905, or 9.05% [8]. That example applies the origin effect of 0.76 together with a referral in the high case, which differs from the rule above that uses 0.93 at graduate level; the two versions of the example are not mutually consistent, which is one of the reasons the printed range follows the rule set out in the method notes."
        }
      ]
    },
    {
      heading: "The chance of at least one interview over many applications",
      blocks: [
        {
          type: "p",
          text: "Applicants rarely send one application. The natural follow-up question is what the chance is that at least one of N applications leads to an interview. The standard calculation is 1 minus (1 minus p) to the power N, where p is the chance for a single application. It is the probability of not being interviewed in N independent attempts, subtracted from one [3]. {ref:tbl-cum} gives the results for the four per-application values that appear in this report."
        },
        {
          type: "table",
          id: "tbl-cum",
          caption: "Chance of at least one interview in N applications, if each application were an independent draw.",
          head: [
            "Per application",
            "5 applications",
            "10 applications",
            "20 applications",
            "50 applications"
          ],
          rows: [
            [
              "1.8% (example, low bound)",
              "8.7%",
              "16.6%",
              "30.5%",
              "59.7%"
            ],
            [
              "2.4% (base, low)",
              "11.4%",
              "21.6%",
              "38.5%",
              "70.3%"
            ],
            [
              "5.4% (base, high)",
              "24.2%",
              "42.6%",
              "67.1%",
              "93.8%"
            ],
            [
              "7.4% (example, high bound)",
              "31.9%",
              "53.6%",
              "78.5%",
              "97.9%"
            ]
          ],
          note: "Computed as 1 minus (1 minus p) to the power N, for the values of p used in this report [8]. An upper bound, not a forecast: see text."
        },
        {
          type: "h3",
          text: "Reproducing the method notes' figure"
        },
        {
          type: "p",
          text: "The method notes state that for the example profile, 20 applications give a chance of 30% to 71% [3]. The low end reproduces: at 1.8% per application, 20 applications give 30.5%. The high end does not reproduce from the printed high bound. At 7.4% per application, 20 applications give 78.5%, not 71%. The value that would give 71% is a per-application chance of about 6.0%, for which 20 applications give 71.0% [8]. The notes do not say where that number came from. It may come from an earlier version of the high bound, but that is a guess. This report therefore uses its own arithmetic, in {ref:tbl-cum}: 30% to 79% over 20 applications for the example profile, with the caveat that the high end depends on the contested 7.4%."
        },
        {
          type: "p",
          text: "Two other checks support the table. The product requirements contain a referred, tailored example at about 9% per application and state about 85% over 20 applications [24]. The calculation gives 85.0% at 9.05%. So the formula is applied correctly in the requirements and the discrepancy is confined to the 71%."
        },
        {
          type: "h3",
          text: "Why the table is an upper bound"
        },
        {
          type: "p",
          text: "The independence assumption is the weak point, and the direction of the error is known. One person's applications share the same CV, the same permit situation and the same Dutch level. If something about the profile makes one employer decline, it will usually make others decline too, so the outcomes move together. When outcomes are positively correlated, the chance of at least one success is lower than the independent formula gives, because the failures cluster. The size of the effect cannot be computed from the sources, since no Dutch source reports the distribution of interviews among people who send N applications. The method notes label the figure an upper bound until the outcome log supplies the real distribution [3]."
        },
        {
          type: "p",
          text: "Expected counts give a second view that is unaffected by correlation. The expected number of interviews from 20 applications is 20 times p, which is 0.36 at 1.8% and 1.48 at 7.4% [8]. Twenty applications with no interview is therefore an unremarkable result under the low bound. In the same way, the Dutch self-reports show a median of 90 applications for 2 interviews. At 2.4% per application 90 applications would produce 2.2 interviews on average, and at 5.4% they would produce 4.9 [8]. The observation of 2 fits the lower part of the range, as the notes say, though it comes from people who chose to write about it [5]."
        },
        {
          type: "p",
          text: "A related way of reading the table turns it around. The number of applications needed for an even chance of at least one interview is the natural logarithm of 0.5 divided by the natural logarithm of (1 minus p). That is about 38 applications at 1.8%, 29 at 2.4%, 12.5 at 5.4% and 9 at 7.4% [8]. Because the table overstates the chance for real applicants, these are lower limits on the applications a real person needs, not targets."
        }
      ]
    },
    {
      heading: "Discussion",
      blocks: [
        {
          type: "p",
          text: "Six points follow from the evidence taken together. The first is that the vendor funnels agree on the order of magnitude and disagree on the detail. A few in a hundred applications lead to an interview in every dataset read here. SmartRecruiters' global 3.9% and Germany's 5.4%, Ashby's direct 3.6% to 4.7% and the chained 2.4% all sit between about 1.4% and 5.4% [1, 4, 8]. The single most useful message for an applicant is that a low hit rate is ordinary. The second is that the disagreement is explained mostly by definition and customers, and by the construction of the chain, and cannot be resolved by the published sources."
        },
        {
          type: "p",
          text: "The third point is that fit, which the evidence says matters most, is the one thing the estimate does not multiply. Matched applications in the Dutch experiment reached 18% to 54% by occupation, a multiple of the base rate [12]. An applicant who treats the printed range as the final word would miss that much of the variation between applicants comes from how well the application suits the posting. That is why the checklist is shown beside the range."
        },
        {
          type: "p",
          text: "The fourth is about communication. A single percentage such as 4% implies knowledge that the sources do not contain. A range with a label says how much is known. There is experimental evidence that this is not at the cost of trust. In five experiments, van der Bles and colleagues found no significant difference in trust in the numbers between a numerical range and a control condition, while verbal hedges (such as \"could be somewhat higher or lower\") lowered trust in the number [28]. A longitudinal study of 51 gig drivers found that adding hedging words to ranges reversed the gains in trust and reliance [29]. The odds convention follows: a numerical range, a label for the kind of evidence, and no hedge words wrapped around a single figure. This concerns reactions to numbers in other settings, not job seekers, and shows only that a range does not cost trust."
        },
        {
          type: "p",
          text: "A fifth point concerns what a good model of a job-finding probability looks like in the Netherlands. TNO's Werkverkenner 2.0 predicts the chance that an unemployment benefit claimant finds a job within 12 months, with an AUC of 0.778 and a Brier score of 0.191 on 53,079 claimants [30]. The AUC measures how well the model ranks people who found work above those who did not, and the Brier score how close the predicted probabilities are to outcomes, lower being better. The population and outcome differ, but it shows the checks a probability needs: ranking and calibration. The interview rate of odds has neither yet, which is why it carries a proxy label."
        },
        {
          type: "p",
          text: "A sixth and final point is about the labour market for the audience. Unemployment in 2025 was 2.9% for people of Dutch origin, 5.5% for European origin and 6.6% for origin outside Europe [31]. Combined with the origin gaps in the field experiments, this is consistent with the origin multipliers, but the two sets of numbers measure different things, and unemployment rates do not measure the chance of an interview. One earlier Dutch result illustrates the variety: in online first-stage applications to temporary employment agencies, 34% of applications received interest with no difference by origin or sex, while in-person walk-ins showed a large gap [32]. Discrimination findings depend on the channel and on the stage."
        }
      ]
    },
    {
      heading: "Limitations",
      blocks: [
        {
          type: "p",
          text: "The most important limitation is that no source measures the quantity directly for the Netherlands. The two funnels come from customers of recruiting software, mainly enterprises and scale-ups, in Germany, EMEA and the world. The Dutch field experiments measure positive responses to fictitious applicants, not the share of real applicants who are interviewed [12]. The Dutch self-reports are the only per-applicant Dutch numbers, and they come from 20 rows of people who chose to write [5]. The interview rate is therefore a proxy, and the notes rate it low in confidence [3]."
        },
        {
          type: "p",
          text: "A second limitation is definitional. The vendors' definitions of an interview are not fully known to this report, and the suggestion that the gap between the funnels comes from phone screens versus scheduled rounds is an interpretation in the notes, not a finding. The published arithmetic (10 to 14 interviews per hire in one set of figures and 4 in the other) is consistent with that interpretation, but does not prove it [8]."
        },
        {
          type: "p",
          text: "A third is that the chain and the multipliers mix populations. The chain combines scale-ups, global customers and another vendor's candidates. The multipliers come from Dutch, Belgian, American and multinational studies of different years. The SCP experiment dates from 2008, the GEMM data from 2016 to 2018, and the labour market has changed since [13, 15]. The internship effect comes from Belgium and the foreign experience effect from a sample that is not Dutch [16, 17]. The tailored application effect comes from a vendor with a commercial interest, in the United States [18]. Multiplying effects also assumes that they combine independently, which has not been tested."
        },
        {
          type: "p",
          text: "A fourth is that no experiment here isolates a foreign degree in the Netherlands. The study-abroad experiment found no effect of a study period, which is not the same as the effect of a degree obtained abroad, and the notes record that no Dutch correspondence test of foreign degrees or foreign work experience was found [19, 26]. Experiments on origin used names and fictitious CVs with Dutch education and a Dutch-language CV, so they measure the reaction to a name or origin signal, not to the combined situation of an international graduate who needs a work permit."
        },
        {
          type: "p",
          text: "A fifth is that the calculation cannot see employer-specific facts: whether an employer sponsors, how many people applied, and what the recruiter prefers. Whether an employer is a recognised sponsor is a register fact and is reported separately, and it does not mean the employer will sponsor a given role. Nothing in this report is legal, tax or immigration advice. Permit rules and thresholds are set by the IND and other authorities, and readers should use the official source."
        },
        {
          type: "p",
          text: "Finally, the cumulative figures are upper bounds by construction, the notes' 71% does not reproduce, and the referral example in the product requirements is not fully consistent with the rule in the method notes."
        }
      ]
    },
    {
      heading: "What this means for odds",
      blocks: [
        {
          type: "p",
          text: "The report leads to specific rules in the product. On a posting, odds prints the rate as a range with the kind of evidence named beside it, for example about 2% to 7%, proxy estimate, and lists the derivation underneath: the base on two lines, one for each funnel with its source, then each adjustment with its source [3, 24]. The matched-application line (18% to 54% by occupation) is printed separately and is not multiplied. Interview to offer is shown only as a bucket by employer size, as in {ref:bars-employ}, and odds does not predict interview performance. Data that are not Dutch are labelled as such."
        },
        {
          type: "p",
          text: "The cumulative view is offered as an upper bound with the independence assumption stated, using the arithmetic in {ref:tbl-cum} and not the unreproduced 71%. The explanation beside it should say that the figure describes groups, that applications from one person are correlated, and that the expected number of interviews is often the more honest summary."
        },
        {
          type: "p",
          text: "The long-term plan is to replace the proxy with measurement. An outcome log, which is optional and consented, would record occupation, fit tier, employer size, permit status, Dutch level and the stage reached. A measured rate appears once a cell has at least 30 outcomes, shown on its own line with its sample size and never blended into the public base. With 10 finance and technology occupations and 3 fit tiers there are 30 cells, so the first milestone is about 900 logged applications; at roughly 20 applications per person, that is about 45 people logging honestly [3]. The log would also provide the missing distribution of interviews per N applications, and with it a measured correction to the independent formula. Until then every rate carries the proxy label, which is meant as the product's credibility and not as a disclaimer."
        },
        {
          type: "p",
          text: "For a reader, a few practical readings follow."
        },
        {
          type: "list",
          items: [
            "Read the derivation lines, not only the headline. They show which assumption moves the range most, and you may discount a step that does not resemble your situation.",
            "Treat the width of the range as information. A wide band means the evidence is thin, not that something is wrong with your profile.",
            "Treat a low rate of interviews per application as ordinary. In the vendor data a few in a hundred is the normal starting point, and the Dutch self-reports sit at the low end.",
            "Look at the checklist for each posting. Fit is where the Dutch experiments show the largest difference, and it is the part you can change.",
            "Log what happens after you apply, if you choose to. Your outcomes are how a proxy becomes a measurement for the next person."
          ]
        },
        {
          type: "p",
          text: "None of this predicts what will happen to any one applicant. It describes what the evidence says about people like them and how well that evidence is known."
        }
      ]
    }
  ],
  references: [
    "SmartRecruiters (2025). Recruitment Benchmarks 2025 Report. SmartRecruiters, enterprise applicant tracking system vendor. 89M applications in 95 countries; share of applicants interviewed and offered: global 3.9% and 1.2%, Germany 5.4% and 1.4%.",
    "Ashby (2026). Talent Trends Report 2026: Recruiting Operations Benchmarks. Ashby, recruiting software vendor. Applications per hire for EMEA scale-ups (180K jobs: 170 for business roles, 254 for technical roles); screen pass rate 35%, onsite pass rate 24%, referral screen pass rate 52% and offer acceptance rate 81% for global customers (54M applications).",
    "odds research notes (2026). How the interview rate is computed: definition, base range, adjustments, overlap rule and confidence ratings. odds, internal method notes.",
    "Ashby (2026). Talent Trends Report 2026: Recruiter Productivity. Ashby, recruiting software vendor. 109M applications for 247K jobs, January 2021 to March 2026; application to interview share of 3.6% to 4.7% by role type; 291 applications per hire for global customers.",
    "odds collected Reddit posts (29 September 2026). Self-reported applications and interviews of Dutch job seekers from 1,352 posts across 10 subreddits, retrieved from the Arctic Shift archive; 277 extracted rows, of which 20 high-confidence rows with at least 10 applications (median 90 applications and 2 interviews).",
    "Employ Inc. (2026). 2026 Hiring Benchmarks (combined Jobvite, Lever and JazzHR data). Employ. Interview to offer rates by company size: small and medium business 7%, mid-market 16.6%, enterprise 72.2%; 6,640 customers.",
    "odds research notes (2026). Worked example: indirect tax accountant posting, non-EU profile with internship, mostly non-EU experience and tailored application. odds, internal method notes.",
    "odds research notes (30 September 2026). Recomputation of the chained base rate, its sensitivity and the cumulative chance of at least one interview, from the published inputs listed in this report. odds, internal arithmetic.",
    "Statistics Netherlands (CBS) (2026). Uitstromers ho; arbeidsmarktpositie na verlaten onderwijs. CBS StatLine table 85776NED, Netherlands, graduate cohorts 2006/07 to 2023/24; used for WO international graduates, cohort 2022/23.",
    "Nuffic (2025). Stay rates of international graduates. Nuffic, based on the CBS population register; cohorts 2013 to 2022; 25.3% of international graduates still in the Netherlands after five years.",
    "Greenhouse (2026). Recruiting Benchmarks, Europe edition. Greenhouse, recruiting software vendor. 183 applications per job in Europe, more than 6,000 companies; access to the full report is restricted.",
    "Thijssen, L., Coenders, M. and Lancee, B. (2019). Correspondence test of ethnic discrimination in Dutch hiring (Dutch arm of the GEMM study). Mens & Maatschappij, 94(2). 4,211 applications, 2016 to April 2018, 10 occupations at mbo and hbo level; 1,587 positive responses (38%).",
    "Thijssen, L., Coenders, M. and Lancee, B. (2021). Ethnic discrimination in the Dutch labor market. Journal of International Migration and Integration. Correspondence test, Netherlands, 4,211 applications 2016 to 2018; predicted positive response 46% for natives, 35% for migrant background, 33% for non-Western background.",
    "Lancee, B. (2021). Ethnic discrimination in hiring: comparing groups across contexts. Results from a cross-national field experiment (GEMM). Journal of Ethnic and Migration Studies, special issue. 19,181 applications in six countries, of which 4,463 in the Netherlands, 2016 to 2018.",
    "Andriessen, I., Nievers, E., Faulk, L. and Dagevos, J. (2010). Liever Mark dan Mohammed? Sociaal en Cultureel Planbureau (SCP), The Hague. Correspondence and phone tests May to December 2008, 1,409 tests run and 1,342 valid, at low, middle and high function level.",
    "Baert, S. et al. (2021). Field experiment on the effect of an internship on the chance of an interview for graduates. Fictitious application pairs sent to real vacancies, Belgium. Published in a ScienceDirect education-economics journal.",
    "Mathematica. Do Employers Value Return Migrants? An Experiment on the Returns to Foreign Work Experience. Audit study with more than 8,000 fictitious resumes; not a Dutch sample.",
    "ResumeGo (2020). Cover letter study. ResumeGo, resume writing vendor, United States. 7,287 applications; callback 16.4% with a tailored cover letter, 12.5% with a generic one and 10.7% with none.",
    "Field experiment on study abroad and interview invitations (2026). Belgium, the Netherlands and Spain. 2,100 applications to 700 real starter vacancies for master's graduates in economics, data collected February to June 2023. Taylor & Francis journal.",
    "Kline, P., Rose, E. K. and Walters, C. R. (2022). Systemic discrimination among large U.S. employers. Quarterly Journal of Economics (NBER working paper w29053). 83,000 fictitious applications to the 108 largest U.S. employers; 24% contacted within 30 days.",
    "Intelligence Group (2026). Recruitment Kengetallen 2026. Intelligence Group, Netherlands. Time to hire of 44.5 days; sample of more than 4,000 per quarter.",
    "UWV (2025). Werkgeversonderzoek 2025. Employers survey, Netherlands, 3,551 employers; share of vacancies hard to fill: 45% overall, 44% in finance, 47% in ICT.",
    "Indeed Hiring Lab. Aggregate job postings index, Netherlands, daily, seasonally adjusted and not adjusted, indexed to 100 at 1 February 2020; series read to 18 September 2026.",
    "odds research notes (2026). Product requirements: principles for every rate, including ranges, named sources, labelling of non-Dutch data and the outcome log. odds, internal product notes.",
    "odds research notes (2026). Comparison with Glassdoor interview pages and salary data for the Netherlands, including a pay spot check on 29 September 2026. odds, internal method notes.",
    "odds research notes (2026). Review of Dutch hiring-discrimination field experiments (SCP 2010 and 2012, Blommaert et al. 2014, Panteia 2015 and 2019, Thijssen et al. 2019 and 2021, GEMM), including a search for Dutch tests of foreign degrees and foreign work experience. odds, internal method notes.",
    "MIT and NBER randomised controlled trial of writing assistance for job seekers (2023). Management Science. 480,948 job seekers; hire probability multiplied by 1.08.",
    "van der Bles, A. M., van der Linden, S., Freeman, A. L. J. and Spiegelhalter, D. J. (2020). The effects of communicating uncertainty on public trust in facts and numbers. Proceedings of the National Academy of Sciences, 117(14). Five experiments.",
    "Chen, Wang, Sadeh and Fang (2025). Missing Pieces: how uncertainty displays affect gig drivers' trust and reliance. ACM FAccT 2025. Longitudinal in-situ study of 51 gig drivers.",
    "TNO (2018). Werkverkenner 2.0, report R10279. TNO for UWV. Model of the probability that an unemployment benefit (WW) claimant finds a job within 12 months; n = 53,079; AUC 0.778, Brier score 0.191.",
    "Statistics Netherlands (CBS) (2026). Arbeidsdeelname; herkomst. CBS StatLine table 85456NED, Netherlands, annual 2025: unemployment 2.9% for Dutch origin, 5.5% for European origin and 6.6% for origin outside Europe.",
    "Andriessen, I., Nievers, E. and Dagevos, J. (2012). Op achterstand. Discriminatiemonitor, Sociaal en Cultureel Planbureau (SCP). Practice tests at temporary employment agencies: 460 valid in-person visits by 20 actors in 2011 and 263 online applications."
  ]
}

export default report
