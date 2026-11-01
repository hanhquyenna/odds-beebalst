import type { Report } from "../types"

const report: Report = {
  slug: "what-improves-callbacks",
  order: 3,
  title: "What improves the chance of a callback: internships, tailoring, referrals and fit",
  subtitle: "Each lever, the evidence behind it, its country and tier, and how far odds lets it move the number.",
  category: "Odds",
  minutes: 33,
  headline: { figure: "×1.5", line: "what a referral does to the chance of passing the first screen. A tailored letter is ×1.3, an internship ×1.1" },
  feeds: "Interview chance, what-ifs",
  art: "stairs",
  abstract: "Advice about winning job interviews is plentiful, but the evidence behind each piece differs in design, country and strength. This report reviews the levers that odds, a job finder for international graduates in the Netherlands, weighs when it estimates the chance of an interview per application: an internship, a tailored application, writing assistance, study abroad, a referral, and the two penalties linked to origin and foreign experience. For each it gives the design, country, sample and what the study does not show. It then sets the base rate from hiring software, 2.4% to 5.4% per application, beside Dutch callback rates of 18% to 54% for CVs written to fit the vacancy, tests the claim that the gap is five to ten times, and explains why coverage of a posting's requirements is shown as a fact and not multiplied. Only the internship rests on a field experiment in a neighbouring labour market; the tailored letter is a vendor test and the referral an aggregate. None of the sources isolates international graduates applying in the Netherlands. In the worked example the levers combine to a range of roughly 2% to 7%, labelled a proxy estimate.",
  findings: [
    "The base rate of an interview per application is 2.4% to 5.4%, because two large hiring-software funnels differ by a factor of about 2.3 and neither is Dutch [1, 2].",
    "An internship raises the interview chance by a multiplier of 1.126 in a Belgian field experiment, which is 2.7% to 6.1% when applied to the base range [3, 4].",
    "A tailored cover letter lifted callbacks from 12.5% to 16.4% (a multiplier of about 1.31) in a vendor test of 7,287 applications in the United States, so odds counts it only in the high end [5].",
    "A referral passed the first screen in 52% of cases against 35% overall (about 1.49) among 54 million applications, but that is an aggregate and not an experiment [1].",
    "CVs built to match the vacancy drew positive responses of 18% to 54% in a Dutch experiment of 4,211 applications, which is 3.3 to 22.5 times the funnel endpoints and wider than the 5 to 10 times quoted in odds' notes [4, 6].",
    "A study-abroad period had no effect on interview invitations in an experiment across Belgium, the Netherlands and Spain (2,100 applications), so odds awards no bonus for it [7]."
  ],
  sections: [
    {
      heading: "Introduction",
      blocks: [
        {
          type: "p",
          text: "Every international graduate who wants to work in the Netherlands eventually asks the same practical question: what can I do to be invited to an interview? The internet answers with confidence. Get an internship. Write a new cover letter for every vacancy. Find someone who will refer you. Each is probably right about something, but rarely comes with an account of how much, for whom and measured where. The question matters more for this audience than for most. Among research university (WO) international graduates of the 2022/23 cohort, Statistics Netherlands counts 30% as working in the Netherlands one year after graduating and 57% as having left, and among those who stayed 70% were working, against 84% of Dutch graduates [8]. A separate register-based study finds 25.3% of international graduates still living in the Netherlands five years after graduating [9]. Unemployment in 2025 was 2.9% for people of Dutch origin, 5.5% for European origin and 6.6% for origin outside Europe [10], and among hbo and wo graduates net labour participation was 83% for people born in the Netherlands and 77% for those born elsewhere [11]. An interview is the first step toward staying."
        },
        {
          type: "p",
          text: "odds is a job finder that turns a profile and a posting into a range for the chance of an interview per application, and into estimates of pay, net pay and permit fit. The interview range is the least certain of these, and it is built from two kinds of evidence that the product is careful never to blur. The first is a base rate: the share of applicants who were interviewed in some measured population. The second is a set of adjustments: the effect of one trait or action, ideally measured in a field experiment in which two otherwise identical applications were sent to real vacancies [4]. The number is the chance of an interview given this profile and this posting. It is not the chance of being hired, and it is not a score for the person."
        },
        {
          type: "p",
          text: "This report examines the adjustments that a person can influence, together with the two that they cannot, and it does so in the order in which a careful reader would ask about them. What is the design of the study behind each lever? In which country was it run, and on how many applications? How much weight does odds give it, and in which end of the range? What does the study not show? Two questions get extra attention. The first is the claim in odds' research notes that callback rates for CVs matched to a Dutch vacancy are five to ten times the rates in hiring-software funnels [4]. The second is why odds shows how many of a posting's requirements a candidate covers as a plain fact and never multiplies it into the number, although it is probably the strongest driver of all."
        },
        {
          type: "p",
          text: "The sections that follow describe the sources and their grades, establish the base rate, walk through each lever, explain how levers are combined and which end of the range each enters, examine the matched-CV evidence and the five to ten times claim, and describe the skills data behind the requirement checklist. Figures are given as ranges where sources disagree, and where two sources count the same thing differently the difference is stated. Nothing here is legal, tax or immigration advice; for permits and residence rules the official source is the Immigration and Naturalisation Service (IND)."
        }
      ]
    },
    {
      heading: "Data and sources",
      blocks: [
        {
          type: "p",
          text: "The evidence comes from four families of sources, and the differences between them are the reason the report exists. The first family is hiring-software funnels: aggregate counts from the applicant tracking systems that employers use to manage applications. SmartRecruiters reports on 89 million applications across 95 countries, with a separate figure for Germany [2]. Ashby reports on 54 million applications from global customers and on 180K jobs at scale-ups in Europe, the Middle East and Africa (EMEA) [1], and on a second, larger sample of 109 million applications and 247K jobs between January 2021 and March 2026 [12]. Employ reports on 6,640 customers [13] and Greenhouse on more than 6,000 companies [14]. None is a Dutch sample, and each is built from the customers of the vendor that publishes it."
        },
        {
          type: "p",
          text: "The second family is field experiments, and two designs appear. In a **correspondence test**, researchers send pairs or sets of fictitious applications to real vacancies. The applications are identical except for one trait, so any difference in how often employers respond can be attributed to that trait. An **audit study** uses the same logic with a larger set of fictitious resumes. The Dutch examples are the GEMM correspondence test, 4,211 applications between 2016 and April 2018 [6, 15]; the SCP practice tests of 2008, with 1,342 valid tests [16]; the CV-database experiments by Blommaert and colleagues [17] and by Panteia [18]. Outside the Netherlands the relevant experiments are the Belgian internship study [3], the audit study of foreign work experience [19], the three-country study-abroad experiment [7] and a large US experiment on 83,000 fictitious applications [20]."
        },
        {
          type: "p",
          text: "The third family is single studies that are not field experiments of this kind. A **vendor test** is an analysis published by a company that sells a related product; ResumeGo's test of cover letters is the example here [5]. A **randomised controlled trial** assigns real participants to treatment or control by chance; the MIT and NBER trial of writing assistance for 480,948 job seekers is the example [21]. An **aggregate** reports how two groups differ in a large data set without controlling who ends up in which group; the referral figure from Ashby is the example [1]. These designs answer different questions and are not equally strong."
        },
        {
          type: "p",
          text: "The fourth family is data that odds has collected or derived. It includes a pool of postings from public employer job boards, a list of skills by occupation from the European Commission's ESCO classification, a crosswalk to Statistics Netherlands' occupation groups, and a small archive of self-reported funnels from Reddit. The posting pool began with 321 Dutch postings from 16 employers on public job boards and was later extended with corporate employers to 1,636 postings [22]. The ESCO list was pulled on 30 September 2026 [23] and linked to the Dutch occupation groups with the BRC 2014 crosswalk [24]. The Reddit archive is the lowest grade of evidence and is never displayed [25]. Where a statement comes from odds' own calculation, it is cited as odds research notes [4, 26]."
        },
        {
          type: "p",
          text: "To keep these grades visible, odds labels each adjustment with a **tier**. An adjustment measured in a field experiment or randomised trial is labelled an experiment. A vendor's own test is labelled a vendor result. An aggregate that is not an experiment is labelled a benchmark proxy. The label matters because it controls how the adjustment is used: it decides whether the factor may enter the low end of the range, the high end, or both [4]. A lowest tier, for self-reports such as the Reddit archive, is used only to check the direction of the base range. The plan to replace borrowed multipliers with measured Dutch rates through an outcome log is described in the last section [27]."
        },
        {
          type: "p",
          text: "The reporting rules are simple. Every number comes from a named source or is plain arithmetic on such numbers, stated as such. Where two sources disagree, both are given. Ranges replace single points wherever a point would claim more than the evidence supports, which also accords with experiments on how people react to uncertainty [28, 29]. Effects are written as multipliers: a multiplier of 1.126 means a chance 12.6% higher than before, and one of 0.76 means a chance 24% lower."
        }
      ]
    },
    {
      heading: "The starting line: a base rate that two funnels cannot agree on",
      blocks: [
        {
          type: "p",
          text: "Every lever in this report multiplies a base rate, so the base rate has to be settled first, and it cannot be settled cleanly. No source publishes the share of applicants who are interviewed in the Netherlands. odds therefore uses the two most widely cited hiring funnels and prints both. SmartRecruiters reports that in Germany 5.4% of applicants were interviewed and 1.4% received an offer, and that globally the figures are 3.9% and 1.2% [2]. Germany is the European country figure the source gives, and odds uses it as a proxy for the Netherlands, not as a measurement of it."
        },
        {
          type: "p",
          text: "The second derivation is indirect. Ashby reports 170 applications per hire for business roles at EMEA scale-ups, and 81% of offers accepted [1]. One hire per 170 applications, divided by 0.81, gives 0.73% of applications ending in an offer. The SmartRecruiters global figures imply 3.25 interviews per offer (3.9% divided by 1.2%) [2]. Multiplying 0.73% by 3.25 gives about 2.4% of applications ending in an interview [4]. The steps are plain arithmetic, but they chain figures from two vendors with different customers and different definitions, which is why the result should be read as a bound and not as a measurement."
        },
        {
          type: "p",
          text: "The two derivations differ by a factor of about 2.3 (5.4% divided by 2.4%). The sources do not settle why, but two explanations are plausible and are given in odds' notes: \"interview\" means a phone screen in one data set and a scheduled round in the other, and the customer bases differ [4]. A third data point sits between them. A second Ashby analysis of 109 million applications reports that between 3.6% and 4.7% of applications reached an interview, depending on the type of role [12]. This figure is a direct count and not a chain, and it falls inside the 2.4% to 5.4% range. Ashby's technical roles need 254 applications per hire [1], and the same arithmetic as above gives about 1.6% (1 divided by 254, divided by 0.81, times 3.25). That is below the lower bound, and it is one reason why the base for technical roles is likely to sit toward the low end; the worked examples in this report use the business-role figure."
        },
        {
          type: "p",
          text: "Definitions matter at later stages too. Employ reports interview-to-offer conversion of 7% for small and medium businesses, 16.6% for mid-market firms and 72.2% for enterprise customers [13]. These describe a later stage than the base rate and differ tenfold between customer groups, so odds shows them only as a bucket label and never multiplies them in [4]. Greenhouse reports 183 applications per job in Europe [14], which says how crowded a vacancy is but not how many applicants are interviewed."
        },
        {
          type: "p",
          text: "There is also a small Dutch check in the opposite direction. From a Reddit archive harvested on 29 September 2026, odds extracted 277 self-reported funnel rows, of which 20 were high-confidence, meaning both the number of applications and the number of interviews were stated and there were at least ten applications. The median was 90 applications and 2 interviews, or about 1.5% per application, with an interquartile range of 0% to 10%; three non-EU finance and business rows gave about 10% and 14 technology rows about 1% [4, 25]. The sample is tiny and biased toward survivors, since people post when a search is going badly or has just worked. It sits just below the proxy range, the direction one would expect, and is used only for that check. {ref:fig-base} places these rates side by side."
        },
        {
          type: "ranges",
          id: "fig-base",
          caption: "Interview or response rates per application from the sources discussed in this section.",
          unit: "%",
          max: 12,
          items: [
            {
              label: "odds base range (Ashby chain to SmartRecruiters Germany)",
              low: 2.4,
              high: 5.4
            },
            {
              label: "Ashby direct count, by role type (109M applications)",
              low: 3.6,
              high: 4.7
            },
            {
              label: "Reddit self-reports, interquartile range (20 rows, median 1.5%)",
              low: 0,
              high: 10
            }
          ]
        },
        {
          type: "p",
          text: "A fourth type of number should not be confused with these. Kline, Rose and Walters sent 83,000 fictitious applications to 108 of the largest US employers and found that 24% of applications were contacted within 30 days [20]. That is a contact rate for carefully matched fictitious applications, in another country, at very large employers, and it is not a base rate for real applicants. It does, however, illustrate a pattern that returns later in this report: rates measured on applications built to fit tend to be several times higher than rates counted over everyone who applies."
        }
      ]
    },
    {
      heading: "Five levers and two penalties, one at a time",
      blocks: [
        {
          type: "p",
          text: "{ref:tbl-levers} lists every adjustment that odds knows about, with the four things that matter more than the size of the number: the design that produced it, the country, the tier, and what the study does not show. Read the country column first. Only the two origin rows come from Dutch field experiments, and they describe how employers react to a trait, not something a person can do. The things a person can do, which are the internship, the tailored application and the referral, are measured in Belgium, the United States and aggregated hiring software. That is not a reason to ignore them. It is a reason to hold them loosely."
        },
        {
          type: "table",
          id: "tbl-levers",
          caption: "The adjustments odds knows about, with their evidence.",
          head: ["Lever", "Effect", "Design, country and sample", "Tier", "What it does not show"],
          rows: [
            ["Internship", "Multiplier 1.126", "Field experiment, fictitious pairs to real openings, Belgium, graduates [3]", "Experiment", "Belgium, not the Netherlands; sample size not stated in odds' notes"],
            ["Tailored application", "Multiplier 1.31 (12.5% to 16.4%)", "Vendor test, 7,287 applications, United States [5]", "Vendor result", "A cover letter, not a CV; run by a vendor; American"],
            ["Writing assistance", "Multiplier 1.08 on hires", "Randomised trial, 480,948 job seekers, United States [21]", "Experiment", "Measures hires, not interviews; not used"],
            ["Study abroad", "Multiplier 1.00", "Correspondence test, 2,100 applications to 700 vacancies, Belgium, Netherlands, Spain [7]", "Experiment", "A period abroad, not a whole foreign degree; master's economics only"],
            ["Referral", "Multiplier 1.49 (screen pass 52% against 35%)", "Aggregate of 54 million applications, global customers [1]", "Benchmark proxy", "Screen pass, not interview; referred people may differ"],
            ["Non-native background, all levels", "Multiplier 0.76 (46% to 35%)", "Correspondence test, 4,211 applications, Netherlands [15]", "Experiment", "A name and origin effect only"],
            ["Non-native background, hbo/wo jobs", "Multiplier 0.93 (46% to 43%)", "Practice tests, 1,342 valid tests, Netherlands, data from 2008 [16]", "Experiment", "Old data; other Dutch studies find no shrinking"],
            ["Work experience mostly outside the EU", "Multiplier 0.88", "Audit study, more than 8,000 resumes, not Dutch [19]", "Experiment", "Overlaps with the origin effect"]
          ],
          note: "Multipliers apply to the interview chance per application. Tier is the label odds gives to the kind of evidence. Source: odds research notes [4] and the studies cited in the cells."
        },
        {
          type: "p",
          text: "{ref:fig-mult} shows the same eight numbers as a picture. No single lever moves the chance by more than about a half, and the two largest, the referral and the tailored letter, rest on the weakest designs."
        },
        {
          type: "bars",
          id: "fig-mult",
          caption: "Size of each adjustment, as a multiplier on the interview chance (1.00 means no change).",
          unit: "multiplier",
          items: [
            {
              label: "Non-native background, all levels (NL)",
              value: 0.76
            },
            {
              label: "Work experience outside the EU (not NL)",
              value: 0.88
            },
            {
              label: "Non-native background, hbo/wo jobs (NL, 2008)",
              value: 0.93
            },
            {
              label: "Degree or period abroad (BE, NL, ES)",
              value: 1.0
            },
            {
              label: "Writing assistance (hires, US)",
              value: 1.08
            },
            {
              label: "Internship (BE)",
              value: 1.126
            },
            {
              label: "Tailored application (US, vendor)",
              value: 1.31
            },
            {
              label: "Referral (aggregate, global)",
              value: 1.49
            }
          ],
          note: "Sources as in the previous table [4]."
        },
        {
          type: "h3",
          text: "Internship"
        },
        {
          type: "p",
          text: "Baert and colleagues sent pairs of fictitious graduate applications to real Belgian vacancies, with and without an internship on the CV, and recorded which drew an interview invitation [3]. odds records the gain as a multiplier of 1.126 and its notes also carry a range of 12.6% to 14.3%, of which the lower end is used [4]. It is the best-designed evidence among the things a person can do, and from the closest labour market with a result. Applied to the base range, 1.126 turns 2.4% into 2.7% and 5.4% into 6.1% (plain arithmetic), a gain of 0.3 to 0.7 percentage points per application. The gain is real but small next to the three-point width of the base range itself."
        },
        {
          type: "p",
          text: "What the study does not show matters as much. It does not show how much an internship counts with a Dutch employer. It does not show whether the effect is the same for an international graduate, whose internship may be in another country or in a different kind of role. The source notes available to odds do not state the number of applications, so the precision of the estimate cannot be judged. It gives a direction and a rough size, not a Dutch coefficient."
        },
        {
          type: "h3",
          text: "Tailored application"
        },
        {
          type: "p",
          text: "ResumeGo, a company that sells CV services, tested 7,287 applications in the United States in 2020. Callbacks were 16.4% with a tailored cover letter, 12.5% with a generic letter and 10.7% with none [5]. The ratio of tailored to generic is 16.4 divided by 12.5, or 1.31, which is the multiplier odds uses. Against no letter at all the ratio would be 1.53, and a generic letter against none gives 1.17 (plain arithmetic)."
        },
        {
          type: "p",
          text: "This is the weakest evidence among the levers, and the reasons are specific. A vendor that sells advice has an interest in finding that the advice works. The design is a test of cover letters, not of tailoring a CV, and it is American. The source notes available to odds do not describe how applications were assigned to the three conditions, nor what counted as a callback. For these reasons odds lets the tailored application enter only the high end of the range [4]. The evidence supports a likely benefit and no more precision than that."
        },
        {
          type: "h3",
          text: "Writing assistance"
        },
        {
          type: "p",
          text: "A randomised trial published in Management Science followed 480,948 job seekers in the United States, some of whom received help with writing their applications, and found a hire lift of 1.08 [21]. The design is strong, since people were assigned by chance and the sample is very large, but the outcome is hires, not interviews. A lift in hires could arise at the interview stage, at the offer stage or anywhere in between, and the trial as summarised cannot say where. Multiplying an interview estimate by a hire lift would confuse two different stages. odds therefore lists the result and does not use it."
        },
        {
          type: "h3",
          text: "Studying abroad and foreign degrees"
        },
        {
          type: "p",
          text: "Many international graduates worry that a degree or a period of study abroad will cost them interviews. One field experiment speaks to this. It ran from February to June 2023 in Belgium, the Netherlands and Spain, and was published in 2026. Its applications went to real starter vacancies for master's graduates in economics; some showed a period of study abroad and some did not. The result was no effect on interview invitations in any of the three countries, and so the multiplier is 1.00 [7]."
        },
        {
          type: "p",
          text: "The sources differ on the size of the experiment: one table records 2,100 vacancies, the fuller notes 2,100 applications to 700 real vacancies [4, 7]. The treatment was a study-abroad period and not a whole degree from a foreign university, and there was no origin manipulation, so the experiment does not test a foreign name and a foreign degree together. The notes add that a search in Dutch and English covering 2010 to 2026 found no Dutch correspondence test that isolates a foreign degree [4]. A separate survey experiment among employers is recorded with a positive direction for recognised foreign credentials in skilled jobs, but no size [4]. The honest summary is narrow: among master's economics starter jobs, showing time abroad did not change who was invited. It does not show that a foreign degree never matters."
        },
        {
          type: "h3",
          text: "Referral"
        },
        {
          type: "p",
          text: "Ashby reports that 52% of referred applications pass the first screen, against 35% across all applications in a sample of 54 million [1]. The ratio is 52 divided by 35, about 1.49. The figure is an aggregate from one vendor's customers, not an experiment. Referred people may differ from others in ways the data cannot see: they may be stronger candidates, or employers may screen referrals less strictly. A causal reading, that obtaining a referral would raise your own chance by this much, is not supported by the design."
        },
        {
          type: "p",
          text: "A second gap lies between the figure and its use. The 52% and 35% describe the first screen, while the interview estimate is a rate per application, which Ashby's own count puts between 3.6% and 4.7% [12]. Applying the screen ratio to the interview rate assumes that the advantage at the first screen carries through, which is plausible but unmeasured. odds' notes apply the referral factor only when a profile records a connection at the employer, and they do not say which end of the range it enters [4]. This report does not guess."
        },
        {
          type: "p",
          text: "Review sites also publish, per employer, the shares of interviewees who say they reached the interview by referral or by online application. These are shares among people who already got an interview, so \"applied online 58%\" is a channel mix of people who got through and not a chance of getting through by that channel [4]. It cannot give a referral lift without the number who applied by each channel."
        },
        {
          type: "h3",
          text: "Two penalties that cannot be acted on"
        },
        {
          type: "p",
          text: "Two rows of {ref:tbl-levers} lower the estimate instead of raising it, and they belong here because they interact with every lever above. The Dutch GEMM correspondence test found positive responses of 46% for native Dutch names and 35% for a migrant background, and 33% for non-Western origin [15]. The ratios are 35 divided by 46, or 0.76, and 33 divided by 46, or 0.72; the Western-minority figure of 38% gives 0.83 [6]. Across the 35 origin groups, the groups reported in the source range from predicted callbacks of 31% for Moroccan and 32% for Turkish names to 40% for Polish names, which did not differ significantly from the native rate [6]. The candidates were fictitious with Dutch education and a Dutch-language CV, so the ratios measure a name and origin effect and nothing else."
        },
        {
          type: "p",
          text: "Whether the gap shrinks at graduate level is where the Dutch studies part. The SCP practice tests from 2008 have the only clean split by function level: predicted invitation chances were 40% for natives and 32% for non-Western candidates at low level, 47% and 38% at middle level, and 46% against 43% at high (hbo/wo) level, a gap that is significantly smaller at the high level [16]. That gives 0.93 for graduate jobs. The GEMM authors find no such shrinking overall, apart from the one hbo-level relational occupation, account manager, in which Western and non-Western minorities are penalised equally [6]. The CV-database experiment of Blommaert and colleagues found 9.57 views per CV for Dutch-named against 6.36 for Arabic-named candidates, with no difference by education level [17]. The SCP and Panteia studies agree that the penalty is smaller when labour demand is tight and larger in customer-facing roles [16, 18]. Employers reported 45% of vacancies as hard to fill in 2025, 44% in finance and 47% in ICT [30], although no source links this directly to the size of the gap."
        },
        {
          type: "p",
          text: "The second penalty is about experience. An audit study of more than 8,000 fictitious resumes outside the Netherlands found a multiplier of 0.88 for mostly non-local work experience [19]. No Dutch study isolates foreign experience [4]. Because this employer reaction may be the same reaction that the origin effect measures, the two are not simply added together, as the next section explains."
        }
      ]
    },
    {
      heading: "How the levers combine: overlap, tiers and two bounds",
      blocks: [
        {
          type: "p",
          text: "Once the eight numbers exist, the temptation is to multiply them all. odds does not; its rules are short, and each has a reason [4]. The first is **overlap**. The origin effect and the foreign-experience effect plausibly measure the same employer reaction, so the low end of the range multiplies both (0.76 times 0.88 gives about 0.67), while the high end uses only one, the milder graduate-level 0.93. Using both in the high end would count one reaction twice, and the high end is meant to be the optimistic reading of the evidence, not a double penalty."
        },
        {
          type: "p",
          text: "The second rule is that **tier decides the bound**. A factor from a field experiment enters both ends. A vendor factor enters only the high end, because a vendor testing its own kind of advice has a reason to find an effect, and because a US result on 7,287 applications is thin support for a Dutch number. A measured Dutch rate from odds' own application log replaces the borrowed base entirely once a cell holds at least 30 logged applications [4, 27]. The third rule is that coverage of requirements is never a factor; it is the subject of the matched-CV section below. {ref:tbl-bounds} summarises which lever goes where."
        },
        {
          type: "table",
          id: "tbl-bounds",
          caption: "Which lever enters which end of the range.",
          head: ["Lever", "Multiplier", "Low end", "High end", "Reason"],
          rows: [
            ["Non-native background", "0.76 (0.93 at hbo/wo level)", "Yes, 0.76", "Yes, 0.93", "Dutch experiments; the graduate-level figure is the milder reading"],
            ["Work experience outside the EU", "0.88", "Yes", "No", "Overlaps with the origin effect, so never used alongside it in the high end"],
            ["Internship", "1.126", "Yes", "Yes", "Field experiment, closest labour market"],
            ["Tailored application", "1.31", "No", "Yes", "Vendor result, weakest evidence"],
            ["Study abroad", "1.00", "No change", "No change", "Measured no effect"],
            ["Writing assistance", "1.08 on hires", "Not used", "Not used", "Measures hires, not interviews"],
            ["Referral", "1.49", "Applied only with a connection", "Applied only with a connection", "Benchmark proxy; the notes do not name the bound"],
            ["Coverage of requirements", "No coefficient", "Shown as a fact", "Shown as a fact", "No calibrated coefficient exists"]
          ],
          note: "Source: odds research notes on the interview estimate [4, 26]."
        },
        {
          type: "p",
          text: "The worked example in odds' notes is an Indirect Tax Accountant role at Adyen, for an applicant from outside the EU with an internship, mostly non-EU work experience and a tailored application [26]. The low end takes the lower base, 2.4%, and multiplies by the combined penalty of 0.67 and the internship factor of 1.126: 2.4% times 0.67 times 1.126 is about 1.8%. The high end takes the upper base, 5.4%, and multiplies by 0.93, 1.126 and 1.31: 5.4% times 0.93 times 1.126 times 1.31 is about 7.4%. Displayed, this reads roughly 2% to 7% and carries the label proxy estimate. An earlier version showed 4.5% to 6.2%, which looked more confident only because it hid the disagreement in the base and the overlap [4]."
        },
        {
          type: "p",
          text: "The width of that result deserves attention. With all multipliers set to 1.00 the range would be 2.4% to 5.4%, three percentage points wide, and that width comes entirely from the disagreement between the two funnels. The levers stretch it to 1.8% to 7.4%, by pushing the low end down through the penalties and the high end up through the tailored letter (plain arithmetic on the example). {ref:art-scales} is an illustration of the overlap rule."
        },
        {
          type: "art",
          id: "art-scales",
          kind: "scales",
          caption: "A pair of scales on which two weights describe the same hesitation: the overlap rule counts such a reaction once in the high end, not twice."
        },
        {
          type: "p",
          text: "Stacking every lever produces very different numbers, which is why the rules exist. An illustrative calculation in odds' product notes multiplies 5.4% by 0.76, 1.31, 1.126 and 1.49 and obtains about 9% per application for someone who is referred, tailored, has an internship and is non-native; twenty such applications would then give an 85% chance of at least one interview [4]. The arithmetic is correct, but it assumes that every lever is independent, fully transferable to the Netherlands and applicable to every application. The cumulative formula, one minus the chance of no interview raised to the number of applications, also assumes independent draws. One person's applications share a CV, a permit situation and a level of Dutch, so outcomes are positively correlated and the formula overstates; odds labels it an upper bound."
        }
      ]
    },
    {
      heading: "Matched CVs: Dutch callback rates and the five to ten times claim",
      blocks: [
        {
          type: "p",
          text: "The GEMM correspondence test sent 4,211 applications to real Dutch vacancies between 2016 and April 2018, using fictitious candidates from 35 origin groups, and each application was written to fit its vacancy. Across everything, 38% drew a positive response (1,587 of 4,211) [6]. Split by occupation, the pooled rates for all applicants ran from 18% for administrative clerks to 58% for cooks, as {ref:fig-gemm} shows. Three occupations map to graduate hiring: software developer at 54%, account manager at 27% and administrative clerk at 18%. The occupations mix mbo and hbo level with no separate hbo split, and the figures pool natives and minorities, so they describe the experiment's candidates and not a typical job seeker."
        },
        {
          type: "bars",
          id: "fig-gemm",
          caption: "Positive response rate by occupation in the Dutch GEMM correspondence test, CVs matched to the vacancy, all applicants pooled.",
          unit: "% of applications",
          items: [
            {
              label: "Cook",
              value: 58
            },
            {
              label: "Software developer",
              value: 54
            },
            {
              label: "Hairdresser",
              value: 49
            },
            {
              label: "Plumber",
              value: 47
            },
            {
              label: "Carpenter",
              value: 46
            },
            {
              label: "Electrician",
              value: 45
            },
            {
              label: "Account manager",
              value: 27
            },
            {
              label: "Sales employee",
              value: 24
            },
            {
              label: "Receptionist",
              value: 23
            },
            {
              label: "Administrative clerk",
              value: 18
            }
          ],
          note: "Source: Thijssen, Coenders and Lancee (2019), 4,211 applications, 2016 to April 2018 [6]."
        },
        {
          type: "p",
          text: "The sources are not wholly consistent about this experiment. The cross-national GEMM paper counts 4,463 Dutch applications, not 4,211, and lists its Dutch occupations differently: cook 858, payroll clerk 712, software developer 637, sales representative 626, store assistant 505, receptionist 466, electrician 196, hairdresser 186, carpenter 168 and plumber 109, with no account manager. The positive-response share computed from its table is 45.6% [4, 31]. The notes do not reconcile the two papers, so the occupation rates indicate an order of magnitude and not precise values."
        },
        {
          type: "p",
          text: "{ref:tbl-ratio} sets the matched rates beside the funnel endpoints. odds' notes say matched-CV callbacks of 18% to 54% sit five to ten times above funnel rates of 2.4% to 5.4% and call the gap the fit effect in Dutch data [4]. The endpoint arithmetic is wider. The smallest possible ratio is 18% against 5.4%, or 3.3; the largest is 54% against 2.4%, or 22.5. The five to ten times figure is reproducible for one particular pairing: dividing by the upper funnel, 5.4%, gives 5.0 for account managers, 10.0 for software developers and 7.0 for the all-occupation rate of 38%, while administrative clerks fall outside at 3.3. Against the lower funnel the same three occupations give 11.3, 22.5 and 7.5 (plain arithmetic). \"Five to ten times\" is therefore a summary of a wide band, not a measurement."
        },
        {
          type: "table",
          id: "tbl-ratio",
          caption: "Matched-CV callback rates as multiples of the two funnel endpoints.",
          head: ["Group", "Matched-CV rate", "Divided by 5.4%", "Divided by 2.4%"],
          rows: [
            ["Software developer", "54%", "10.0", "22.5"],
            ["Account manager", "27%", "5.0", "11.3"],
            ["Administrative clerk", "18%", "3.3", "7.5"],
            ["All ten occupations, all applicants", "38%", "7.0", "15.8"],
            ["Native Dutch applicants, all occupations", "46%", "8.5", "19.2"]
          ],
          note: "Plain arithmetic on rates from Thijssen et al. [6, 15] and on the base range [4]."
        },
        {
          type: "p",
          text: "Why do matched CVs sit so far above funnel rates? The sources do not measure this, so what follows is a reading and not a finding. The funnels count everyone who applies, including applications that barely resemble the posting, and each vendor's own meaning of interview. The experiment counts only CVs designed to fit, and its positive response may be broader than a scheduled interview. The experiment ran in 2016 to 2018 and the funnels describe the 2020s; Indeed's index of Dutch postings stood at 114.3 in September 2026 against a peak of 172.6 in June 2022 (February 2020 = 100) [32]. The US experiment of Kline and colleagues found 24% contacted within 30 days, near the Dutch rates of 18% to 27% for graduate-level occupations [20]. The fit of the CV is probably the largest single difference between the two kinds of rate, but it cannot be separated from definition, era and population."
        },
        {
          type: "h3",
          text: "Why coverage is shown and never multiplied"
        },
        {
          type: "p",
          text: "Every other adjustment has a source: a field experiment, a vendor test or an aggregate. Coverage has none. odds' notes say that the coverage of a posting's requirements, for example 2 of 4, is probably what most decides an interview, and that no calibrated coefficient exists for it anywhere [4]. A multiplier invented to fill the hole would sit on the screen beside the others and be much weaker than any of them. A multiplier taken from the gap in {ref:tbl-ratio} would be worse, since 5.4% times 10 is 54%, and that would replace the base rate with the experiment's rate and count as real every difference between a designed CV and a typical one. Coverage also depends on how a requirement is written and read: a posting that asks for experience with financial reporting can be matched in five ways by five candidates, and one ratio hides all of that."
        },
        {
          type: "p",
          text: "odds therefore does two things with the experiment and stops. It prints a second line under the range, worded as \"If your CV matched this posting the way the experiment CVs did: about 18% to 54% by occupation\", which is not multiplied and not personalised. And it treats the gap as a bracket around the coverage effect, which stays a bracket until the application log measures it [4]. The log is organised in cells of occupation and fit tier, a measured rate is shown when a cell holds at least 30 entries, and ten occupations and three tiers make 30 cells and about 900 logged applications, or about 45 people who log about 20 applications each (plain arithmetic on the plan) [27]."
        }
      ]
    },
    {
      heading: "The skills data behind the checklist",
      blocks: [
        {
          type: "p",
          text: "Coverage is shown as a checklist, and the checklist draws on two data sets. The first is a pool of postings from which odds counts how often each requirement appears. In the original pool of 321 postings from 16 employers, Dutch was required in 35% of the 51 finance and business postings and 7% of technology postings, sponsorship or relocation was mentioned in 8% and 21%, about 76% of finance postings asked for five or more years, and junior titles made up 12% and 8% [22, 26]. In the extended pool of 1,636 postings, which adds corporate employers, the finance and technology samples (384 and 404 postings) give Dutch required in 20.6% and 10.4%, a visa mentioned in 2.1% and 8.7%, five or more years in 31% and 36%, and junior titles in 10.7% and 7.2% [22]. The shares moved a great deal with the pool. The earlier notes treated 35% as a floor for finance, yet the wider pool gives a lower share, if the definition was the same, which the notes do not confirm. Shares are exact for the pool and uncertain for the market, and when fewer than 30 postings exist for an occupation odds shows no percentages."
        },
        {
          type: "p",
          text: "The second data set is the ESCO list of skills by occupation. {ref:tbl-esco} shows a sample of what it holds. It answers what an occupation involves in a shared vocabulary, for example that the essential skills of an accountant include fraud detection, identifying accounting errors, interpreting financial statements and calculating tax [23]. It does not say how often postings name each skill; only counting postings does that. Optional skills vary widely between occupations, 321 for financial manager against 8 for online community manager, which reflects how ESCO models them, so essential skills should count for more [23]. Data engineer, cloud engineer and DevOps engineer are not ESCO occupations and are absent, and the Dutch register CompetentNL could not be obtained because it needs an access key that has not been requested [23]."
        },
        {
          type: "table",
          id: "tbl-esco",
          caption: "A sample of the ESCO skills list pulled by odds, with the Dutch occupation group each occupation is linked to.",
          head: ["ESCO occupation", "Essential skill links", "Optional skill links", "Dutch occupation group (BRC 2014)"],
          rows: [
            ["Accountant", "26", "31", "0411 Accountants"],
            ["Financial analyst", "15", "19", "0412 Financieel specialisten en economen"],
            ["Software developer", "23", "63", "0811 Software- en applicatieontwikkelaars"],
            ["Data analyst", "28", "17", "0811 Software- en applicatieontwikkelaars"],
            ["Financial manager", "12", "321", "0521 Managers zakelijke en administratieve dienstverlening"],
            ["Online community manager", "47", "8", "0311 Adviseurs marketing, public relations en sales"],
            ["All 66 occupations", "1,352", "3,317", "588-row crosswalk [24]"]
          ],
          note: "Source: ESCO pulled 30 September 2026 [23]; crosswalk to Statistics Netherlands' BRC 2014 [24]. 1,881 distinct skills, each in English and Dutch."
        },
        {
          type: "p",
          text: "The crosswalk shows the usual problems of joining classifications. Data analyst is linked to the software developer group, and other notes in the project say that business analyst and consultant titles map badly to their Dutch group. Only 828 of the 1,636 postings were mapped from title to ESCO to Dutch group in the last check [22, 23, 24]."
        }
      ]
    },
    {
      heading: "Discussion",
      blocks: [
        {
          type: "p",
          text: "Read together, the sources say three things with reasonable confidence and leave a fourth open. The first is direction. Every lever has a sign: an internship helps, a tailored letter helps, a referral helps, a foreign-sounding name and mostly foreign experience hurt, and studying abroad does neither. The second is that the effects are modest next to the base. The internship adds 0.3 to 0.7 percentage points to a per-application rate that the funnels place anywhere between 2.4% and 5.4%, so uncertainty about the base matters more than any single lever. The third is the relation between design and weight. The field experiments (internship, origin, study abroad) carry the most weight; the vendor test and the aggregate carry the least, and odds reflects that by the bound each may enter."
        },
        {
          type: "p",
          text: "The open question is fit. Both the Dutch matched-CV rates and the US contact rate suggest that applications built to fit a vacancy are answered several times more often than applications overall, but neither study measures how much of that is fit itself. This is where a proper model of individual odds would have to be tested. The one Dutch individual-level model in the sources, the UWV Werkverkenner, is built for a different outcome, a job within 12 months for 53,079 benefit claimants, and reports a Brier score of 0.191 and an AUC of 0.778 [33]. That score is the bar odds sets for calling its own rate measured [4]."
        },
        {
          type: "p",
          text: "Printing ranges is supported by experimental work on how people read uncertainty. In five experiments numeric ranges made no significant difference to trust in a number, while verbal hedges lowered it [28]; in a study of 51 gig drivers, adding hedging text to a range display reversed the gains in trust and reliance that the range had produced [29]."
        }
      ]
    },
    {
      heading: "Limitations",
      blocks: [
        {
          type: "p",
          text: "The main limit is transfer. None of the sources isolates international graduates applying in the Netherlands, and most levers come from Belgium, the United States or global vendor data. Effects measured on fictitious applicants are applied to real ones, and effects from separate studies are multiplied as if independent, which the overlap rule handles only for the origin and experience pair. Several designs are only partly described in the notes: the internship sample size, and the assignment and outcome definitions of the vendor test, are missing."
        },
        {
          type: "p",
          text: "The sources also disagree in small ways that this report has named and not resolved. The study-abroad experiment is described as 2,100 vacancies and as 2,100 applications to 700 vacancies. The Reddit harvest is described as 1,352 posts across ten subreddits in the method notes and as 1,678 posts across 13 subreddits in the harvest notes [25]. The method notes describe the high end of the origin penalty once as the larger of the two effects, 0.76, and in the worked example and data schema as 0.93; this report follows the worked example [4, 26]. The posting pool grew from 321 to 1,636 and the requirement shares moved with it. The Dutch origin studies differ in age, from 2008 to 2018, and the Panteia and Blommaert studies use CV databases, which are not applications to a vacancy [17, 18]."
        },
        {
          type: "p",
          text: "The ESCO version is presumed to be 1.2.1 and the licence text was not verified [23]. The referral evidence is an aggregate, the tailored-letter evidence a vendor test, and the Reddit rows a biased sample. The report describes evidence and how odds uses it; it is not legal, tax or immigration advice, and questions about permits and residence should go to the IND."
        }
      ]
    },
    {
      heading: "What this means for odds",
      blocks: [
        {
          type: "p",
          text: "Each lever appears in odds as a line beneath the range, with its multiplier, source, design, country and tier in plain words. Experiment-based factors move both ends, the vendor result moves only the high end, the writing-assistance result is listed and not used, the study-abroad zero is shown so graduates know a period abroad was neither penalised nor rewarded in that experiment, and coverage is shown as a fact with the share of similar postings that ask for each requirement. Under the range sits the matched-CV line, labelled as the ceiling that a fully matched CV points to in a Dutch experiment [4]."
        },
        {
          type: "p",
          text: "For a person, the practical reading is limited and deliberately so. Use the checklist as a to-do list and close the requirements that appear most often and that can be closed honestly. Treat an internship, a tailored letter or a referral as a direction with a rough size, read the caveat beside it, and keep the range in mind. Record every application and its outcome: each entry moves the fit effect a little closer to being measured, and the borrowed multipliers are replaced by Dutch rates once a cell reaches 30 entries [27]. Until then, every rate carries the label proxy estimate, and that label is the honest statement of how far the evidence goes."
        }
      ]
    }
  ],
  references: [
    "Ashby (2026). Talent Trends 2026: recruiting operations benchmarks. Ashby. 180K jobs at EMEA scale-ups (170 applications per hire for business roles, 254 for technical roles); 54 million applications from global customers (screen pass 35%, onsite pass 24%, offer acceptance 81%, referral screen pass 52%).",
    "SmartRecruiters (2025). Recruitment Benchmarks 2025 report. SmartRecruiters. Hiring-software funnel data, 89 million applications across 95 countries; Germany: 5.4% of applicants interviewed and 1.4% offered; global: 3.9% interviewed and 1.2% offered.",
    "Baert et al. (2021). Internship field experiment with graduates. Belgium. Fictitious application pairs sent to real vacancies, with and without an internship on the CV; multiplier on the interview chance 1.126.",
    "odds research notes, 2026, how the interview estimate is computed. Base rate derivation, table of adjustments with design, country, tier and caveat, overlap and bound rules, matched-CV line.",
    "ResumeGo (2020). Cover-letter test. United States. Vendor study, 7,287 applications: callbacks 16.4% with a tailored cover letter, 12.5% with a generic one, 10.7% with none.",
    "Thijssen, Coenders and Lancee (2019). Dutch arm of the GEMM correspondence test, Mens & Maatschappij 94(2). Amsterdam University Press. 4,211 applications, 35 origin groups, ten occupations at mbo and hbo level, data July 2016 to April 2018; overall positive response 38% (1,587 of 4,211); callbacks by occupation.",
    "Study-abroad field experiment (2026). Taylor & Francis. Correspondence test in Belgium, the Netherlands and Spain, data February to June 2023, 2,100 applications to 700 real starter vacancies for master's graduates in economics; no effect of a study-abroad period on invitations; no origin manipulation.",
    "CBS StatLine table 85776NED, Uitstromers ho; arbeidsmarktpositie na verlaten onderwijs. Statistics Netherlands, register data, cohort 2022/23 of research university (WO) international graduates one year after graduating.",
    "Nuffic (2025). Stay rate and labour market position of international graduates, 2013 to 2022 (CBS register data). Nuffic, Netherlands. Cohorts 2013-14 to 2018-19 for the five-year stay rate.",
    "CBS StatLine table 85456NED, Arbeidsdeelname; herkomst. Statistics Netherlands, annual figures 2025, all education levels.",
    "CBS StatLine table 84729NED, Arbeidsdeelname, herkomstlanden gedetailleerd. Statistics Netherlands, 2024, persons with hbo or wo education.",
    "Ashby (2026). Talent Trends 2026: recruiter productivity. Ashby. 109 million applications and 247K jobs, January 2021 to March 2026, global customers; applications to interview 3.6% to 4.7% by role type, 291 applications per hire.",
    "Employ (2026). 2026 hiring benchmarks (Jobvite, Lever and JazzHR customers). Employ Inc. 6,640 customers; interview to offer 7% (small and medium business), 16.6% (mid-market), 72.2% (enterprise).",
    "Greenhouse (2026). Recruiting benchmarks, Europe edition. Greenhouse Software. More than 6,000 companies; 183 applications per job in Europe.",
    "Thijssen, Coenders and Lancee (2021). Dutch correspondence test in the GEMM project, Journal of International Migration and Integration. 4,211 applications to real vacancies, 2016 to 2018: positive responses 46% for native Dutch, 35% for migrant background, 33% for non-Western origin.",
    "Andriessen, Nievers, Faulk and Dagevos (2010). Liever Mark dan Mohammed? SCP, Netherlands. Correspondence and telephone practice tests, May to December 2008, 1,409 tests of which 1,342 valid, across function levels low, middle and high (hbo/wo).",
    "Blommaert, Coenders and van Tubergen (2014). Discrimination of Arabic-named applicants in the Netherlands. Social Forces 92(3). Oxford University Press. 636 fictitious CVs on two online CV databases, 2011, three education levels.",
    "Panteia for the Ministry of Social Affairs and Employment (SZW) (2019). Herhaling virtuele praktijktests arbeidsmarktdiscriminatie. Netherlands. 707 fictitious CVs placed in online CV databases, 638 analysed, 2018 to 2019, six occupations at mbo 2 to 4 level.",
    "Mathematica audit study, Do Employers Value Return Migrants? Outside the Netherlands. More than 8,000 fictitious resumes; multiplier 0.88 for mostly non-local work experience.",
    "Kline, P., Rose, E. and Walters, C. (2022). Quarterly Journal of Economics (NBER working paper w29053). 83,000 fictitious applications to 108 of the largest US employers; 24% contacted within 30 days. Microdata openly available.",
    "MIT and NBER randomised controlled trial on writing assistance for job seekers (2023), published in Management Science. United States. 480,948 job seekers; hire lift of 1.08.",
    "odds collected postings, 29 and 30 September 2026. Public employer job boards (Greenhouse, Ashby, Lever) and Workday career sites in the Netherlands: 321 postings from 16 employers, extended to a pool of 1,636 postings with corporate employers.",
    "European Commission (2026). ESCO, European Skills, Competences, Qualifications and Occupations, REST API, pulled 30 September 2026. 66 occupations, 1,352 essential and 3,317 optional skill links, 1,881 distinct skills in English and Dutch; site states version 1.2.1 (last update 10 December 2025).",
    "CBS (2025). Beroepenindeling ROA-CBS 2014 (BRC 2014), editie 2025, crosswalk from ISCO-08 to beroepsgroep, segment and klasse. Statistics Netherlands, 588 rows.",
    "odds research notes, 2026, self-reported Dutch application funnels. Posts and comments from public Reddit archives (Arctic Shift), harvested 29 September 2026; 277 extracted rows, 20 high-confidence rows with at least 10 applications.",
    "odds research notes, 2026, worked example: Indirect Tax Accountant role at Adyen, applicant from outside the EU with an internship, non-EU experience and a tailored application.",
    "odds research notes, 2026, outcome log plan: cells of occupation by fit tier, a measured rate shown when a cell holds at least 30 entries, about 900 logged applications for 10 occupations and three tiers.",
    "van der Bles, van der Linden, Freeman and Spiegelhalter (2020). Study of how communicating uncertainty affects trust in numbers and in their source. Proceedings of the National Academy of Sciences (PNAS) 117(14). Five experiments.",
    "Chen, Wang, Sadeh and Fang (2025). Missing Pieces (study of range and hedged displays of estimates). ACM FAccT 2025. 51 gig drivers, longitudinal study comparing mean-only, range and range-with-hedging displays.",
    "UWV (2025). Werkgeversonderzoek 2025. Netherlands. 3,551 employers; hard-to-fill vacancies 45% overall, 44% in finance, 47% in ICT.",
    "Lancee et al. (2021). Ethnic discrimination in hiring: comparing groups across contexts. Results from a cross-national field experiment. Journal of Ethnic and Migration Studies, special issue. Harmonised correspondence test, 19,181 applications in total, 4,463 in the Netherlands, 30 July 2016 to 1 June 2018.",
    "Indeed Hiring Lab (2026). Aggregate job postings index, Netherlands, daily, February 2020 to September 2026 (February 2020 = 100). Published under CC BY 4.0. Peak 172.6 in June 2022; 114.3 in September 2026.",
    "TNO (report R10279), Werkverkenner 2.0, model for the Dutch benefits agency UWV. 53,079 unemployment benefit claimants, job within 12 months; AUC 0.778, Brier score 0.191."
  ]
}

export default report
