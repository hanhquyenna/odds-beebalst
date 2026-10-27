/**
 * The people to ask about a job are the ones who do the same kind of work every day, not only the ones with the same title.
 * Each department the postings are sorted into (the `family` column) lists the job titles to look for at the company.
 * Our own list: no source measures which titles belong to a department.
 */
export const DEPARTMENT_TITLES: Record<string, string[]> = {
  "Finance & accounting": ["finance", "financial analyst", "accountant", "controller", "FP&A", "treasury", "audit"],
  "Software engineering": ["software engineer", "developer", "backend engineer", "frontend engineer"],
  "Data, analytics & AI": ["data analyst", "data scientist", "analytics", "machine learning", "business intelligence"],
  "Sales & account management": ["sales", "account manager", "business development"],
  "Product & project management": ["product manager", "project manager", "program manager"],
  "Risk, compliance & legal": ["risk", "compliance", "legal", "counsel"],
  "Operations & supply chain": ["operations", "supply chain", "logistics", "planner"],
  "IT, cloud & security": ["IT", "cloud", "security", "devops", "infrastructure"],
  "Research & academia": ["researcher", "scientist", "research"],
  "Consulting & strategy": ["consultant", "strategy"],
  "Hardware & engineering": ["engineer", "mechanical", "electrical", "hardware"],
  "Marketing & communications": ["marketing", "communications", "brand", "content"],
  "HR & recruiting": ["HR", "recruiter", "talent acquisition", "people"],
  "Healthcare & life sciences": ["clinical", "medical", "healthcare", "life sciences"],
  "Customer support & service": ["customer success", "customer support", "customer service"],
  "Design & UX": ["designer", "UX", "UI"],
}

/**
 * Departments that sit next to each other, nearest first: when nobody is found in a job's own department, the next ones are tried.
 * Our own list, the same idea as the neighbours used for the track record (src/lib/strength.ts), with operations and project work added next to
 * engineering, since that is who a shipyard or a factory hires around the engineers.
 */
const ADJACENT_GROUPS: string[][] = [
  ["Finance & accounting", "Risk, compliance & legal", "Consulting & strategy"],
  ["Software engineering", "Data, analytics & AI", "IT, cloud & security", "Hardware & engineering"],
  ["Hardware & engineering", "Operations & supply chain", "Product & project management"],
  ["Marketing & communications", "Sales & account management", "Customer support & service", "Design & UX"],
  ["Product & project management", "Consulting & strategy", "Operations & supply chain", "Design & UX"],
  ["Research & academia", "Data, analytics & AI", "Healthcare & life sciences"],
  ["HR & recruiting", "Operations & supply chain", "Customer support & service"],
]

/** The neighbouring departments of one department, in the order they are tried. */
export function adjacentDepartments(family: string | null | undefined): string[] {
  if (!family) return []
  const out: string[] = []
  for (const g of ADJACENT_GROUPS) {
    if (!g.includes(family)) continue
    for (const f of g) if (f !== family && !out.includes(f)) out.push(f)
  }

  return out
}

/** Titles to search for in the neighbouring departments, two from each so every neighbour gets a turn. */
export function adjacentTitles(family: string | null | undefined): { titles: string[]; departments: string[] } {
  const departments = adjacentDepartments(family).slice(0, 4)
  const titles = [...new Set(departments.flatMap((d) => (DEPARTMENT_TITLES[d] ?? []).slice(0, 3)))].slice(0, 12)

  return { titles, departments }
}
