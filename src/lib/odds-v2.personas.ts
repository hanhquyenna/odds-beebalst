// Personas x jobs: what odds-v2 says, next to the range common sense and the studies allow. Shared by the tests and the report.
import { DEFAULT_PROFILE, type Posting, type Profile } from "@/lib/types"

export const job = (o: Partial<Posting> & { title: string; employer: string }): Posting => ({
  id: o.title, employer_display: o.employer, ats: "x", source: "x", region: "Amsterdam", cat: "finance_business", cbs_group: null, url: null,
  ind_sponsor: true, ind_sponsor_name: null, years_min: null, dutch_required: false, visa_mention: false, junior_title: false, degree_asked: null,
  skills: [], pay_posted: null, applicants: null, applicants_text: null, valid_through: null, seniority: null, posted_at: null, days_open: null,
  freshness_state: "fresh", fetched_at: null, ...o,
}) as Posting

const role = (Title: string, company: string, from: number, to: number, Location = "Amsterdam, Netherlands") => ({ Title, "Company Name": company, "Started On": `Jan ${from}`, "Finished On": `Jan ${to}`, Location })
const edu = (degree: string, school = "University of Amsterdam") => ({ "School Name": school, "Degree Name": degree, "Start Date": "2019", "End Date": "2023" })
const person = (o: Partial<Profile>): Profile => ({ ...DEFAULT_PROFILE, origin: "non_eu", dutch: "none", ...o })

export const PEOPLE = {
  gsAnalyst: person({ positions: [role("Investment Banking Analyst", "Goldman Sachs", 2023, 2026, "London, United Kingdom")], education: [edu("MSc Finance")] }),
  midFinanceIntern: person({ positions: [role("Finance Intern", "Van Oord", 2025, 2026)], education: [edu("MSc Finance")] }),
  freshFinanceGrad: person({ positions: [], education: [edu("MSc Finance")] }),
  barista: person({ positions: [role("Barista", "Starbucks", 2022, 2026)], education: [edu("BA History")] }),
  googleSwe: person({ positions: [role("Software Engineer", "Google", 2023, 2026, "Zurich, Switzerland")], education: [edu("BSc Computer Science")] }),
  googleSweDutchEu: person({ origin: "dutch", dutch: "native", positions: [role("Software Engineer", "Google", 2023, 2026, "Zurich, Switzerland")], education: [edu("BSc Computer Science")] }),
  mckinseyMarketingToFinance: person({ positions: [role("Marketing Manager", "McKinsey", 2022, 2026)], education: [edu("BA Communication")] }),
  indiaOnlyFinance: person({ positions: [role("Financial Analyst", "Infosys", 2021, 2025, "Bangalore, India")], education: [edu("BCom Finance", "University of Delhi")] }),
}

export const JOBS = {
  startupFinance: job({ title: "Finance Analyst", employer: "Some Scale-up BV", family: "Finance & accounting", applicants: 60, level_view: "Entry" }),
  eliteBankAnalyst: job({ title: "Investment Banking Analyst", employer: "J.P. Morgan", family: "Finance & accounting", level_view: "Entry" }),
  midFinanceEntry: job({ title: "Junior Financial Analyst", employer: "Mid Company", family: "Finance & accounting", applicants: 180, level_view: "Entry" }),
  big4Audit: job({ title: "Audit Associate", employer: "KPMG", family: "Finance & accounting", level_view: "Entry" }),
  scaleupSwe: job({ title: "Software Engineer", employer: "Scale-up", family: "Software engineering", cat: "tech", applicants: 120, level_view: "Mid", years_min: 2 }),
  scaleupMarketing: job({ title: "Marketing Manager", employer: "Scale-up", family: "Marketing & communications", applicants: 120, level_view: "Mid", years_min: 2 }),
  financeIntern: job({ title: "Finance Intern", employer: "Mid Company", family: "Finance & accounting", applicants: 150, level_view: "Internship", role_kind: "internship" }),
  seniorFinance: job({ title: "Senior Finance Manager", employer: "Mid Company", family: "Finance & accounting", applicants: 80, level_view: "Senior", years_min: 7 }),
  dutchFinance: job({ title: "Financial Controller", employer: "Mid Company", family: "Finance & accounting", applicants: 90, level_view: "Mid", years_min: 2, dutch_required: true }),
}

/** [person, job, lowest acceptable %, highest acceptable %, why] */
export const EXPECT: Array<[keyof typeof PEOPLE, keyof typeof JOBS, number, number, string]> = [
  ["gsAnalyst", "startupFinance", 50, 90, "Top relevant pedigree into a small, less sought-after pile"],
  ["gsAnalyst", "eliteBankAnalyst", 10, 50, "Same pedigree, but the most sought-after pile there is"],
  ["midFinanceIntern", "midFinanceEntry", 8, 35, "Relevant internship, ordinary employer, typical pile (matched CV 19-38%)"],
  ["freshFinanceGrad", "financeIntern", 5, 30, "Finance master's, no experience, internship"],
  ["freshFinanceGrad", "eliteBankAnalyst", 0, 4, "No experience into the hardest pile"],
  ["barista", "big4Audit", 0, 3, "Unrelated work and degree"],
  ["googleSwe", "scaleupSwe", 25, 85, "Relevant big-tech engineer into a scale-up, non-EU background and degree (no study gives this case; range is judgement, widened after the backtest)"],
  ["googleSweDutchEu", "scaleupSwe", 45, 90, "Same, Dutch background and native Dutch"],
  ["googleSwe", "scaleupMarketing", 0, 12, "Big name, other line of work: prestige alone does little"],
  ["mckinseyMarketingToFinance", "startupFinance", 2, 25, "Elite name, adjacent work"],
  ["gsAnalyst", "seniorFinance", 2, 35, "Asks 7+ years, has 3 (no study measures large shortfalls; range is judgement, widened after the backtest)"],
  ["indiaOnlyFinance", "midFinanceEntry", 5, 30, "Relevant, but all experience outside the EU"],
]
