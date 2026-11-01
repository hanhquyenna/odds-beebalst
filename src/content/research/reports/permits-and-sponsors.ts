import type { Report } from "../types"

const report: Report = {
  slug: "permits-and-sponsors",
  order: 6,
  title: "Salary thresholds and recognised sponsors: how a permit shapes the search",
  subtitle: "The 2026 IND salary lines, the sponsor register, and how odds sets a job's pay range against a person's own line.",
  category: "Permits",
  minutes: 31,
  headline: { figure: "€3,122", line: "a month, the 2026 salary line for the orientation year. Highly skilled migrants need €4,357 under 30 and €5,942 from 30" },
  feeds: "Permit fit, sponsors",
  art: "bridge",
  abstract:
    "International graduates who need a residence permit search under a rule that citizens do not face: the job has to pay at least a fixed monthly amount, and the employer is better placed if the immigration service recognises it as a sponsor. This report sets out the 2026 salary lines of the Dutch Immigration and Naturalisation Service (IND), which are 3,122, 4,357 and 5,942 euros a month excluding holiday pay, and shows how odds compares them with typical pay for an occupation taken from Statistics Netherlands (CBS). Using 77 occupation groups and 13,484 collected postings, we compute how often typical pay clears each line, work through a near miss of 31 euros, and show why the answer changes once age is taken into account. We describe what the register of recognised sponsors includes and omits, and how many collected postings belong to listed employers. The report closes with the limits of the method: a median is not a salary offer, a register entry is not a promise to sponsor this role, and only the IND can confirm a case.",
  findings: [
    "The 2026 IND lines are 3,122 euros a month for the orientation year, 4,357 for highly skilled migrants under 30 and 5,942 for those aged 30 and over, all excluding holiday pay [1].",
    "For financial specialists and economists the median is 5,911 euros a month, 31 euros under the 30-and-over line, while the middle half of the group earns 4,455 to 8,025 euros [2, 3].",
    "Of 77 occupation groups, the median clears 3,122 euros in 65, 4,357 euros in 42 and 5,942 euros in only 15 [4].",
    "Scaling the same median by the CBS age factor for ages 25 to 30 (0.675) gives about 3,990 euros, which is 367 euros under the 4,357 line, although the unadjusted median clears that line by 1,554 euros [3, 5].",
    "Of 13,484 collected postings, 8,908 (66.1%) belong to employers that odds finds on the register of 12,984 recognised sponsors, yet only 3.7% of postings mention a visa or relocation [6, 7].",
    "In the IND and CBS study of the 2017 orientation-year cohort, 54% of new holders had a knowledge-worker permit as their next permit [8].",
  ],
  sections: [
    {
      heading: "Introduction",
      blocks: [
        {
          type: "p",
          text: "For a citizen of the European Union or the European Economic Area (EEA), pay is a question of preference. For many international graduates who need a residence permit tied to work, pay is also a condition. Two postings that look alike on the page can be open to one person and closed to another, because the permit attaches a fixed monthly salary line to the job and because the employer needs a particular standing with the immigration service.",
        },
        {
          type: "p",
          text: "The population affected is large. Nuffic counted 129,764 international degree students in 2025-26, of whom 93,653 came from the EEA and 36,017 from outside it [9]. CBS counts 130,190 for the same year and 69,040 for 2016/17, so the student body nearly doubled in a decade [10]. Most will leave. Nuffic finds that 42.1% of graduates were still living in the Netherlands one year after graduating and 25.3% five years after, and that the five-year figure is 38.5% for non-EEA graduates against 20.3% for EEA graduates [11]. This suggests that the graduates who remain are disproportionately the ones who need a permit route, which is why the salary line and the sponsor question matter to the people who stay.",
        },
        {
          type: "p",
          text: "This report concerns two questions that odds answers on every job page. The first is whether the typical pay for this kind of job clears the salary line that applies to the person looking. The second is whether the employer appears on the public register of recognised sponsors that the IND keeps. The two are connected but not the same, and neither forecasts whether a particular employer will make an offer to a particular candidate.",
        },
        {
          type: "p",
          text: "A single example shows the size of the space between what a median says and what a hiring decision needs. A finance graduate aged 30 or over finds a role at an employer she knows. The typical monthly pay for financial specialists and economists is 5,911 euros excluding holiday pay, while the 2026 line for a highly skilled migrant aged 30 or over is 5,942 euros [1, 3]. The job misses the line by 31 euros. {ref:fig-bridge} stands for this situation.",
        },
        {
          type: "art",
          id: "fig-bridge",
          kind: "bridge",
          caption: "A permit is a bridge of fixed width. Each job either spans the gap to the salary line or stops short of it, and the register says only whether the far side has a door.",
        },
        {
          type: "p",
          text: "The report sets out the data, the three salary lines, the sponsor register, pay by occupation against the lines (with worked examples), and the published permit statistics, then discusses where sources disagree and states its limits. Nothing here is legal, tax or immigration advice. The amounts and rules change, and the place to confirm them for a given case is the IND website, ind.nl.",
        },
      ],
    },
    {
      heading: "Data and sources",
      blocks: [
        {
          type: "p",
          text: "The analysis rests on the IND salary amounts, the IND register of recognised sponsors, CBS wage statistics, and the job postings that odds has collected. Published permit and stay statistics give context.",
        },
        {
          type: "p",
          text: "The IND publishes required amounts for the highly skilled migrant route and the orientation year, with a reduced amount for the latter and a separate pair for the EU Blue Card. odds holds the 2026 amounts: 3,122 euros a month for the reduced orientation-year line, 4,357 for highly skilled migrants under 30, 5,942 for those aged 30 and over, and for the Blue Card 5,942 with a reduced 4,754 [1]. All are gross monthly amounts excluding holiday pay. The IND page states that the amounts change every 1 January, and its line valid from 1 July 2026 applies to family and study categories, not to these amounts [1]. The figures here are for calendar year 2026 and will be out of date in January 2027.",
        },
        {
          type: "p",
          text: "The IND register of recognised sponsors held by odds lists 12,984 organisations, each with a name and a Chamber of Commerce (KvK) number, and is described as updated monthly [6].",
        },
        {
          type: "p",
          text: "Pay comes from CBS StatLine table 86355NED, which reports the 25th, 50th and 75th percentile of gross hourly wages and the number of employees for each occupation group [2]. The table rests on a register covering the working population, not a survey, and odds uses the 2024 figures for 77 groups [2, 4]. To compare an hourly wage with a monthly line, odds multiplies by 2,080 hours (40 hours over 52 weeks) and divides by 12, leaving out the 8% holiday allowance because the IND amounts exclude holiday pay [1, 4]. The middle of the financial specialists group is 34.1 euros an hour, which becomes 5,911 euros a month. A quarter of the group earns less than the 25th percentile and three quarters earn more, so the 25th to 75th percentile range is the middle half of the group, not its extremes.",
        },
        {
          type: "p",
          text: "The age adjustment uses CBS table 81431NED, the mean hourly wage by sector and age band for 2024, with each band divided by the sector mean. In the financial sector the factor is 0.675 at ages 25 to 30 and 0.844 at 30 to 35; in information and communication it is 0.708 and 0.909 [5]. For people early in their careers, CBS wages of higher-education leavers one year after leaving (tables 83815NED and 85778NED, cohort 2022/23) give a more direct comparison, although they are not split by permit status [12].",
        },
        {
          type: "p",
          text: "The posting pool holds 13,484 Dutch postings collected on 29 and 30 September 2026 from five kinds of source: company application-system boards (321 postings), corporate career interfaces (1,367), LinkedIn searches for entry-level titles (1,636), open job feeds (2,051) and public-sector listings (8,109) [7]. It is large but not a sample of the labour market: public-sector listings make up 60.1% of it. Employers are matched to the register by a normalised company name with a short alias list, a loose word match that the project notes say must be verified by hand; the match is not made by KvK number [13]. Flags such as visa words, Dutch requirements and nationality conditions come from pattern rules on the posting text [14]. A posting receives a CBS occupation group by rules on its title; 7,437 of the 13,484 (55.2%) receive one, and for the rest the permit check reports that it cannot be made [15].",
        },
        {
          type: "p",
          text: "Context on permits comes from IND annual figures for all knowledge and talent schemes together, 2019 to 2025 [16], CBS table 82027NED on first fixed-term permits [17], the Staat van Migratie 2025 [18], an IND and CBS study of the 2017 orientation-year cohort [8], and CBS table 85910NED on non-EU knowledge workers [19]. A number labelled 'computed' is plain arithmetic by odds on published figures. Where two sources disagree, both are stated. The IND amounts and the register are treated as high-confidence statements of what they list [20].",
        },
      ],
    },
    {
      heading: "The 2026 salary lines and who stands on which",
      blocks: [
        {
          type: "p",
          text: "{ref:tbl-routes} lists the amounts held for 2026 and how odds assigns a person to a line. The lines are parallel, not a ladder: a person is on one of them at a time, chosen by the situation reported in the profile.",
        },
        {
          type: "table",
          id: "tbl-routes",
          caption: "IND monthly salary lines for 2026 and the line odds applies to each profile",
          head: ["Route", "2026 line (EUR a month, excluding holiday pay)", "Same amount over 12 months", "How odds assigns it"],
          rows: [
            ["Orientation year (reduced amount)", "3,122", "37,464", "Profile says orientation year"],
            ["Highly skilled migrant, under 30", "4,357", "52,284", "Profile says highly skilled migrant, age below 30"],
            ["Highly skilled migrant, 30 and over", "5,942", "71,304", "Highly skilled migrant, age 30 or more; also used when no birth year is given"],
            ["EU Blue Card", "5,942 (reduced: 4,754)", "71,304 (reduced: 57,048)", "Not used by the permit check"],
            ["EU or EEA citizen", "No salary line", "Not applicable", "Profile says EU or EEA"],
          ],
          note: "Sources: IND required amounts for 2026 [1]; line assignment from the odds permit check rules [15]. The 12-month column is arithmetic (line times 12) and ignores holiday pay. Profiles marked 'other non-EU' are treated like highly skilled migrants.",
        },
        {
          type: "p",
          text: "The under-30 line is 1,235 euros above the reduced line, and the line for those aged 30 and over is 1,585 euros above the under-30 line, an increase of 36.4% on crossing the age boundary. {ref:fig-lines} shows the three amounts on a common scale.",
        },
        {
          type: "bars",
          id: "fig-lines",
          caption: "IND salary lines for 2026, gross per month excluding holiday pay",
          unit: "EUR per month",
          items: [
            { label: "Orientation year (reduced)", value: 3122 },
            { label: "Highly skilled migrant, under 30", value: 4357 },
            { label: "Highly skilled migrant, 30 and over", value: 5942 },
          ],
          note: "Source: IND required amounts, 2026 [1]. The EU Blue Card amounts (5,942 and a reduced 4,754) are listed in the source but not used by odds.",
        },
        {
          type: "p",
          text: "odds takes age as the current year minus the birth year, which can be wrong by one year around a birthday. A graduate born in 1998 is treated as 28 in 2026 and sits on the under-30 line. If the birth year is left blank, odds assumes 30 and applies the higher line, a cautious choice that is still an assumption made for the person [15]. The IND source held here does not give the date rule for moving from one amount to the other, so a person near their 30th birthday should read it on ind.nl [1].",
        },
        {
          type: "p",
          text: "Pay rises steeply through the twenties and thirties, but less steeply than the line. In the financial sector, mean pay at ages 30 to 35 is 0.844 of the sector mean against 0.675 at ages 25 to 30, a rise of 25.0%; in information and communication the factors are 0.909 and 0.708, a rise of 28.4% (computed from the CBS factors) [5]. The line rises by 36.4% across the boundary. A person on the under-30 line who plans to stay is planning to cross it, and pay at the time of crossing matters more than pay at the start.",
        },
        {
          type: "p",
          text: "The salary lines should not be confused with the thresholds of the 30% ruling, a tax facility for some employees who come from abroad. For 2026 the ruling has a minimum yearly salary of 48,013 euros, or 36,497 euros for an employee under 30 with a master's degree, and it depends on a distance and duration test that the salary lines do not [21]. The monthly IND amounts exclude holiday pay and the ruling minimums are yearly salaries, so the two sets should not be compared without checking the basis of each. Passing one says nothing about the other. The salary line also concerns the contract and not the occupation: the occupation median that odds uses is a stand-in for a salary that has not yet been offered.",
        },
      ],
    },
    {
      heading: "The sponsor register: what it lists, what it omits, and what the postings show",
      blocks: [
        {
          type: "p",
          text: "On a job page odds shows either 'IND sponsor' or 'No sponsor listed'. The wording reports what the register shows and claims nothing more. A listing is a fact about an organisation; whether it applies to the role in front of the reader is a separate question. The product notes state the limit in one sentence: a recognised sponsor is not the same as an employer that will sponsor this role [20].",
        },
        {
          type: "p",
          text: "The register is nonetheless a real signal. A reader who filters a long list to listed employers narrows the search to places where the permit question is worth raising, and the register is a public list with a fixed format (12,984 names with KvK numbers), so it is among the more verifiable facts the product uses [6, 20]. What it does not do is list vacancies, so it cannot say that a particular team is open to hiring from abroad. It says nothing about how often an organisation has done so, about whether the salary on offer clears a line, or about the chance of approval. A group with many subsidiaries may also have one name listed and several employing entities.",
        },
        {
          type: "p",
          text: "A matching problem sits on top of these limits. The employer name in a posting is matched to the register by normalised name, and the project notes describe the match as loose [13]. It can over-count, when a common word in a company name appears in an unrelated registered entity, and under-count, when a posting uses a brand name while the register lists the legal entity.",
        },
        {
          type: "p",
          text: "Of the 13,484 postings collected on 29 and 30 September 2026, 8,908 (66.1%) belong to employers that the name matching finds on the register [6, 7]. {ref:tbl-pool} breaks this down by source. Company application-system boards and corporate career interfaces are almost entirely matched, at 98.4% and 98.2%, and open feeds at 88.7%. The lowest shares are LinkedIn searches for entry-level titles at 52.4% and public-sector listings at 56.4%.",
        },
        {
          type: "table",
          id: "tbl-pool",
          caption: "Collected postings whose employer is matched to the IND register, by source, 29 and 30 September 2026",
          head: ["Source of posting", "Postings", "Matched to register", "Share matched"],
          rows: [
            ["Company application-system boards", "321", "316", "98.4%"],
            ["Corporate career interfaces", "1,367", "1,342", "98.2%"],
            ["Open job feeds", "2,051", "1,820", "88.7%"],
            ["Public-sector listings", "8,109", "4,572", "56.4%"],
            ["LinkedIn entry-level searches", "1,636", "858", "52.4%"],
            ["All sources", "13,484", "8,908", "66.1%"],
          ],
          note: "Source: odds collected postings, 29 and 30 September 2026 [7]; matching by normalised employer name [13]. Public-sector listings include 1,185 postings with no employer name, which cannot match by construction.",
        },
        {
          type: "p",
          text: "Two features of {ref:tbl-pool} limit its use. The 1,185 postings with no employer name count as unmatched; excluding them, the overall share rises from 66.1% to 72.4% of the 12,299 postings that have a name. And the sources are not interchangeable: company boards and career interfaces were chosen because the employers are large and international, which is also why they are nearly all on the register, while the LinkedIn row reflects searches for entry-level titles, the postings most relevant to new graduates. By level, 76.9% of 4,748 senior postings are matched, 68.8% of 1,805 entry-level postings and 47.2% of 2,596 internships; by category, 66.5% of 3,714 finance and business postings and 75.2% of 1,724 tech postings [7]. The data do not show why internships are matched least often. A filter for listed employers removes about a third of the pool and about half of the internships.",
        },
        {
          type: "p",
          text: "By employer name rather than posting, 1,055 of 2,020 distinct names (52.2%) are matched, and among private-sector sources 541 of 1,069 names (50.6%) against 4,336 of 5,375 postings (80.7%) [7]. Employers on the register post more, so a reader meets them more often than the count of names suggests.",
        },
        {
          type: "p",
          text: "Some postings state outright that they help with a visa or relocation. Pattern rules found words such as visa, sponsorship, relocation, work permit, 30% ruling or kennismigrant in 504 of the 13,484 postings (3.7%): 2.7% of finance and business postings and 7.2% of tech postings, and from 2.6% in public-sector listings to 9.3% (30 of 321) in company boards [14]. Postings from matched employers mention them more often, 5.0% (446 of 8,908) against 1.3% (58 of 4,576), which is what a reader would expect if the register carries some information [14]. The levels are low, and a posting that does not mention a visa is not evidence of refusal.",
        },
        {
          type: "p",
          text: "Other flags push the other way. Conditions that look like nationality or work-authorisation requirements appear in 346 postings (2.6%), 287 of them public-sector listings, and 258 of the 346 belong to employers matched to the register [14]. A register entry and a nationality condition can therefore sit in the same organisation. Dutch language requirements are flagged in 8.3% of postings, 9.5% among matched employers and 5.9% among the others; because the rule looks for explicit evidence, these shares are a floor and not an estimate of how many jobs need Dutch [14].",
        },
      ],
    },
    {
      heading: "Pay by occupation against the lines",
      blocks: [
        {
          type: "p",
          text: "The permit check in odds takes the median monthly pay of the occupation group assigned to the posting, excluding holiday pay, and compares it with the person's line. If the median is at or above the line the check passes; if not, it fails and shows both numbers and the gap in euros; if no group is assigned, it says it cannot tell. It does not use the salary in the posting or the age-adjusted median [15]. {ref:tbl-occupations} shows the ten occupation groups with the most collected postings; all pay figures are computed from CBS hourly percentiles at 2,080 hours a year, excluding holiday pay.",
        },
        {
          type: "table",
          id: "tbl-occupations",
          caption: "Monthly pay by occupation group, 2024, against the 4,357 and 5,942 euro lines (computed)",
          head: ["CBS occupation group", "Postings in pool", "25th", "Median", "75th", "Median minus 4,357", "Median minus 5,942"],
          rows: [
            ["0412 Financial specialists and economists", "1,630", "4,455", "5,911", "8,025", "+1,554", "-31"],
            ["0413 Business and organisation advisers", "1,014", "5,044", "6,448", "7,991", "+2,091", "+506"],
            ["0411 Accountants, controllers, auditors", "778", "4,923", "6,309", "7,939", "+1,952", "+367"],
            ["0814 Software and application developers", "685", "4,351", "5,564", "6,916", "+1,207", "-378"],
            ["0321 Account managers (retail) and buyers", "592", "4,160", "5,356", "7,037", "+999", "-586"],
            ["0812 System administrators and network specialists", "475", "4,836", "5,911", "6,985", "+1,554", "-31"],
            ["0712 Engineers (not electrical)", "342", "4,316", "5,668", "7,297", "+1,311", "-274"],
            ["0311 Marketing, PR and sales advisers", "245", "3,952", "5,269", "6,951", "+912", "-673"],
            ["0813 Systems analysts and ICT advisers", "241", "5,235", "6,656", "8,129", "+2,299", "+714"],
            ["0621 Jurists", "238", "4,888", "6,656", "8,337", "+2,299", "+714"],
          ],
          note: "Euros a month excluding holiday pay, computed as hourly percentile times 2,080 divided by 12, from CBS StatLine 86355NED for 2024 [2, 4], against IND 2026 lines [1]. Postings in pool: odds collected postings, 29 and 30 September 2026 [7]. Group names are short English glosses of the CBS Dutch titles.",
        },
        {
          type: "p",
          text: "Every group in {ref:tbl-occupations} has a median above the under-30 line, while the 30-and-over line is cleared by four of the ten and missed by six. Financial specialists and system administrators share an hourly median of 34.1 euros and so the same monthly 5,911 euros.",
        },
        {
          type: "h3",
          text: "Worked example: the near miss",
        },
        {
          type: "p",
          text: "Take the financial specialist on the 30-and-over line. The median of 5,911 euros is 31 euros, about 0.5%, below 5,942, so the check reports a fail and the gap [3]. Two things make this less decisive than it looks. The first is that the median is one point in a wide spread. {ref:rng-pay} shows the 25th to 75th percentile range for six groups; for financial specialists it runs from 4,455 to 8,025 euros, so the line lies between the 50th and 75th percentiles. The share of the group earning at least the line is therefore more than a quarter and less than a half. A reader who sees only 'fail, 31 euros short' would conclude that the job is closed, when between a quarter and a half of the people in the occupation earn enough to clear it.",
        },
        {
          type: "ranges",
          id: "rng-pay",
          caption: "Monthly pay from the 25th to the 75th percentile, six occupation groups, 2024 (computed)",
          unit: "EUR per month, excluding holiday pay",
          max: 9000,
          items: [
            { label: "0412 Financial specialists and economists", low: 4455, high: 8025 },
            { label: "0411 Accountants, controllers, auditors", low: 4923, high: 7939 },
            { label: "0413 Business and organisation advisers", low: 5044, high: 7991 },
            { label: "0814 Software and application developers", low: 4351, high: 6916 },
            { label: "0321 Account managers (retail) and buyers", low: 4160, high: 7037 },
            { label: "0311 Marketing, PR and sales advisers", low: 3952, high: 6951 },
          ],
          note: "The IND lines for 2026 are 3,122, 4,357 and 5,942 euros a month [1]. Pay computed from CBS StatLine 86355NED [2, 4].",
        },
        {
          type: "p",
          text: "The second point is that the median describes an occupation and not a job. A group such as financial specialists runs from people in their first year to people with decades of experience, and the pooled wage does not vary with the employer. A new graduate's offer is more likely to fall in the lower part of the range, for reasons the entry-level figures below illustrate, and the part of the range where the line sits is where more experienced people are found. That cuts against the optimistic reading of the spread.",
        },
        {
          type: "h3",
          text: "Worked example: what age does to the comparison",
        },
        {
          type: "p",
          text: "The medians in {ref:tbl-occupations} are taken over all ages. Applying the CBS age factors to the median for financial specialists is plain arithmetic, labelled as such: 5,911 times 0.675 is about 3,990 euros for ages 25 to 30, and 5,911 times 0.844 is about 4,989 euros for ages 30 to 35 [3, 5]. The 4,357 euro line for those under 30 would then be missed by about 367 euros, although the unadjusted median clears it by 1,554 euros, and the 5,942 euro line would be missed by about 953 euros at ages 30 to 35, not the 31 euros the unadjusted check shows. For software and application developers, using the factors 0.708 and 0.909, the results are about 3,939 euros (418 under the 4,357 line) and 5,058 euros (884 under the 5,942 line), against an unadjusted median of 5,564 [4, 5]. The reduced line of 3,122 euros is still cleared by the adjusted figures, by 868 euros for financial specialists and 817 for developers.",
        },
        {
          type: "p",
          text: "These figures carry a clear warning. The factor is a ratio of sector means applied to one occupation's median, a rough scaling and not a measurement of what a 27-year-old financial specialist earns. The adjusted figures are not used in the permit check. They show the direction of the error: for a young person on the under-30 line, the unadjusted median flatters the job, by more than the 31 euro near miss that draws attention.",
        },
        {
          type: "p",
          text: "Across all 77 occupation groups, the median clears the reduced line in 65 groups (84.4%), the under-30 line in 42 (54.5%) and the 30-and-over line in 15 (19.5%); at the 25th percentile the counts are 55, 24 and 2, and at the 75th they are 72, 58 and 36 [4]. Weighted by postings, of the 7,437 postings assigned to a group, the group median is at or above 3,122 euros for all, at or above 4,357 euros for 6,960 (93.6%) and at or above 5,942 euros for 2,487 (33.4%) [4, 7]. {ref:fig-clear} shows the three shares.",
        },
        {
          type: "bars",
          id: "fig-clear",
          caption: "Share of the 7,437 occupation-mapped postings whose group median clears each line (computed)",
          unit: "% of postings",
          items: [
            { label: "Clears 3,122 (orientation year)", value: 100 },
            { label: "Clears 4,357 (under 30)", value: 93.6 },
            { label: "Clears 5,942 (30 and over)", value: 33.4 },
          ],
          note: "Computed by odds from CBS StatLine 86355NED medians for 2024 [2, 4], IND 2026 lines [1] and odds collected postings of 29 and 30 September 2026 [7]. The other 6,047 postings have no occupation group.",
        },
        {
          type: "p",
          text: "Fields differ. Among 3,977 postings in the 04 family of groups (finance and business), 91.1% have a group median at or above 4,357 euros and 45.7% at or above 5,942 euros. Among 1,401 postings in the 08 family (information and communication), all are at or above 4,357 euros but only 17.2% at or above 5,942 euros [4, 7]. At the lower quartile only 2.0% of mapped postings (150) have a group 25th percentile at or above 5,942 euros, and 62.5% (4,648) at or above 4,357 euros [4, 7].",
        },
        {
          type: "p",
          text: "A band that includes partners is a blunt tool for a new graduate, so a second comparison uses CBS wages one year after leaving education, cohort 2022/23, measured in October 2024 [12]. For wo (university) leavers in economics the lower quartile, median and upper quartile are 3,070, 3,500 and 4,010 euros a month; in wo technology 3,220, 3,580 and 4,060; for hbo (applied sciences) leavers in economics 2,520, 2,910 and 3,320, and in technology 2,790, 3,200 and 3,610 [12]. Against the reduced line of 3,122 euros, the wo economics median clears by 378 euros while its lower quartile misses by 52; the hbo economics median misses by 212. Against the under-30 line, even the upper quartiles of wo economics and wo technology fall short, by 347 and 297 euros.",
        },
        {
          type: "p",
          text: "This comparison is indicative. The source describes a gross monthly wage and the material held here does not say whether holiday pay is included, so it may sit on a different basis from the IND amounts; it covers all leavers, not only those on permits, and one cohort measured once [12]. Nuffic's report on stayers adds a rough check: an average gross annual salary of 38,622 euros one year after graduation and 54,540 euros five years after, which are 3,218 and 4,545 euros a month when divided by 12; these averages mix EEA graduates, who need no line, with non-EEA graduates [11].",
        },
        {
          type: "p",
          text: "Some large employers pay from a scale in a collective agreement, and then the occupation median says little. The central government's agreement from 1 July 2026 has a scale 10 from 3,496.31 to 5,535.40 euros a month for a 36-hour week, with an allowance of 16.5% of salary on top [22]. The top of that scale is 406.60 euros under the 30-and-over line before the allowance and about 6,449 euros with it (arithmetic). Whether an allowance counts toward the IND amount, or a 36-hour week is converted to a 40-hour basis, is not stated in the material held here and belongs to the IND. Rabobank's scale 7 from 1 June 2026 runs from 3,515.82 to 5,021.11 euros a month, with holiday pay and a thirteenth month on top [23]: its bottom clears the reduced line but misses the under-30 line by 841.18 euros, and its top clears the under-30 line but not the 30-and-over line.",
        },
      ],
    },
    {
      heading: "The permit landscape around the lines",
      blocks: [
        {
          type: "p",
          text: "The IND reports knowledge and talent permits as one group covering several schemes, so applications and approvals cannot be read as the chance for one route. {ref:tbl-kt} gives the annual series next to the CBS count of first fixed-term permits with the ground 'Kenniswerker / Blue Card'.",
        },
        {
          type: "table",
          id: "tbl-kt",
          caption: "IND knowledge and talent applications and decisions, and CBS first fixed-term knowledge-worker permits, 2019 to 2025",
          head: ["Year", "IND applications", "IND decisions", "Approval rate", "CBS first permits (Kenniswerker / Blue Card)"],
          rows: [
            ["2019", "20,970", "21,390", "94%", "14,335"],
            ["2020", "13,710", "13,760", "91%", "8,170"],
            ["2021", "22,840", "21,580", "94%", "14,490"],
            ["2022", "33,030", "33,080", "94%", "24,510"],
            ["2023", "25,870", "26,500", "91%", "17,770"],
            ["2024", "21,730", "22,370", "87%", "13,420"],
            ["2025", "19,490", "18,960", "86%", "10,760"],
          ],
          note: "IND annual figures for all Kennis & Talent schemes together [16] (2022 and 2024 taken from comparison columns of later editions); CBS StatLine 82027NED from IND data [17]. The two counts measure different things and are not reconciled in the sources.",
        },
        {
          type: "p",
          text: "{ref:tbl-kt} shows a peak in 2022 and a fall since: applications went from 33,030 in 2022 to 19,490 in 2025, and the approval rate from 94% to 86% [16]. Decisions times the approval rate gives about 16,310 permits granted in 2025 and about 19,460 in 2024, against a published 2024 figure of 19,560 (computed) [16, 18]. From January to April 2026 there were 6,060 applications, against 6,040 in the same months of 2025, and for August 2026 the IND reported 1,700 decisions and 1,670 new applications [24, 25]. None of these figures splits by salary, sponsor or age, so they cannot show how the salary line affects who is approved.",
        },
        {
          type: "p",
          text: "The Staat van Migratie 2025 splits the permits granted in 2024: 10,570 for the national highly skilled migrant scheme, 3,080 for researchers, 2,610 for the intra-corporate transfer directive, 1,800 for the orientation year, 1,240 for self-employed persons and 260 for the EU Blue Card, a total of 19,560 and 19% fewer than in 2023 [18]. The CBS count of first knowledge-worker permits for 2024, 13,420, is close to the sum of the highly skilled migrant, transfer and Blue Card figures (10,570 plus 2,610 plus 260 is 13,440), so it is the best yearly proxy for the highly skilled migrant route and excludes researchers and the orientation year [17, 18]. The orientation year is a small route by count, and no yearly series for other years could be found [18].",
        },
        {
          type: "p",
          text: "What follows the orientation year is documented for one cohort. In the IND and CBS study of the 2017 cohort, 54% of new orientation-year holders (and 52% of those already in the country) had a knowledge-worker permit as their next permit; 63% and 65% were still in the Netherlands at the end of 2020; 85% had worked in the Netherlands during or after the year; and 84% had first come to study [8]. The cohort predates the changes of the 2020s, describes the past, and shows nothing about the employers or salaries behind the permits.",
        },
        {
          type: "p",
          text: "On 31 December 2024 CBS counted 96,060 non-EU and non-EFTA employees who came for knowledge work, up from 90,240 a year earlier and 76,440 at the end of 2022 [19]. By sector, 27.1% worked in business services (which includes temporary-work agencies), 23.5% in information and communication and 10.1% in financial services. Measured against the statutory minimum wage, 44.2% earned an hourly wage of 250% of the minimum or more, 28.7% between 180% and 250%, 20.0% between 130% and 180%, and 7.0% less than 130% [19]. CBS gives no euro amounts, and the stock includes people admitted under earlier amounts, so the table is the closest public evidence on salaries of knowledge migrants yet cannot be placed against a 2026 euro line.",
        },
      ],
    },
    {
      heading: "Discussion",
      blocks: [
        {
          type: "p",
          text: "Three themes run through the evidence: a fixed line meets a range of pay, a register entry concerns an organisation and not a role, and sources disagree.",
        },
        {
          type: "p",
          text: "The first theme decides how results should be shown. A fixed line against a single point produces a verdict, and the verdict is sensitive near the line. For financial specialists a median 31 euros under the line yields a fail, although the line lies between the 50th and 75th percentiles. For developers a 25th percentile of 4,351 euros sits 6 euros under the 4,357 euro line (the odds research notes quote 4,349 for the same figure, a rounding difference of 2 euros) [2, 4]. A reader who sees only the verdict loses the fact that a large part of the range lies on the other side; a reader who sees only the range loses the verdict. Drawing the line across the range and stating the euro gap to the median keeps both.",
        },
        {
          type: "p",
          text: "The age analysis shows a second, less visible distortion. The median describes everyone in an occupation, and for a person on the under-30 line the relevant pay is that of people their age. The age factors move the financial specialist median from 1,554 euros above the under-30 line to about 367 euros below it. The scaling is crude, but the CBS entry-level figures point the same way, since no quartile of wo leavers in economics or technology reaches the 4,357 euro line one year after leaving [12].",
        },
        {
          type: "p",
          text: "The posting's own salary matters more than the model. In the collected postings 6,708 (49.7%) state pay of some kind, but 5,380 of these are public-sector listings, so only 1,328 of the 5,375 private-sector postings (24.7%) do [7]. For most private-sector postings the occupation median is the only pay figure available. The Dutch bill implementing the EU pay transparency directive would oblige employers to give a starting salary or range before the interview, but on 29 September 2026 it was still before the Tweede Kamer, with a government target of 1 January 2027 [26].",
        },
        {
          type: "p",
          text: "The second theme is that the sponsor shares in {ref:tbl-pool} show the signal to be common in the pool (66.1% of postings, or 72.4% of those with a named employer), so filtering to listed employers removes some postings but leaves most. Visa mentions (3.7%) say more about intent than the listing, but they are rare. The listing is a reason to ask the question; the posting text and the employer's answer settle it.",
        },
        {
          type: "p",
          text: "The third theme is disagreement between sources. The Nuffic fact sheet of 2025 prints stay rates of 30% for EEA graduates and 39% for non-EEA graduates, while the full stay-rate report gives 20.3% and 38.5%, and the full report is used here [11, 27]. Nuffic finds that 56.6% of the 2022-23 cohort were still in the country one year after graduating, while CBS finds that 43.4% of international university leavers were still registered; the project notes could not reconcile the gap, and the definitions differ in counting date and degrees covered, while at year five the two are close, at 30.4% and 32.0% [11, 28]. In each case a ranged statement with both sources is more honest than a choice between them.",
        },
        {
          type: "p",
          text: "A last point concerns what the check does to the rest of the product. In the present version of odds, a failed check means the interview estimate for that posting is not shown and the reason is displayed instead [15]. A 31 euro miss on the median therefore removes the estimate for every financial specialist posting for a person on the 30-and-over line, including those whose own stated salary may clear it. The choice is defensible, but it makes the quality of the comparison matter more than a soft label would.",
        },
      ],
    },
    {
      heading: "Limitations",
      blocks: [
        {
          type: "p",
          text: "First, the comparison uses an occupation median as a stand-in for a salary. The IND amounts apply to the salary in a contract, while the median describes the typical person in the occupation across employers, ages and experience. The conversion from hourly wages assumes a 40-hour week and leaves out the 8% holiday allowance; employers who count hours, allowances or a thirteenth month differently will produce different monthly figures [4, 22].",
        },
        {
          type: "p",
          text: "Second, the occupation assignment is imperfect. The pool assigns a CBS group by rules on the title, and 6,047 of 13,484 postings (44.8%) receive none, so nearly half the pool cannot be checked against a line. A title mapped to the wrong group inherits the wrong median, and the fractions for mapped postings describe the mapped part only [7, 15].",
        },
        {
          type: "p",
          text: "Third, the sponsor match is by name and approximate, and the project notes require manual verification for any individual employer [13]. The pool is a convenience collection from five kinds of source, with public-sector listings at 60.1%, gathered on two days, 29 and 30 September 2026 [7]. It is not a sample of Dutch vacancies, and its shares should not be generalised to the market. An earlier, smaller pool of 321 postings from 16 employers gave visa or relocation mentions of 8% in finance and business and 21% in tech, well above the shares in the present pool, and that sensitivity to the source is itself a limitation [29].",
        },
        {
          type: "p",
          text: "Fourth, the lines are for 2026 only. The report does not describe eligibility conditions, the date rule for the age boundary, how an allowance or a shorter working week is counted, how long permits last, or what an employer must do to sponsor. These are the points on which a person's case turns, and the files behind this report do not reproduce them. The age adjustment uses sector averages and is a rough scaling of one occupation's median, not an observation [5].",
        },
        {
          type: "p",
          text: "Fifth, the published statistics cannot answer the question a reader most wants answered. No source held here gives approvals by employer, salary or age, or euro salaries of highly skilled migrants: CBS gives wage bands as multiples of the minimum wage, Nuffic gives averages for stayers of all kinds, and the IND annual figures stop at all knowledge and talent schemes [11, 16, 19]. Anyone who offers a precise probability of approval for an individual case goes beyond the data, and odds states no such probability.",
        },
      ],
    },
    {
      heading: "What this means for odds",
      blocks: [
        {
          type: "p",
          text: "Three things are kept apart on a job page. The line is the person's own, from the IND, with the year printed. The pay is a range from the national pay register for the occupation, marked as typical pay for this kind of job and not the salary in the advert [1, 2]. The sponsor badge reports the register and stops there, in the words 'IND sponsor' or 'No sponsor listed' [20]. The check that joins them says pass, fail or cannot tell, and gives the euro gap to the median when it can.",
        },
        {
          type: "p",
          text: "Several changes follow from the evidence. The pay range should be drawn with the person's line across it, so that a near miss and a wide miss look different and the share of the range above the line can be seen. A check against the under-30 line should say that the median describes all ages. Where a posting states its pay, that figure should be compared with the line in place of the occupation median and labelled as this job's pay. The shares above, which rest on a name match, are not to be shown as counts of verified sponsors. A failed check that rests on a median a few euros under the line should not silently hide a posting; the gap and the range are the honest display.",
        },
        {
          type: "p",
          text: "For a reader who needs a permit, the practical steps are few. Set the permit route and birth year in the profile, because they choose the line; a blank birth year is treated as 30 and gives the higher line. When a job shows a miss, open the pay range and see where the line cuts it: a role whose middle half lies mostly above the line is a different bet from one that clears it only in its top quarter. When an advert states a salary, compare it with the line directly. Read the posting for visa, relocation and nationality conditions. Ask the employer early whether it sponsors for this role and what salary it would offer, and remember that first-year pay sits closer to the reduced line than to the under-30 line.",
        },
        {
          type: "p",
          text: "Before planning around any figure here, confirm the current amounts, the conditions for the route and the date rule for the age boundary on the IND website, ind.nl, which is the official source. Tax questions, including the 30% ruling, belong to the Belastingdienst. This report is research, not legal, tax or immigration advice, and the numbers will change on 1 January.",
        },
      ],
    },
  ],
  references: [
    "Immigration and Naturalisation Service (IND) (2026). Required amounts and income requirements: monthly salary lines for highly skilled migrants (under 30; 30 and over), the reduced orientation-year amount and the EU Blue Card, 2026 amounts, gross per month excluding holiday pay (ind.nl/en/required-amounts-income-requirements). The Netherlands. Held in the odds 2026 parameter set, retrieved 29 September 2026.",
    "Statistics Netherlands (CBS) (2025). StatLine table 86355NED, Gross hourly wage by occupation group: 25th, 50th and 75th percentile and number of employees, 2013 to 2025 (2024 used). The Netherlands, register covering the working population.",
    "odds research notes (2026). Worked example: financial specialists and economists (CBS group 0412), median monthly pay excluding holiday pay (5,911 euros) against the IND 2026 line for ages 30 and over (5,942 euros), 29 September 2026.",
    "odds research notes (2026). Computation of monthly pay excluding holiday pay (hourly percentile times 2,080 hours divided by 12) for 77 CBS occupation groups, 2024, against the IND 2026 lines. Calculated by odds from CBS StatLine 86355NED and the IND amounts.",
    "Statistics Netherlands (CBS) (2024 data). StatLine table 81431NED, Hourly wage by sector and age band. The Netherlands. Age factors (band mean divided by sector mean) calculated by odds for finance (0.675 at 25 to 30; 0.844 at 30 to 35) and information and communication (0.708; 0.909).",
    "Immigration and Naturalisation Service (IND). Public register of recognised sponsors: 12,984 organisations with name and Chamber of Commerce (KvK) number, updated monthly. The Netherlands. Copy held by odds, retrieved 2026.",
    "odds collected postings, 29 and 30 September 2026. 13,484 Dutch job postings from five sources (company application-system boards 321, corporate career interfaces 1,367, LinkedIn entry-level searches 1,636, open job feeds 2,051, public-sector listings 8,109); occupation group, level and employer match to the IND register assigned by odds.",
    "IND and Statistics Netherlands (CBS) (October 2023, with additional analysis). Knowledge migrants and orientation-year holders in the Netherlands: cohort study of the 2017 cohort of orientation-year holders and the 2014 cohort of knowledge workers. The Netherlands.",
    "Nuffic (June 2026). Incoming degree mobility at Dutch research universities and universities of applied sciences 2025-26, based on DUO data. The Netherlands: 129,764 international degree students, 93,653 from the EEA and 36,017 from outside it.",
    "Statistics Netherlands (CBS). StatLine table 85124NED, International students in higher education, 2005/06 to 2025/26 (69,040 in 2016/17; 130,190 in 2025/26, rounded to 10). The Netherlands, based on DUO data.",
    "Nuffic (May 2025). Stay rate and labour market position of international graduates 2013 to 2022: graduate cohorts 2013-14 to 2018-19 (30,020 people at year five), stay rates, sector and gross annual salary of stayers. The Netherlands.",
    "Statistics Netherlands (CBS) (2026). StatLine tables 83815NED and 85778NED, Monthly gross wage of higher-education leavers (hbo and wo) one year after leaving, cohort 2022/23 measured October 2024, published through OCW in cijfers, September 2026. The Netherlands.",
    "odds research notes (2026). Matching of employers to the IND register: normalised company name with a short alias list and a loose word match, not a KvK join; the notes state that matches must be verified by hand.",
    "odds collected postings, 29 and 30 September 2026, posting-text flags: visa, sponsorship, relocation, work permit, 30% ruling, highly skilled migrant or kennismigrant mentioned; Dutch required; nationality or work-authorisation conditions; screening conditions. Pattern rules applied to 13,484 postings.",
    "odds research notes (2026). How the permit check works: EU and EEA citizens have no threshold; the orientation year uses the reduced line; other profiles use the under-30 or 30-and-over line by age (current year minus birth year; 30 if blank); the occupation median excluding holiday pay is compared with the line; no pay band gives 'cannot tell'; a failed check removes the interview estimate.",
    "Immigration and Naturalisation Service (IND). Jaarcijfers 2023 and 2025 (annual figures), Kennis & Talent: applications, decisions and approval rates for all knowledge and talent schemes, 2019 to 2025 (2022 and 2024 from comparison columns). The Netherlands.",
    "Statistics Netherlands (CBS). StatLine table 82027NED, Residence permits first issued (fixed term) by ground, ground 'Kenniswerker / Blue Card', IND data, 2008 to 2025. The Netherlands.",
    "Staat van Migratie 2025 (State of Migration 2025), Figure 12, permits granted in 2024 by scheme, based on IND data, p. 39. The Netherlands.",
    "Statistics Netherlands (CBS). StatLine table 85910NED, Non-EU/EFTA employees who came for knowledge work, by sector and gross hourly wage band as a multiple of the minimum wage, stock on 31 December 2024 (96,060 people). The Netherlands.",
    "odds research notes (2026). Confidence labels per statistic: pay from the CBS register high; net pay and thresholds high (law, 2026); IND sponsor status high, with the warning that a recognised sponsor is not the same as an employer that will sponsor this role; interview rate low.",
    "Belastingdienst 2026 parameters as published by KVK, Business.gov.nl and Government.nl (retrieved 29 September 2026). 30% facility: minimum salary 48,013 euros a year and 36,497 euros for under 30 with a master's degree in 2026; distance and duration test. The Netherlands.",
    "CAO Rijk (central government collective agreement), salary scale 10 from 1 July 2026: 3,496.31 to 5,535.40 euros a month for a 36-hour week, with an allowance of 16.5% of salary on top. The Netherlands.",
    "Rabobank collective agreement (CAO), salary scale 7 from 1 June 2026: 3,515.82 to 5,021.11 euros a month, with holiday pay and a thirteenth month on top. The Netherlands.",
    "Immigration and Naturalisation Service (IND). Figures for January to April 2026: Kennis & Talent applications 6,060 (6,040 in the same months of 2025). The Netherlands.",
    "Immigration and Naturalisation Service (IND). Monthly figures on regular migration, August 2026: 1,700 Kennis & Talent decisions and 1,670 new applications. The Netherlands.",
    "odds research notes (2026). Status of the Dutch implementation of EU Directive 2023/970 on pay transparency as of 29 September 2026: bill 36 949 before the Tweede Kamer, government target of entry into force 1 January 2027, pay or range to be given before the interview. The Netherlands.",
    "Nuffic (2025). Fact sheet on international students in Dutch higher education: 131,004 students in 2024-25; stay rates printed as 30% for EEA and 39% for non-EEA graduates. The Netherlands.",
    "Statistics Netherlands (CBS). StatLine table 85776NED, Higher-education leavers by labour market position, international students with a university diploma still registered in the Netherlands, cohorts to 2023/24 (updated 15 September 2026). The Netherlands; shares computed by odds.",
    "odds research notes (2026). Earlier posting pool: 321 Dutch postings from 16 employers, in which visa or relocation was mentioned in 8% of finance and business postings and 21% of tech postings.",
  ],
}

export default report
