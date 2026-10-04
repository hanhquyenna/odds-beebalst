// Turns one LinkedIn company page, as the Apify actor harvestapi~linkedin-company returns it, into a row for public.employer_facts, and names the industry
// in the app's own words. Pure functions, shared by the Edge Function add-job (Deno) and the tests (bun).

export interface CompanyItem {
  name?: string
  logo?: string
  logos?: Array<{ url?: string; width?: string | number }>
  linkedinUrl?: string
  tagline?: string
  description?: string
  website?: string
  foundedOn?: { year?: number | null } | null
  employeeCount?: number | null
  employeeCountRange?: { start?: number; end?: number } | null
  followerCount?: number | null
  companyType?: string | null
  locations?: Array<{ headquarter?: boolean; parsed?: { text?: string; city?: string; country?: string } }>
  industries?: Array<{ name?: string }>
  specialities?: string[]
  peopleStats?: Array<{ statTitle?: string; values?: Array<{ title: string; count: number }> }>
}

const norm = (s: string): string => s.toLowerCase().replace(/&amp;/g, "&").replace(/[^a-z0-9]/g, "")

/** The page is the employer's: its name contains the employer's, or the other way round. A search that lands on a different company is dropped, not saved. */
export function sameCompany(employer: string, pageName: string | undefined): boolean {
  const a = norm(employer)
  const b = norm(pageName ?? "")

  return a !== "" && b !== "" && (a.includes(b) || b.includes(a))
}

/** LinkedIn's industry names, in the order the app's own industries are tried. The first that matches wins. */
const INDUSTRY: Array<[RegExp, string]> = [
  [/it services|it consulting|information technology|cyber|computer (and )?network|managed services/i, "IT services"],
  [/banking/i, "Banking"],
  [/insurance/i, "Insurance"],
  [/accounting/i, "Accounting"],
  [/financial|investment|capital markets|venture|private equity|asset management|wealth|fintech|payments/i, "Financial services"],
  [/consulting|advisory/i, "Consulting"],
  [/law practice|legal/i, "Legal"],
  [/staffing|recruit|human resources|executive search/i, "Staffing & recruiting"],
  [/semiconductor/i, "Semiconductors"],
  [/telecom|wireless/i, "Telecommunications"],
  [/retail|e-?commerce|wholesale|online marketplace/i, "Retail & e-commerce"],
  [/hospitality|restaurant|hotel|travel|tourism|leisure|fitness|gambling|casino|events/i, "Hospitality & travel"],
  [/hospital|health|pharma|biotech|medical|life science|veterinar|wellness|clinical/i, "Health & life sciences"],
  [/oil|gas\b|energy|utilities|renewable|electric power|environmental|mining/i, "Energy & utilities"],
  [/construction|civil engineering|architecture|real estate development|building/i, "Construction"],
  [/real estate|property/i, "Real estate"],
  [/logistics|transportation|airline|aviation|shipping|maritime|freight|warehous|trucking|supply chain/i, "Transport & logistics"],
  [/software|internet|computer games|online (media|services)|artificial intelligence|data infrastructure|technology, information/i, "Software & internet"],
  [/marketing|advertising|public relations|media|publishing|design|broadcast|market research|entertainment|film|music/i, "Media & marketing"],
  [/education|university|higher education|e-learning|school|research services|think tank/i, "Education"],
  [/government|non-?profit|civic|international affairs|philanthropic|public (policy|safety)|religious/i, "Government & non-profit"],
  [/food|beverage|consumer goods|cosmetic|personal care|apparel|fashion|luxury|tobacco|dairy|agricultur|farming|wine|spirits/i, "Food & consumer goods"],
  [/manufactur|machinery|automotive|vehicle|aerospace|defense|electrical|electronic|industrial|chemical|plastics|packaging|appliance|consumer electronics|mechanical|equipment|shipbuilding|semiconductor/i, "Manufacturing"],
]

/** The app's industry for LinkedIn's industry name(s), or null when none fits. */
export function industryFromLinkedIn(names: ReadonlyArray<string>): string | null {
  for (const name of names) {
    const hit = INDUSTRY.find(([rx]) => rx.test(name))
    if (hit) return hit[1]
  }

  return null
}

const stat = (x: CompanyItem, title: string): Array<{ title: string; count: number }> | null => {
  const found = x.peopleStats?.find((s) => s.statTitle === title)?.values

  return found && found.length ? found.slice(0, 6).map((v) => ({ title: v.title, count: v.count })) : null
}

/** One employer_facts row for this company page, saved under `employer` (the key postings use). `logo` is a data URL or null. */
export function factsRow(employer: string, x: CompanyItem, logo: string | null): Record<string, unknown> {
  const hq = x.locations?.find((l) => l.headquarter)?.parsed?.text ?? null
  const range = x.employeeCountRange
  const names = (x.industries ?? []).map((i) => i.name).filter((n): n is string => Boolean(n))

  return {
    employer,
    linkedin_url: x.linkedinUrl ?? null,
    name: x.name ?? null,
    tagline: x.tagline ?? null,
    description: x.description ?? null,
    website: x.website ?? null,
    founded_year: x.foundedOn?.year ?? null,
    employees: x.employeeCount ?? null,
    employee_range: range?.start ? (range.end ? `${range.start}-${range.end}` : `${range.start}+`) : null,
    followers: x.followerCount ?? null,
    company_type: x.companyType ?? null,
    headquarters: hq,
    locations: (x.locations ?? []).slice(0, 12).map((l) => ({ city: l.parsed?.city ?? null, country: l.parsed?.country ?? null })),
    linkedin_industry: names.join(", ") || null,
    specialities: x.specialities?.length ? x.specialities.slice(0, 12) : null,
    top_locations: stat(x, "Locations"),
    top_schools: stat(x, "School"),
    top_functions: stat(x, "Current Function"),
    top_fields: stat(x, "Field of Study"),
    logo,
  }
}

/** The smallest logo the page offers (100 pixels wide where it has one): small enough to keep in the database. */
export function smallLogoOf(x: CompanyItem | undefined): string | undefined {
  const sized = (x?.logos ?? []).filter((l) => l.url).map((l) => ({ url: l.url as string, w: Number(l.width) || 9999 })).sort((a, b) => a.w - b.w)

  return sized[0]?.url ?? x?.logo
}
