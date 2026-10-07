import { useEffect, useState } from "react"

/**
 * What we found out about an employer beyond its postings, from public sources only: the IND register of recognised sponsors,
 * GLEIF (legal entities and owners), Wikidata (founded, staff, money, listing), GDELT (news of the last three months, labelled)
 * and the Great Place to Work NL list. Built by research-data/companies (06_merge.py, 07_export_app.py) into
 * public/companies (index.json and one file per company); every fact there names its source.
 */
export interface Money {
  amount: number
  currency?: string | null
  year?: string | null
}

export type NewsLabel = "layoffs_reorg" | "funding" | "acquisition" | "growth_hiring" | "results" | "legal_trouble" | "leadership"

export interface CompanyProfile {
  type?: string
  founded?: string
  employees?: number
  employeesSource?: string
  sizeBand?: string
  ownerGroup?: string
  ownerCountry?: string
  parent?: string
  revenue?: Money
  profit?: Money
  assets?: Money
  listedOn?: string[]
  ceo?: string
  hq?: string
  industry?: string[]
  wikipedia?: string
  wikidata?: string
  website?: string
  kvk?: string[]
  legalEntities?: string[]
  sponsor?: boolean
  sponsorEntities?: string[]
  intl?: { score_0_1: number; no_dutch_share: number; visa_mention_share: number; recognised_sponsor: boolean }
  gptw2026?: boolean
  newsCounts?: Partial<Record<NewsLabel, number>>
  news?: Array<{ title: string; url: string; site?: string; date?: string; labels: NewsLabel[] }>
  summary?: string
  sources?: string[]
  /** Plain-language insights written from the sources above, each line with its own source (research-data/companies/WRITER_BRIEF.md). */
  insights?: CompanyInsights
}

export interface Insight {
  text: string
  source: string
}

export interface CompanyInsights {
  one_liner?: string
  culture?: Insight[]
  open?: Insight[]
  growth?: Insight[]
  worth_knowing?: Insight[]
}

export const INSIGHT_GROUPS: ReadonlyArray<{ key: keyof Omit<CompanyInsights, "one_liner">; title: string }> = [
  { key: "culture", title: "Culture" },
  { key: "open", title: "Open to internationals" },
  { key: "growth", title: "Growth" },
  { key: "worth_knowing", title: "Worth knowing" },
]

/**
 * The data comes in two parts (research-data/companies/07_export_app.py): public/companies/index.json, small, with what lists need
 * (sponsor, size, type, owner country, layoff headlines), and one file per company, public/companies/c/<hash>.json, fetched only
 * when that company is opened. The hash is FNV-1a of the employer key, the same function the export uses.
 */
export function companyFile(employer: string): string {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(employer)) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }

  return `/companies/c/${h.toString(16).padStart(8, "0")}.json`
}

let index: Promise<Record<string, CompanyProfile>> | null = null
const one = new Map<string, Promise<CompanyProfile | null>>()

/** What every list needs about every company, fetched once per visit. Empty when the file is missing: the page then shows what it showed before. */
export function loadCompanyProfiles(): Promise<Record<string, CompanyProfile>> {
  index ??= fetch("/companies/index.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ companies: Record<string, CompanyProfile> }>) : { companies: {} }))
    .then((d) => d.companies ?? {})
    .catch(() => ({}))

  return index
}

/** Everything about one company, fetched the first time it is opened. Null when there is none. */
export function loadCompanyProfile(employer: string): Promise<CompanyProfile | null> {
  let p = one.get(employer)
  if (!p) {
    p = fetch(companyFile(employer))
      .then((r) => (r.ok ? (r.json() as Promise<CompanyProfile>) : null))
      .catch(() => null)
    one.set(employer, p)
  }

  return p
}

/** Every company's list facts at once. Empty until the index has loaded. */
export function useCompanyProfiles(): Record<string, CompanyProfile> {
  const [all, setAll] = useState<Record<string, CompanyProfile>>({})
  useEffect(() => {
    let live = true
    void loadCompanyProfiles().then((m) => {
      if (live) setAll(m)
    })

    return () => {
      live = false
    }
  }, [])

  return all
}

/** A short tag for the kind of company: "Listed", "Startup", "Part of a US group". Null when it is not known. */
export function typeTag(p: CompanyProfile | undefined): string | null {
  if (!p?.type) return null
  if (p.type.startsWith("listed")) return "Listed"
  if (p.type.startsWith("startup")) return "Startup / scale-up"
  if (p.type.startsWith("part of a foreign group")) return p.ownerCountry ? `Part of a ${p.ownerCountry} group` : "Part of a foreign group"
  if (p.type.startsWith("public")) return "Public sector / education"
  if (p.type === "non-profit") return "Non-profit"
  return null
}

export function useCompanyProfile(employer: string): CompanyProfile | null {
  // Kept with the employer it belongs to, so a job at another company never shows the last one's facts while its own load.
  const [state, setState] = useState<{ employer: string; profile: CompanyProfile | null } | null>(null)
  useEffect(() => {
    let live = true
    void loadCompanyProfile(employer).then((profile) => {
      if (live) setState({ employer, profile })
    })

    return () => {
      live = false
    }
  }, [employer])

  return state?.employer === employer ? state.profile : null
}

export const NEWS_LABEL: Record<NewsLabel, string> = {
  layoffs_reorg: "Layoffs or reorganisation",
  funding: "Funding",
  acquisition: "Acquisitions",
  growth_hiring: "Growth or hiring",
  results: "Financial results",
  legal_trouble: "Legal trouble, strikes or bankruptcy",
  leadership: "Leadership changes",
}

/** "€1.2 billion (2024)", in the currency it was reported in. */
export function moneyLine(m: Money): string {
  const sym: Record<string, string> = { euro: "€", "United States dollar": "$", "pound sterling": "£", "Swiss franc": "CHF ", "Japanese yen": "¥", "Swedish krona": "SEK ", "Danish krone": "DKK ", "Norwegian krone": "NOK ", "renminbi": "CN¥" }
  const s = m.currency ? (sym[m.currency] ?? `${m.currency} `) : ""
  const a = Math.abs(m.amount)
  const v = a >= 1e9 ? `${(m.amount / 1e9).toFixed(1)} billion` : a >= 1e6 ? `${Math.round(m.amount / 1e6)} million` : Math.round(m.amount).toLocaleString("en-US")

  return `${s}${v}${m.year ? ` (${m.year})` : ""}`
}

/** One plain sentence on how open the employer looks to someone from abroad, from what its postings and the IND register say. */
export function internationalVerdict(p: CompanyProfile): string | null {
  if (!p.intl) return null
  const noDutch = Math.round(p.intl.no_dutch_share * 100)
  if (p.sponsor && noDutch >= 80) return "Open to internationals: a recognised visa sponsor, and most of its jobs here don't need Dutch."
  if (p.sponsor) return `A recognised visa sponsor, but ${100 - noDutch}% of its jobs here ask for Dutch.`
  if (noDutch >= 80) return "Most of its jobs here don't need Dutch, but it is not on the IND sponsor list: from outside the EU, check how it would get you a permit."
  return "Not on the IND sponsor list, and many of its jobs here ask for Dutch."
}
