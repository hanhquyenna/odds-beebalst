import { useEffect, useState } from "react"

/**
 * What we found out about an employer beyond its postings, from public sources only: the IND register of recognised sponsors,
 * GLEIF (legal entities and owners), Wikidata (founded, staff, money, listing), GDELT (news of the last three months, labelled)
 * and the Great Place to Work NL list. Built by research-data/companies (06_merge.py, 07_export_app.py) into
 * public/companies/enriched.json; every fact there names its source. Loaded once, the first time a company is opened.
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

let all: Promise<Record<string, CompanyProfile>> | null = null

/** Every profile, fetched once per visit. An empty map when the file is missing or unreadable: the page then shows what it showed before. */
export function loadCompanyProfiles(): Promise<Record<string, CompanyProfile>> {
  all ??= fetch("/companies/enriched.json")
    .then((r) => (r.ok ? (r.json() as Promise<{ companies: Record<string, CompanyProfile> }>) : { companies: {} }))
    .then((d) => d.companies ?? {})
    .catch(() => ({}))

  return all
}

/** Every profile at once, for lists. Empty until the file has loaded. */
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
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  useEffect(() => {
    let live = true
    void loadCompanyProfiles().then((m) => {
      if (live) setProfile(m[employer] ?? null)
    })

    return () => {
      live = false
    }
  }, [employer])

  return profile
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
