import type { Posting } from "../../src/lib/types"

/** The hand-written pool the flow specs read: ten jobs show under the default filters (first jobs, no Dutch). */
export const FLOW_POSTINGS: Posting[] = [
  posting({ id: "e2e-adyen-fin-analyst", employer: "Adyen", title: "Junior Financial Analyst", region: "Amsterdam, North Holland", cat: "finance_business", cbs_group: "0412", family: "Finance & accounting", industry: "Financial services", level_view: "Entry", skills: ["Excel", "SQL", "Financial modelling"], pay_posted: "€3,600 - €4,200 per month", days: 2 }),
  posting({ id: "e2e-booking-data-intern", employer: "Booking.com", title: "Data Analyst Intern", region: "Amsterdam, North Holland", cat: "tech", cbs_group: "0811", family: "Data, analytics & AI", industry: "Hospitality & travel", level_view: "Internship", role_kind: "internship", skills: ["Python", "SQL", "Tableau"], days: 5 }),
  posting({ id: "e2e-asml-grad-swe", employer: "ASML", title: "Graduate Software Engineer", region: "Veldhoven, North Brabant", cat: "tech", cbs_group: "0811", family: "Software engineering", industry: "Semiconductors", level_view: "Entry", skills: ["C++", "Python", "Linux"], days: 9 }),
  posting({ id: "e2e-heineken-mkt-trainee", employer: "Heineken", title: "Marketing Trainee", region: "Amsterdam, North Holland", cat: "other", cbs_group: "0431", family: "Marketing & communications", industry: "Food & consumer goods", level_view: "Entry", role_kind: "traineeship", skills: ["Brand management", "Market research"], days: 14 }),
  posting({ id: "e2e-kpmg-audit", employer: "KPMG", title: "Audit Associate", region: "Amstelveen, North Holland", cat: "finance_business", cbs_group: "0411", family: "Finance & accounting", industry: "Accounting", level_view: "Entry", skills: ["IFRS", "Excel"], days: 21 }),
  posting({ id: "e2e-philips-accountant", employer: "Philips", title: "Junior Accountant", region: "Eindhoven, North Brabant", cat: "finance_business", cbs_group: "0411", family: "Finance & accounting", industry: "Health & life sciences", level_view: "Entry", skills: ["SAP", "Excel"], days: 30 }),
  posting({ id: "e2e-unilever-sc-intern", employer: "Unilever", title: "Supply Chain Intern", region: "Rotterdam, South Holland", cat: "other", cbs_group: "0432", family: "Operations & supply chain", industry: "Food & consumer goods", level_view: "Internship", role_kind: "internship", skills: ["Excel", "Planning"], days: 3 }),
  posting({ id: "e2e-bunq-backend", employer: "bunq", title: "Junior Backend Developer", region: "Amsterdam, North Holland", cat: "tech", cbs_group: "0811", family: "Software engineering", industry: "Banking", level_view: "Entry", skills: ["Java", "PostgreSQL"], days: 7 }),
  posting({ id: "e2e-ing-hr-intern", employer: "ING", title: "HR Intern", region: "Amsterdam, North Holland", cat: "other", cbs_group: "0421", family: "HR & recruiting", industry: "Banking", level_view: "Internship", role_kind: "internship", skills: ["Recruiting"], days: 12 }),
  posting({ id: "e2e-picnic-cs-intern", employer: "Picnic", title: "Customer Success Intern", region: "Amsterdam, North Holland", cat: "other", cbs_group: "0422", family: "Customer support & service", industry: "Retail & e-commerce", level_view: "Internship", role_kind: "internship", skills: ["Zendesk"], days: 1 }),
  // Hidden by default: asks for Dutch.
  posting({ id: "e2e-rabobank-controller", employer: "Rabobank", title: "Junior Business Controller", region: "Utrecht, Utrecht", cat: "finance_business", cbs_group: "0412", family: "Finance & accounting", industry: "Banking", level_view: "Entry", dutch_required: true, skills: ["Excel", "Power BI"], days: 4 }),
  // Hidden by default: not a first job.
  posting({ id: "e2e-mollie-senior-de", employer: "Mollie", title: "Senior Data Engineer", region: "Amsterdam, North Holland", cat: "tech", cbs_group: "0811", family: "Software engineering", industry: "Financial services", level_view: "Senior", years_min: 6, skills: ["Python", "Spark", "dbt"], days: 6 }),
]

/** How many of FLOW_POSTINGS the list shows with its default filters. */
export const DEFAULT_VISIBLE = 10

/** The posting text the detail page loads on its own (postings.body). */
export const BODIES: Record<string, string> = {
  "e2e-adyen-fin-analyst": [
    "About the role",
    "As a Junior Financial Analyst you join the Finance team in Amsterdam and help close the books every month.",
    "",
    "What you bring",
    "- A bachelor's or master's degree in finance, economics or econometrics",
    "- Strong Excel and some SQL",
    "- Fluent English; Dutch is not required",
    "",
    "What we offer",
    "A salary of €3,600 to €4,200 a month, 25 holiday days and a hybrid way of working.",
  ].join("\n"),
}

interface PostingSeed {
  id: string
  employer: string
  title: string
  region: string
  cat: Posting["cat"]
  cbs_group: string
  family: string
  industry: string
  level_view: NonNullable<Posting["level_view"]>
  role_kind?: Posting["role_kind"]
  skills: string[]
  days: number
  dutch_required?: boolean
  years_min?: number
  pay_posted?: string
}

/** One row as the app_jobs view returns it: every selected column present, the way PostgREST sends it. */
export function posting(seed: PostingSeed): Posting {
  const postedOn = daysAgo(seed.days)

  return {
    id: seed.id,
    employer: seed.employer,
    employer_display: seed.employer,
    ats: "greenhouse",
    source: "greenhouse",
    title: seed.title,
    region: seed.region,
    cat: seed.cat,
    cbs_group: seed.cbs_group,
    url: `https://jobs.example.com/${seed.id}`,
    ind_sponsor: true,
    ind_sponsor_name: seed.employer,
    years_min: seed.years_min ?? null,
    dutch_required: seed.dutch_required ?? false,
    visa_mention: false,
    junior_title: seed.level_view === "Entry" || seed.level_view === "Internship",
    degree_asked: "bachelor",
    skills: seed.skills,
    pay_posted: seed.pay_posted ?? null,
    applicants: 42,
    applicants_text: "42 applicants",
    valid_through: null,
    seniority: null,
    posted_at: `${postedOn}T09:00:00Z`,
    days_open: seed.days,
    freshness_state: seed.days <= 6 ? "fresh" : "active",
    fetched_at: `${daysAgo(0)}T05:00:00Z`,
    title_clean: seed.title,
    level_jev: null,
    level_conf: null,
    usable: 0.95,
    industry: seed.industry,
    workplace: "hybrid",
    job_type: "fulltime",
    dutch_jev: seed.dutch_required ? 0.95 : 0.05,
    family: seed.family,
    level_view: seed.level_view,
    kept_id: seed.id,
    pick_rank: 1,
    role_kind: seed.role_kind ?? "entry_job",
    closed_at: null,
    last_checked: `${daysAgo(0)}T05:00:00Z`,
    posted_on: postedOn,
    skill_tiers: null,
    enrollment: null,
  }
}

/** A YYYY-MM-DD date the given number of days before today. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}
