import type { Posting } from "../../src/lib/types"
import { posting } from "./postings"

const EMPLOYERS: ReadonlyArray<[string, string]> = [
  ["ABN AMRO Bank N.V.", "Banking"],
  ["Adyen", "Financial services"],
  ["ASML", "Semiconductors"],
  ["Booking.com", "Hospitality & travel"],
  ["Coolblue", "Retail & e-commerce"],
  ["Deloitte", "Consulting"],
  ["Elastic", "Software & internet"],
  ["EY", "Accounting"],
  ["Heineken", "Food & consumer goods"],
  ["ING", "Banking"],
  ["KLM", "Hospitality & travel"],
  ["KPMG", "Accounting"],
  ["Mollie", "Financial services"],
  ["NN Group", "Insurance"],
  ["Philips", "Health & life sciences"],
  ["Picnic", "Retail & e-commerce"],
  ["PostNL", "Transport & logistics"],
  ["Rabobank", "Banking"],
  ["Shell", "Energy & utilities"],
  ["Unilever", "Food & consumer goods"],
]

const ROLES: ReadonlyArray<{ title: string; family: string; cat: Posting["cat"]; cbs: string; skills: string[] }> = [
  { title: "Financial Analyst", family: "Finance & accounting", cat: "finance_business", cbs: "0412", skills: ["Excel", "SQL"] },
  { title: "Accountant", family: "Finance & accounting", cat: "finance_business", cbs: "0411", skills: ["SAP", "IFRS"] },
  { title: "Data Analyst", family: "Data, analytics & AI", cat: "tech", cbs: "0811", skills: ["Python", "SQL"] },
  { title: "Software Engineer", family: "Software engineering", cat: "tech", cbs: "0811", skills: ["TypeScript", "Go"] },
  { title: "Marketing Specialist", family: "Marketing & communications", cat: "other", cbs: "0431", skills: ["SEO", "Google Ads"] },
  { title: "Recruiter", family: "HR & recruiting", cat: "other", cbs: "0421", skills: ["Sourcing"] },
  { title: "Supply Chain Planner", family: "Operations & supply chain", cat: "other", cbs: "0432", skills: ["Planning", "Excel"] },
  { title: "Risk Analyst", family: "Risk, compliance & legal", cat: "finance_business", cbs: "0412", skills: ["Basel", "Python"] },
  { title: "Product Owner", family: "Product & project management", cat: "tech", cbs: "0811", skills: ["Scrum", "Jira"] },
  { title: "Account Manager", family: "Sales & account management", cat: "other", cbs: "0433", skills: ["CRM", "Salesforce"] },
]

const PREFIXES: ReadonlyArray<{ word: string; level: NonNullable<Posting["level_view"]> }> = [
  { word: "Junior", level: "Entry" },
  { word: "Graduate", level: "Entry" },
  { word: "Intern", level: "Internship" },
  { word: "Medior", level: "Mid" },
  { word: "Senior", level: "Senior" },
]

const CITIES: ReadonlyArray<string> = ["Amsterdam, North Holland", "Rotterdam, South Holland", "Utrecht, Utrecht", "The Hague, South Holland", "Eindhoven, North Brabant", "Groningen, Groningen"]

/** A large, deterministic pool for the perf spec: every employer, role, level and city mixed, a seventh asking for Dutch. */
export function generatePostings(count: number): Posting[] {
  return Array.from({ length: count }, (_, i): Posting => {
    const [employer, industry] = EMPLOYERS[i % EMPLOYERS.length]
    // Shifted every round of employers, so each employer gets every role, level and city.
    const round = Math.floor(i / EMPLOYERS.length)
    const role = ROLES[round % ROLES.length]
    const prefix = PREFIXES[(i + round) % PREFIXES.length]
    const title = prefix.level === "Internship" ? `${role.title} Intern` : `${prefix.word} ${role.title}`

    return posting({
      id: `gen-${String(i).padStart(5, "0")}`,
      employer: employer,
      title: `${title} ${Math.floor(i / 200) + 1}`,
      region: CITIES[(i + round) % CITIES.length],
      cat: role.cat,
      cbs_group: role.cbs,
      family: role.family,
      industry: industry,
      level_view: prefix.level,
      role_kind: prefix.level === "Internship" ? "internship" : "entry_job",
      skills: role.skills,
      days: i % 45,
      dutch_required: i % 7 === 3,
    })
  })
}
