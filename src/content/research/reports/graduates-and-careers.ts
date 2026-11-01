import type { Report } from "../types"

const report: Report = {
  slug: "graduates-and-careers",
  order: 7,
  title: "After the degree: where international graduates stay and where careers go",
  subtitle: "Register outcomes for graduates, what changing jobs has paid, and the career moves people in similar roles actually made.",
  category: "Careers",
  minutes: 32,
  headline: { figure: "30%", line: "of international graduates worked in the Netherlands a year after leaving" },
  feeds: "Careers",
  art: "thread",
  abstract:
    "International graduates of Dutch universities are the people odds was built for, yet what happens to them after the degree is usually reduced to one figure or one encouraging line. This report brings together Dutch register statistics, a Nuffic study of 240,845 graduates, labour statistics by origin, a Flemish dataset of career records and two Dutch studies of wage growth at a job change. One year after leaving, between 43% and 57% of international graduates are still registered in the country, depending on the source, and about 30% of university leavers are working here. Among those who remain, the employment gap to classmates is about 14 points, and may be smaller. Staying varies with origin, field and city. The career records show that no single next job dominates, and the wage studies show that changing employer has paid more than staying, by an amount that depends on age, period and definition. The report explains how odds draws a career path from these sources.",
  findings: [
    "One year after leaving university, about 30% of international graduates (cohort 2022/23, 21,400 people) were working in the Netherlands and about 57% were no longer in the population register [1].",
    "The one-year stay rate is 43.4% in the CBS register and 56.6% in the Nuffic study for the same cohort, a gap we could not reconcile, while at five years the two sources are close at 25.3% to 32.0% [1, 2].",
    "Among university leavers still registered a year on, about 70% of international graduates and 84% of other graduates had work, a gap of about 14 points that CBS warns may be overstated [1].",
    "Five years after graduation the stay rate was 20.3% for graduates from the EEA and 38.5% for graduates from outside it, and it ran from 12% in Maastricht to 49% in Eindhoven [2, 3].",
    "For financial analysts in Flemish career records the most common next job, financial controller, takes only 10.8% of recorded moves, and the typical time in the job is 8 to 15 quarters across five roles [4, 5].",
    "One-year gross monthly wage growth in 2006 to 2011 was 3.6% for stayers and 6.8% to 9.7% for people who changed employer, occupation or both, and a 2025 study finds about 1 percentage point of extra hourly wage growth at a switch in a tight market [6, 7].",
  ],
  sections: [
    {
      heading: "Introduction",
      blocks: [
        {
          type: "p",
          text: "Someone who studies in the Netherlands without having grown up here faces three questions about the years after the degree. Will I still be here in a year, and will I have work? Where do people in a role like mine go next? And does changing employer pay? Each has data behind it and none has a single clean answer, so the honest way to use the evidence is to say which group was measured, when, by whom and with what definition.",
        },
        {
          type: "p",
          text: "The audience is not small. In 2025-26 the Netherlands had 129,764 international degree students, 16.8% of all 771,757 students, of whom 93,653 came from the EEA and 36,017 from outside it; the total was 133 lower than a year earlier, the first non-increase in 20 years [8]. The statistics office (CBS) reports 130,190 from the same DUO enrolment base, rounded to ten and slightly wider in scope [9].",
        },
        {
          type: "p",
          text: "odds is a job finder for international graduates. For each job it estimates the chance of an interview, the pay, the net pay and the fit with the permit route, from sourced data. The register outcomes for this group are sobering, and a line of encouragement has no source, so odds prints the register outcomes with their source and year in place of a motivational line [10]. This report is the long version of that choice, and of the career path odds draws on each job. A graduate counts as staying if still registered at a Dutch address, whether or not employed, and left means no longer registered. The registers do not say where a person went or why, so '57% left' does not mean '57% failed'.",
        },
        {
          type: "p",
          text: "Section 2 describes the sources. Section 3 sets out what registers show one and five years after graduation, including a disagreement between two careful sources. Section 4 asks who stays and what labour statistics by origin add. Section 5 turns to career moves in a Flemish dataset, and Section 6 reviews what changing employer has paid in the Netherlands. The last three sections discuss the evidence, its limits and what it means for the career path odds draws.",
        },
      ],
    },
    {
      heading: "Data and sources",
      blocks: [
        { type: "h3", text: "Registers of graduates" },
        {
          type: "p",
          text: "The main register source is CBS StatLine table 85776NED, which follows people who leave higher education and records their labour-market position at fixed points from directly after leaving up to ten years later [1]. A leaver is a person with a full-time enrolment in funded higher education on 1 October who is no longer enrolled in funded education a year later. Position is recorded as work with or without a benefit, no work with or without a benefit, back in education, or not registered in the population register (BRP) on 1 October. An international student has a non-Dutch nationality and did not complete prior education in the Netherlands. CBS rounds counts to tens, so the shares odds computes are approximate. Cohort 2022/23 is the latest with a one-year measurement and 2018/19 the latest with five years [1]. CBS warns that international students who leave do not always deregister from the BRP at once, which can overstate the number of leavers who appear to be in the country without work, and advises that trends are read from non-international students [1].",
        },
        {
          type: "p",
          text: "The second source is the Nuffic study by Arat, Slappendel-Henschen and Pronk (May 2025), in which ABF Research linked education registrations (DUO) to the population register, tax records and employee insurance records (UWV) through CBS, for 240,845 international graduates in ten cohorts from 2013-14 to 2022-23 [2]. A stayer is someone still registered at a Dutch address on 31 December, one to five years after the graduation year, whatever the person's employment status. Since about 70% of degrees are awarded in June to August, the first measurement falls roughly half a year after graduation for most. Graduates never registered in the BRP cannot be linked, and the study counts them as not staying [2].",
        },
        { type: "h3", text: "Labour statistics by origin" },
        {
          type: "p",
          text: "Register tables describe graduates. For the wider labour market by origin we use four further CBS tables: 85456NED on participation and unemployment by region of origin [11], 84729NED on participation of people with hbo or university (wo) education by country of origin [12], 85266NED on participation by education level [13] and 85312NED on duration of unemployment [14]. The first is built on the Labour Force Survey, a sample survey. None of the four describes graduates of Dutch universities specifically, and CBS has no table we could find that crosses education, origin and the unemployment rate [15].",
        },
        { type: "h3", text: "Career records" },
        {
          type: "p",
          text: "Next-job evidence comes from JobHop, a public dataset from Ghent University built from the resumes of people registered with VDAB, the public employment service of Flanders in Belgium [5]. The first release used about 360,000 resumes; the second contains 355,315 trajectories and 1,993,291 work-experience entries [16]. odds counted transitions in the first release, which holds 333,096 careers with dated roles [4]. Its limits are set out in Section 5 [17].",
        },
        { type: "h3", text: "Wage and mobility studies" },
        {
          type: "p",
          text: "The wage and mobility studies are introduced in Section 6. Where two sources disagree, odds does not choose one: it shows a range and names both. Each statistic also carries a label for how far odds leans on it, for example register pay high, next-role shares medium, and the switch premium marked dated for the CBS study and current for the CPB study [18]. Shares described as computed are odds' own arithmetic on published counts.",
        },
      ],
    },
    {
      heading: "One and five years after graduation: what the registers show",
      blocks: [
        {
          type: "p",
          text: "{ref:tbl-outcomes} gives the position of university and HBO leavers one year after leaving, cohort 2022/23. Of 21,400 international students who left university with a diploma, 30.3% were working in the Netherlands, 8.0% were in the country with neither work nor benefit, 4.8% were back in education and 56.6% were no longer in the population register [1]. The picture is similar for 5,710 international HBO leavers (33.3% working, 55.7% not registered) and for the previous cohort, 2021/22 (31.3% and 56.5% for university leavers).",
        },
        {
          type: "table",
          id: "tbl-outcomes",
          caption: "Position one year after leaving higher education with a diploma, cohort 2022/23, by international status",
          head: ["Group", "Leavers", "With work", "Neither work nor benefit", "Back in education", "Not registered", "Work among those registered"],
          rows: [
            ["University, international", "21,400", "30.3%", "8.0%", "4.8%", "56.6%", "70%"],
            ["University, other", "45,180", "80.5%", "4.2%", "10.2%", "3.8%", "84%"],
            ["HBO, international", "5,710", "33.3%", "7.2%", "3.3%", "55.7%", "75%"],
            ["HBO, other", "51,800", "89.4%", "3.5%", "3.9%", "1.8%", "91%"],
          ],
          note: "Shares computed by odds from CBS counts rounded to ten (CBS StatLine 85776NED). Rows do not add to 100 because of rounding and a small group without work who receive a benefit. The last column is the working share divided by the share registered.",
        },
        {
          type: "p",
          text: "To compare people who are actually in the country, odds divides the working share by the share still registered. For international university leavers that is 0.303 divided by (1 minus 0.566), about 70%; for other university leavers about 84%, so the gap among those registered is 14 points. The HBO figures are 75% and 91%, a gap of about 16 points (plain arithmetic on the CBS shares). Among international university leavers who stayed, about 18% had neither work nor benefit and about 11% were back in education, against about 4% and 11% among other leavers [1].",
        },
        {
          type: "p",
          text: "This comparison needs care. CBS warns that some international students who have left remain registered for a while, so part of those counted as registered without work are in practice abroad [1]. If so, the true employment rate among people really living here is higher than 70% and the gap is smaller than 14 points. The table cannot say by how much, which is why odds quotes the 14 points as a description of the registered group, not as a measured difference in job-finding.",
        },
        {
          type: "p",
          text: "The Nuffic study finds a larger early gap that narrows with time. One year after graduation 41.8% of staying international graduates had a paid job, against 64.9% of Dutch graduates; five years after, 79.6% against 89.6%. The gap falls from 23.1 to 10.0 points (plain arithmetic) [2]. The two sources are not directly comparable: the Nuffic measure counts paid work among everyone registered, including the 29.8% of year-one stayers pursuing further study and the 28.4% not working, and its cohorts are 2013-14 to 2018-19 [2]. They agree on the direction: international graduates who stay take longer to find work, and the difference shrinks the longer they stay.",
        },
        {
          type: "p",
          text: "The early position has improved over time. In an earlier Nuffic study of cohorts 2006-07 to 2015-16, 34.4% of stayers were employed after one year and 73.5% after five [19]. Nuffic quotes a SEO study finding that the time a research-university graduate needed to find a substantial job fell from almost 10 months in 2014 to about 3 months, although international graduates still needed longer and earned less [20].",
        },
        {
          type: "p",
          text: "How many stay at all? Pooling cohorts 2013-14 to 2018-19, Nuffic finds 42.1% of international graduates still living in the Netherlands one year after graduation, then 35.3%, 30.1%, 27.1% and 25.3% at years two to five; 25.3% is 30,020 people [2]. Earlier research found that 75% to 80% were no longer in the country five years on [2, 21]. The recent trend is upward: the one-year rate was 43.9% for cohort 2013-14, fell to 39.7% for 2017-18 and then rose in every cohort to 56.6% for 2022-23, and the five-year rate was 23.5% for 2013-14 and 30.4% for 2018-19 (7,325 people against 3,835) [2].",
        },
        {
          type: "p",
          text: "Nuffic cautions that part of the rise may be a change in how well graduates can be tracked. The share of international graduates with a BRP registration at graduation rose from 62.5% in cohort 2017-18 to 80.2% in 2018-19 and 89.0% in 2022-23, and graduates without a BRP number cannot be linked, so they count as not staying. The report cannot give a proven explanation for the jump [2]. The upward trend is real in the measured data, but its size as a change in behaviour is uncertain.",
        },
        {
          type: "p",
          text: "At one year the two main sources give different answers for the same cohort. Nuffic finds 56.6% of graduates of 2022-23 still in the country; CBS finds 43.4% of international university leavers of 2022/23 still registered. At five years they are close: 25.3% pooled and 30.4% for 2018-19 in Nuffic, and 32.0% for the 2018/19 university cohort in CBS [1, 2]. {ref:fig-stayrange} shows both as ranges.",
        },
        {
          type: "ranges",
          id: "fig-stayrange",
          caption: "Share of international graduates still in the Netherlands, lowest and highest source estimate",
          unit: "% of graduates",
          max: 100,
          items: [
            { label: "One year after graduating (cohort 2022/23)", low: 43.4, high: 56.6 },
            { label: "Five years after graduating", low: 25.3, high: 32.0 },
          ],
          note: "One year: CBS StatLine 85776NED (low, university leavers) and Nuffic 2025 (high, all graduates). Five years: Nuffic 2025 (low, cohorts 2013-14 to 2018-19 pooled; 30.4% for 2018-19) and CBS StatLine 85776NED (high, university leavers, 2018/19).",
        },
        {
          type: "p",
          text: "We could not reconcile the year-one gap, but the definitions differ in ways that point the same way. Nuffic treats as stayers those who continue to another Dutch programme (29.8% of its year-one stayers were pursuing further study), whereas CBS leavers are by construction people no longer enrolled in funded education a year later [1, 2]. The date differs too: CBS looks on 1 October a year after leaving, Nuffic on 31 December, which for most graduates is about half a year after the degree. CBS's warning about late deregistration cannot explain why its figure is the lower one. We have not recomputed either table to test these explanations. The CBS share that left, 56.6%, equals the Nuffic share that stayed, a coincidence and not a finding. odds shows the range, 43% to 57%, for year one.",
        },
      ],
    },
    {
      heading: "Who stays, and how origin shapes work",
      blocks: [
        { type: "h3", text: "Origin and nationality" },
        {
          type: "p",
          text: "The strongest pattern in the Nuffic data is origin. Five years after graduation the stay rate was 38.5% for non-EEA graduates and 20.3% for graduates from the EEA (the UK counted as EEA because the cohorts predate Brexit); one year after it was 55.1% and 37.3% [2]. A Nuffic fact sheet prints 30% and 39% for the five-year rates, while the full report, which odds uses, prints 20.3% and 38.5% [22]. Because far more EEA than non-EEA students study here (92,216 against 35,596 diploma students in 2023-24), EEA stayers outnumber non-EEA stayers despite the lower rate [2].",
        },
        {
          type: "p",
          text: "Among nationalities with at least 300 graduates, five-year stay rates run from 78.7% for Suriname (425 stayers), 70.8% for Iran, 57.8% for Ukraine, 52.2% for Turkiye and 49.6% for India (1,245 stayers) down to 35.2% for China (2,690 stayers); Germany and Italy are not in the top 15 [2]. CBS gives a cross-check by origin for 2022/23 university leavers, though its origin groups include Dutch-educated people of foreign origin. Of 17,170 leavers of European origin (outside the Netherlands), 32.6% were working in the country and 54.3% were not registered; of 14,700 leavers of origin outside Europe, 59.5% and 23.9%; for Dutch origin, 82.1% and 2.9% [1]. The direction matches Nuffic's. The registers do not say why, and the earlier ROA research Nuffic cites points the same way [21].",
        },
        { type: "h3", text: "Field of study and city" },
        {
          type: "p",
          text: "Field of study moves the stay rate about as much as origin. {ref:tbl-field} sets CBS register shares computed by odds for international university leavers beside Nuffic's five-year stay rates for research-university graduates.",
        },
        {
          type: "table",
          id: "tbl-field",
          caption: "Share of international graduates still registered in the Netherlands, by field of study",
          head: ["Field", "CBS: one year on (2022/23)", "CBS: five years on (2018/19)", "Nuffic: five years on, research universities"],
          rows: [
            ["All fields", "43.4%", "32.0%", "25.3% (all types, not split)"],
            ["Engineering", "57.9%", "43.3%", "40.9%"],
            ["Natural sciences", "51.9%", "39.0%", "37.2%"],
            ["Healthcare", "46.1%", "31.8%", "25.9%"],
            ["Agriculture and natural environment", "45.5%", "29.6%", "27.0%"],
            ["Language and culture", "43.9%", "29.0%", "23.0%"],
            ["Economics", "43.3%", "32.4%", "22.6%"],
            ["Behavioural and social sciences", "38.5%", "28.6%", "18.6%"],
            ["Interdisciplinary", "34.3%", "27.3%", "25.0%"],
            ["Law", "29.6%", "22.4%", "17.0%"],
          ],
          note: "CBS columns: university diploma holders who are international students, share still in the BRP, computed by odds from CBS StatLine 85776NED. Nuffic column: cohorts 2013-14 to 2018-19 pooled, from Nuffic 2025. Field names were matched between the sources; Nuffic's education field (105 stayers) is omitted as too small.",
        },
        {
          type: "p",
          text: "Engineering has the highest rate and law the lowest in both sources, which is reassuring because they are independent measures. The five-year levels differ, and most Nuffic rates sit below the CBS shares (economics 22.6% against 32.4%), because Nuffic pools six cohorts while the CBS column is the single 2018/19 cohort, which Nuffic identifies as the one with the highest five-year rate [1, 2]. For universities of applied sciences Nuffic's rates run from 2.9% for behavioural and social sciences (85 stayers) to 52.9% for education (405 stayers) [2].",
        },
        {
          type: "p",
          text: "City of study shows a similar spread. For cohorts 2014-15 to 2018-19 the five-year stay rate was 49% for Eindhoven, 39% for Delft, 37% for Utrecht and 12% for Maastricht [3]. Nuffic notes that Maastricht graduates often stay just across the border, so a register of the Netherlands sees them as gone while they may live a few kilometres away [2]. City, field and nationality overlap, so the city figures are not separate causes.",
        },
        { type: "h3", text: "What stayers earn and where they work" },
        {
          type: "p",
          text: "Nuffic reports that 80% of stayers have paid work five years on. Their average gross annual salary (employed stayers, one full-time year, indexed to 2023) was 38,622 euro one year after graduation and 54,540 euro five years after; research-university graduates averaged 56,098 euro (EEA) and 58,372 euro (non-EEA), applied-sciences graduates 47,150 and 46,869 euro. The share earning 65,000 euro or more was 33.9% in economics and 8.9% in language and culture. Compared with Dutch graduates, stayers are more often in information and communication (9.1% against 6.7%) and finance (6.5% against 4.0%) and far less often in government, education and healthcare (17.9% against 38.6%) [2].",
        },
        {
          type: "p",
          text: "These averages leave out everyone who left and everyone without a job, so they describe what stayers earn, not what a graduate can expect.",
        },
        { type: "h3", text: "Unemployment and participation by origin" },
        {
          type: "p",
          text: "CBS labour statistics by origin do not describe graduates, but they show a consistent direction. {ref:tbl-origin} gives the main figures.",
        },
        {
          type: "table",
          id: "tbl-origin",
          caption: "Unemployment and net participation by origin, all education levels (2025) and higher-educated people (2024)",
          head: ["Origin group", "Unemployment, 2025", "Net participation, 2025", "Net participation, hbo or wo, 2024"],
          rows: [
            ["Dutch origin", "2.9%", "74.5%", "83.6%"],
            ["Europe, excluding the Netherlands", "5.5%", "72.9%", "78.5%"],
            ["Outside Europe", "6.6%", "69.0%", "76.8%"],
            ["Born abroad, European origin", "6.0%", "74.0%", "77.4%"],
            ["Born abroad, origin outside Europe", "6.7%", "62.8%", "71.5%"],
          ],
          note: "CBS StatLine 85456NED (annual 2025, all education levels, ages 15 to 75) and 84729NED (2024, hbo or wo). The last column aggregates 242 countries to continents by odds and is validated only to within about 1 percentage point.",
        },
        {
          type: "p",
          text: "In 2025 the unemployment rate was 2.9% for people of Dutch origin, 5.5% for people of European origin and 6.6% for people of origin outside Europe. The gap between Dutch origin and non-European origin was 7.6 points in 2013 and 3.7 points in 2025, so it has narrowed, though it remains; in 2019 the rates were 3.7%, 5.6% and 7.5%. Among people with a startkwalificatie, the closest available proxy for being qualified, the 2025 rates were 2.6%, 5.2% and 5.3%, a gap of 2.7 points for origin outside Europe (plain arithmetic) [11].",
        },
        {
          type: "p",
          text: "A narrower measure is net participation among people with hbo or university education in 2024: 82% overall, 83% for people born in the Netherlands and 77% for those born outside it, with 26% of the employed born abroad on flexible contracts against 17% of those born here [12]. By country of origin the figures ranged from Syria 56% and Ukraine 64% to Germany 78%, India 84% and South Africa 88%, for everyone of that origin with hbo or wo, of all ages and wherever educated, not recent graduates. As a baseline for all origins in 2025, hbo and wo participation was 82.6% and unemployment 3.1% [13]. CBS publishes no unemployment rate for higher-educated people by origin, so we quote none [15]. Duration exists only without an origin split: in 2025, of 134,000 unemployed higher-educated people, 51% had been unemployed for less than three months and 14% for twelve months or more [14].",
        },
      ],
    },
    {
      heading: "Where careers go next: what Flemish career records show",
      blocks: [
        {
          type: "p",
          text: "The record of next jobs comes from JobHop, released by researchers at Ghent University from resumes provided by VDAB. Each job entry was turned into a standard occupation code from ESCO, the European occupation list, with dates rounded to the quarter. The first release used a small language model to read the resumes and a proprietary classifier to assign codes, and its authors later cleaned it by tagging ambiguous titles as unknown [5, 17]. The second release redesigned the pipeline, and a language-model judge preferred its extractions on 68.3% of 1,000 resumes against 29.9% for the first [16, 17]. odds' counts rest on the first release. The description already carries four warnings, which odds repeats wherever the numbers appear.",
        },
        {
          type: "list",
          items: [
            "**Flemish, not Dutch.** The language is mostly the same (91.4% of the resumes behind the larger corpus were in Dutch), but the country, employers and labour rules differ. odds labels these numbers 'Flemish careers' [17].",
            "**Job seekers, not the workforce.** These are people who registered with a public employment service and uploaded a resume. The authors say the corpus over-represents job seekers and should not be read as a sample of the Flemish or Belgian workforce [17].",
            "**Self-reported titles, read by software.** In the second release 6.9% of entries could not be matched and are marked unknown, and the authors state that no systematic quantitative audit of ESCO label accuracy has been published [17].",
            "**Descriptive, not personal.** The authors advise against using models trained on the data as the decisive basis for high-stakes decisions about individuals, because the records reflect how the labour market has treated people in the past [17]. odds uses the data to describe what happened to others and never to score a user.",
          ],
        },
        {
          type: "p",
          text: "odds has worked through five starting roles. For each it counted every stretch of time a person spent in that occupation, how many stretches were followed by another recorded job, and the middle value of how long the stretch lasted. There are 6,260 stretches in total, and 4,242 of them (68%) were followed by another job [4]. {ref:tbl-jobhop} gives the results.",
        },
        {
          type: "table",
          id: "tbl-jobhop",
          caption: "Stretches in five starting roles, typical time in the role and the most common next job",
          head: ["Starting role", "Stretches", "Followed by a recorded job", "Median time in the role", "Most common next job", "Twelve most common together"],
          rows: [
            ["Financial analyst", "568", "398 (70%)", "11 quarters", "Financial controller, 10.8%", "35%"],
            ["Accountant", "2,916", "1,949 (67%)", "10 quarters", "Accounting assistant, 12.3%", "53%"],
            ["Business analyst", "535", "392 (73%)", "15 quarters", "ICT operations manager, 11.0%", "47%"],
            ["Software developer", "1,556", "1,037 (67%)", "12 quarters", "Software analyst, 7.0%", "31%"],
            ["Data analyst", "685", "466 (68%)", "8 quarters", "Software analyst, 3.6%", "23%"],
          ],
          note: "JobHop first release (Ghent University and VDAB), counted by odds. Shares are of recorded moves. The median is the point at which half the stretches were shorter and half longer; four quarters make a year.",
        },
        {
          type: "p",
          text: "The typical time in a role runs from 8 quarters (2 years) for data analysts to 15 quarters (3.75 years) for business analysts. The median hides a wide spread: for financial analysts a quarter of people moved on within 1 year and three quarters within 5 years, so the middle value of 2.75 years sits inside a range from one year to five or more [4]. Some people are still in the job when their record ends and some records simply stop, and the data cannot separate these cases, so odds counts only recorded moves.",
        },
        {
          type: "p",
          text: "When the moves are shared out, no single destination dominates. For financial analysts the top next job is financial controller with 43 of 398 moves (10.8%), followed by accountant (3.8%), administrative assistant (3.3%), financial manager (3.0%) and accounting analyst (2.8%); the twelve most common destinations together cover 140 of 398 moves, about 35% [4]. For accountants the leaders are accounting assistant (12.3%), bookkeeper (10.7%) and accounting manager (7.7%), and odds' notes judge that accounting assistant is mostly title noise, a difference in how the same kind of job is named and matched, not a demotion [18].",
        },
        {
          type: "p",
          text: "Business analyst shows the problem most clearly. The top three next jobs are ICT operations manager (11.0%), ICT system administrator (9.7%) and chief ICT security officer (8.7%), which may reflect real paths or the variety of the label 'business analyst' on resumes; the data cannot settle it. Software developers most often become software analysts (7.0%) and data analysts become software analysts (3.6%) or administrative assistants (3.4%). Administrative assistant is among the twelve leading destinations for four of the five roles, which may be sideways movement or matching noise [4].",
        },
        {
          type: "p",
          text: "The records cannot show everything a reader might want. They hold titles and dates, not seniority or pay, so financial controller may sound like a step up from analyst, but the data show only that it is the most common next title. They hold no employer identity, so a move inside an employer cannot be told from a move to a new one and the list cannot be used to read off a switch premium. Pay in the next role cannot be joined to them. They also describe Flemish job seekers, not people on a work permit or new to the country [4, 17].",
        },
      ],
    },
    {
      heading: "What changing employer has paid",
      blocks: [
        {
          type: "p",
          text: "Whether switching pays has two Dutch studies behind it, one old and one recent, and they answer different questions. The CBS study by Driessen and de Vries (December 2013) compared one-year gross monthly wage growth of employees who stayed with those who changed employer, occupation or both, in annual pairs from 2006-07 to 2010-11 [6]. {ref:fig-cbs2013} gives the headline growth rates.",
        },
        {
          type: "bars",
          id: "fig-cbs2013",
          caption: "One-year gross monthly wage growth by type of change, employees, 2006-07 to 2010-11",
          unit: "% per year",
          items: [
            { label: "Stayed: same employer, same occupation (about 86 euro a month)", value: 3.6 },
            { label: "Changed employer only (about 146 euro a month)", value: 6.8 },
            { label: "Changed occupation, same employer (about 178 euro a month)", value: 6.9 },
            { label: "Changed employer and occupation (about 199 euro a month)", value: 9.7 },
          ],
          note: "CBS, Sociaaleconomische trends, December 2013 (Driessen and de Vries).",
        },
        {
          type: "p",
          text: "Read at face value, movers grew faster than stayers, but the study adds cautions. The euro amounts and percentages together imply different starting wages: dividing each amount by its percentage gives about 2,400 euro for stayers, 2,150 for employer-only changers, 2,580 for occupation changers within an employer and 2,050 for those who changed both (plain arithmetic, rounded). The groups were not alike, and the faster-growing ones started lower, which fits the finding that age explains a large part of the difference, since young workers are both the most mobile and the fastest growing [6]. After the authors control for year, sex, age, origin, education, hours, tenure, occupation level, sector and contract, the extra growth from changing employer shrinks.",
        },
        {
          type: "p",
          text: "The gain also depends on age. For 15 to 24 year olds, changing employer alone added almost nothing extra and the gains came from changing occupation; for 25 to 44 year olds both helped; for 45 to 64 year olds only an internal change of occupation helped. Growth fell for both movers and stayers over the period, and the premium for changing employer alone had disappeared by 2010-11 [6]. The exact amounts by age and education are in a chart odds could not verify, so it does not print them.",
        },
        {
          type: "p",
          text: "The CPB study of November 2025 (Scheer, Zulkarnain and Rademakers) asks something else. It used hourly wage growth of all employees from 2015 to 2022, and its headline is that in a tight labour market workers who change jobs see about 1 percentage point higher hourly wage growth than workers who keep the same job [7]. That is not a statement that switchers earn a given percentage more: the study estimates how much stronger the link between labour-market tightness and pay growth becomes at the moment a worker switches, and the size depends on the definition of a switch. {ref:fig-cpb} shows the estimate by quartile of hourly pay.",
        },
        {
          type: "ranges",
          id: "fig-cpb",
          caption: "Extra hourly wage growth at a job switch in a tight labour market, by quartile of hourly pay",
          unit: "percentage points",
          max: 1.5,
          items: [
            { label: "Lowest quarter of hourly pay", low: 0.36, high: 1.19 },
            { label: "Second quarter", low: 0.6, high: 1.06 },
            { label: "Third quarter", low: 0.38, high: 1.01 },
            { label: "Highest quarter of hourly pay", low: 0.02, high: 1.19 },
          ],
          note: "CPB, 6 November 2025 (Scheer, Zulkarnain and Rademakers), Table C.3, two definitions of a switch: change of employer (low) and new income relationship (high).",
        },
        {
          type: "p",
          text: "The spread between the two ends is the honest answer to how much a move pays: it depends on what is counted, and in the top quarter it depends a great deal, from 0.02 to 1.19 points. With the broader definition the standard errors are between 0.05 and 0.13. Without a switch, the link between tightness and hourly wage growth is 2.50 points in the lowest quarter, 1.12 in the second, 0.11 in the third and 0.02 in the highest, so in the top half of pay tightness reaches wages mainly through a change of job [7].",
        },
        {
          type: "p",
          text: "How often people switch is better documented than what switching pays. DNB (Volkerink, Ruland and Biesenbeek, 2026) reports that an average of 16.7% of employees changed employer each year from 2011 to 2025, with 40% to 45% of 15 to 25 year olds changing each year against about 10% among the oldest groups, and that 57% of people who moved straight from one job to another between 2024 and 2025 also changed sector [23]. CBS figures for the second quarter of each year show that between 3.2% and 4.7% of all employees changed employer compared with the previous quarter in 2019 to 2026 (4.0% in 2026) [24].",
        },
        {
          type: "p",
          text: "What is missing matters as much. odds searched CBS, DNB, CPB and the research departments of ABN AMRO, Rabobank and ING for a yearly comparison of switchers and stayers in 2019 to 2025, and none publishes one [25]. So odds shows the CBS figures from 2006 to 2011 with their date and the CPB effect from 2015 to 2022, and nothing newer. Together they say that a move has often paid more than staying, by an amount that depends on age, period and how a move is counted.",
        },
      ],
    },
    {
      heading: "Discussion",
      blocks: [
        {
          type: "p",
          text: "Take a hall of a hundred international university leavers of 2022/23. A year later about 30 are working in the Netherlands, about 8 are in the country with neither work nor benefit, about 5 are back in education and about 57 are no longer registered (plain arithmetic on the CBS shares) [1]. The rest of this section asks what that picture does and does not mean.",
        },
        {
          type: "p",
          text: "Two conclusions hold across independent sources. First, staying is the minority outcome by year five, with 25.3% to 32.0% of international graduates still registered [1, 2]. Second, among those who stay, finding work takes longer than for Dutch classmates and the difference narrows with time: 23.1 points at year one and 10.0 at year five in the Nuffic data, and 14 points at year one among the registered in the CBS data [1, 2]. Origin, field and city move the stay rate a great deal in both sources.",
        },
        {
          type: "p",
          text: "Two findings hold less firmly. The level of staying at year one depends on the source, for reasons of counting date, population and treatment of continuing students, and the upward trend is partly tangled with how many graduates the registers can follow [2]. Levels also differ across countries: a Finnish register study of cohorts 1999 to 2011 reported a stay rate above 62% three years after graduation, although Nuffic notes that this concerns a relatively small group, because Finland has few international students [2, 26].",
        },
        {
          type: "p",
          text: "On careers, the main lesson is about what titles can carry. People in the same starting role go to many places, the typical stay is two to nearly four years, and the most common destination rarely exceeds one move in ten [4]. The records do not show whether moves were promotions, transfers or sideways steps. The wage studies show that moving has been associated with faster growth, but the gap depends strongly on who moves and when, and the newest figure measures a different thing from the oldest [6, 7].",
        },
      ],
    },
    {
      heading: "Limitations",
      blocks: [
        {
          type: "p",
          text: "The register evidence is careful but limited. The year-one difference between CBS and Nuffic is unresolved. CBS's note on late deregistration means its registered and no-work shares cannot be taken at face value, and the share of graduates with a BRP number rose from 62.5% to 89.0% across Nuffic's cohorts, so trends are partly measurement [1, 2]. The latest CBS cohort, 2023/24, has only the position directly after leaving, and the five-year figures describe people who graduated between 2013 and 2019 under earlier rules and another labour market [1, 2].",
        },
        {
          type: "p",
          text: "Registers record where a person is registered, not why. They cannot distinguish someone who wanted to stay and could not from someone who planned to leave, and they do not follow people abroad. Nuffic's salary averages cover only employed stayers, and field and city rates overlap with nationality [2].",
        },
        {
          type: "p",
          text: "The origin statistics are survey-based and cover all education levels or all higher-educated people of a given origin, whenever and wherever educated. The 2024 hbo and wo figures are provisional, and the continent aggregates in {ref:tbl-origin} were computed by odds and validated only to within about a percentage point [12, 15]. No table crosses education, origin and unemployment, so we cannot say what the unemployment rate of an international graduate is.",
        },
        {
          type: "p",
          text: "The career records are Flemish, drawn from job seekers, self-reported and read by software. The counts cover five roles from the first release, while the authors of the second report better extraction that odds has not re-run [4, 16]. The records hold no pay, seniority, employer identity or permit status, and we do not know how unfinished stretches at the end of a record enter the median time.",
        },
        {
          type: "p",
          text: "The switch evidence is old or indirect. The CBS study covers 2006 to 2011, a crisis period; the CPB study measures a tightness interaction that depends on the definition of a switch; and no Dutch source publishes yearly switcher and stayer growth for 2019 to 2025 [6, 7, 25]. None of the figures we hold says what a move would pay someone whose residence permit depends on a particular employer.",
        },
      ],
    },
    {
      heading: "What this means for odds",
      blocks: [
        {
          type: "p",
          text: "The first consequence is what odds prints about a graduate's prospects. It shows the register outcomes with source and year, shows year one as a range, 43% to 57%, and states the 14-point gap with the CBS caution beside it. Career-record figures are labelled 'Flemish careers', self-reported and noisy, and the switch premium carries its date [10, 18].",
        },
        {
          type: "p",
          text: "The second consequence is the career path on a job page, which starts from a box where the user enters how many years they expect to work. Behind it, odds takes five steps.",
        },
        {
          type: "list",
          ordered: true,
          items: [
            "Start from the pay band. The job is matched to a CBS occupation group and the path begins at that group's 2024 gross monthly pay at the 25th, 50th and 75th percentile [27].",
            "Grow it at the occupation's own rate. For each year entered, the band is grown at that occupation's yearly growth from 2019 to 2024, before inflation, and no promotion is assumed. Net pay is shown at the middle of the band.",
            "From two years on, show the next jobs: the five most common next jobs with their shares of recorded moves, labelled as Flemish careers from JobHop, self-reported, with noisy titles [4].",
            "Compare the user's years with the typical stay. If the years entered are fewer than the median time in the role, odds says most people are still in it; if equal or more, it says most have moved on.",
            "Stop where the data stops. Pay in the next role is not shown because odds has no figure for it, and if a job has no records odds says so instead of filling the space [28].",
          ],
        },
        {
          type: "p",
          text: "A worked example makes the method concrete. For financial specialists and economists (CBS occupation group 0412) the 2024 pay at the 25th, 50th and 75th percentile is 25.7, 34.1 and 46.3 euro an hour, which is 4,811, 6,384 and 8,667 euro gross a month on a 40-hour week with 8% holiday pay. The group's median wage grew 3.4% a year from 2019 to 2024 [27, 28]. Compounding 3.4% for three years multiplies the band by about 1.106 and for five years by about 1.182, which gives 5,319, 7,058 and 9,581 euro at three years and 5,686, 7,546 and 10,244 euro at five (plain arithmetic, nominal, gross, rounded). Nothing in those numbers is a raise for changing employer or for a promotion. The growth is that of the occupation as a whole, nominal, not set against inflation, and reflects who is in the group at each date, so it describes the group and does not forecast one person's pay [18].",
        },
        {
          type: "p",
          text: "The same logic applies to tenure. For financial analysts the median time in the role is 11 quarters, or 2.75 years. A user who enters two years is told that most people are still in the job, and one who enters three that most have moved on [4, 28]. A promotion step such as financial controller and a switch premium are shown separately, each as a fact with its own source and never folded into the band.",
        },
        {
          type: "art",
          kind: "thread",
          caption: "The thread stands for one person's career; the records show only the places where other people's threads happened to cross.",
        },
        {
          type: "p",
          text: "What none of this says about an individual is considerable. The shares describe groups measured in the past, in particular countries, by particular definitions. A register outcome does not tell one graduate whether they will stay or whether staying is what they want. A next-job list does not say which move is open to a person with a given permit, CV and Dutch level. A wage study does not say what a move will pay a particular person.",
        },
        {
          type: "p",
          text: "Three practical steps follow for a user. Treat the next-jobs list as a set of search words: if financial controller keeps appearing for your starting role, read postings with that title in odds and see what they ask for. When weighing a move of employer, hold the old CBS spread and the newer CPB range side by side and ask the new employer for the pay range early. And keep your own tenure notes: the typical stay of 2 to 3.75 years is a middle and not a deadline [4]. For the first-year budget use the range, and check the permit route and its dates on the official IND site.",
        },
      ],
    },
  ],
  references: [
    "CBS StatLine table 85776NED, Uitstromers ho; arbeidsmarktpositie na verlaten onderwijs. Statistics Netherlands, cohorts 2006/07 to 2023/24, table updated 15 September 2026 (CC BY 4.0). Shares computed by odds from counts rounded to ten; pulled 29 September 2026.",
    "Arat, E., Slappendel-Henschen, A. and Pronk, C. (May 2025). Stay rate and labour market position of international graduates 2013-2022 (NUF2025/02, translation of the Dutch original). Nuffic. Register data linked by ABF Research through CBS (DUO, BRP, Tax and Customs Administration, UWV); 240,845 international graduates, ten graduation cohorts 2013-14 to 2022-23.",
    "Nuffic (15 May 2025). News item on the five-year stay rate of international graduates by city of graduation, cohorts 2014-15 to 2018-19 (Eindhoven 49%, Delft 39%, Utrecht 37%, Maastricht 12%).",
    "odds research notes (2026). Next-role shares and time in role counted from the JobHop first release (Ghent University and VDAB) for five starting roles: 6,260 stretches, 4,242 followed by a recorded job; 333,096 careers with dated roles. Pulled 29 September 2026.",
    "Johary, I., Romero, R., Mara, A. C. and De Bie, T. (2025). JobHop: A large-scale dataset of career trajectories. 2025 IEEE International Conference on Big Data (BigData), pp. 2184 to 2191. Ghent University; about 360,000 resumes of jobseekers registered with VDAB (Flanders, Belgium), coded to ESCO occupations.",
    "Driessen, J. and de Vries, J. (December 2013). Verandering van werkgever, beroep en lonen. CBS, Sociaaleconomische trends. Netherlands; employee pairs from the Labour Force Survey panel linked to wage data, annual pairs 2006-07 to 2010-11.",
    "Scheer, Zulkarnain and Rademakers (6 November 2025). Arbeidsmarktkrapte en loongroei. CPB Netherlands Bureau for Economic Policy Analysis. CBS microdata on all employees, hourly wage growth by sector and province, 2015 to 2022 (switches counted to 2023); Table C.3.",
    "Nuffic (June 2026). Incoming degree mobility at Dutch research universities and universities of applied sciences 2025-26. Based on DUO data: 129,764 international degree students in 2025-26.",
    "CBS StatLine table 85124NED, Hoger onderwijs; internationale studenten. Statistics Netherlands, 2005/06 to 2025/26, counts rounded to ten (130,190 in 2025/26).",
    "odds research notes (2026). International mode: register outcomes printed with source and year in place of a motivational line.",
    "CBS StatLine table 85456NED, Arbeidsdeelname; herkomst. Statistics Netherlands, Labour Force Survey, quarterly and annual 2013 to 2026; annual 2025 figures used, population aged 15 to 75 outside institutions.",
    "CBS StatLine table 84729NED, Arbeidsdeelname, herkomstlanden gedetailleerd. Statistics Netherlands, annual 2021 to 2024 (2024 provisional); people with hbo or wo education by 242 countries of origin; continent aggregates computed by odds.",
    "CBS StatLine table 85266NED, Arbeidsdeelname; onderwijsniveau. Statistics Netherlands, annual 2013 to 2026, ages 15 to 75; 2025 figures for hbo and wo.",
    "CBS StatLine table 85312NED, Werkloze beroepsbevolking; werkloosheidsduur, persoonskenmerken. Statistics Netherlands, annual 2013 to 2026; unemployed hbo and wo, 2025.",
    "odds research notes (2026). Search of the CBS StatLine catalogue for labour outcomes by origin: no table crossing education, origin and unemployment rate, and none for job-search duration by origin. Pulled 29 September 2026.",
    "Johary, I., Bied, G., Mara, A. C. and De Bie, T. (2026). JobHop v2: A large-scale career trajectory dataset from unstructured resumes. Proceedings of the 6th Workshop on Recommender Systems for Human Resources (RecSys in HR 2026), CEUR Workshop Proceedings. 355,315 trajectories and 1,993,291 work-experience entries from VDAB resumes.",
    "JobHop dataset documentation, versions 1 and 2 (2026). Ghent University (aida-ugent), Hugging Face, CC BY 4.0. Intended and discouraged uses, limitations and representational scope; accessed September 2026.",
    "odds research notes (2026). Confidence labels by statistic: register pay high, occupation wage growth medium-high (nominal), next-role shares medium, switch premium dated (CBS 2013) and current (CPB 2025).",
    "Nuffic (2022). Stay rate and labour market position of international graduates in the Netherlands, cohorts 2006-07 to 2015-16; figures as reported in Arat et al. (2025).",
    "SEO (2023). Studie & Werk HO: De arbeidsmarktpositie van hbo- en wo-alumni. SEO; as quoted in Arat et al. (2025) by a UWV labour market analyst.",
    "ROA (2024). Blijfkansen van afgestudeerde internationale studenten uit het Nederlandse hoger onderwijs en hun impact op arbeidsmarktramingen (report ROA-R-2024/2). Maastricht University; as summarised in Arat et al. (2025).",
    "Nuffic (2025). Fact sheet on the stay rate of international graduates. Prints 30% (EEA) and 39% (non-EEA) five-year stay rates, against 20.3% and 38.5% in the full report.",
    "Volkerink, Ruland and Biesenbeek (2026). Wisselen van werkgever, maar ook van bedrijfstak? DNB Analyse, De Nederlandsche Bank. CBS microdata 2011 to 2025; mobility counts, no wage figures.",
    "CBS StatLine table 85390NED, Werknemer; wisseling van werkgever. Statistics Netherlands, Labour Force Survey, quarterly 2013 Q1 to 2026 Q2; share computed by odds (changes of employer divided by all employees), second quarter of each year.",
    "odds research notes (2026). Search of CBS, DNB, CPB, ABN AMRO, Rabobank and ING publications for a yearly comparison of switcher and stayer wage growth in 2019 to 2025: none found. Pulled 29 September 2026.",
    "Mathies, C. and Karhunen, H. (2021). Do they stay or go? Analysis of international students in Finland. Globalisation, Societies and Education, 19(3), 298 to 310. Register data, graduation cohorts 1999 to 2011; as summarised in Arat et al. (2025).",
    "CBS StatLine table 86355NED, gross hourly wage (P25, P50, P75) by occupation group. Statistics Netherlands, 2013 to 2025 (CC BY 4.0). 2024 bands and 2019 to 2024 growth computed by odds.",
    "odds research notes (2026). Career path on a job, worked example for financial specialists and economists (CBS occupation group 0412): 2024 band, 40-hour week plus 8% holiday pay, growth of 3.4% a year 2019 to 2024, no promotion assumed.",
  ],
}

export default report
