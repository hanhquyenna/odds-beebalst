import { useEffect, useState } from "react"
import { companyFile } from "@/lib/company-profile"
import type { PastRole } from "@/lib/past-roles"
import { supabase } from "@/lib/supabase"

export type { PastRole } from "@/lib/past-roles"

/**
 * What a job's page shows about its company and about the people who held the role before, each read in one call
 * (database functions job_company and job_successful_candidates). Only data as it was scraped: the company's LinkedIn page,
 * its Glassdoor numbers and reviews, and the public profiles of people whose history matches the role. No generated text.
 */

export interface Counted {
  title: string
  count: number
}

export interface CompanyFacts {
  name: string | null
  tagline: string | null
  description: string | null
  website: string | null
  linkedin: string | null
  founded: number | null
  employees: number | null
  employeeRange: string | null
  followers: number | null
  type: string | null
  headquarters: string | null
  locations: Array<{ city?: string; country?: string }> | null
  industry: string | null
  specialities: string[] | null
  topSchools: Counted[] | null
  topFunctions: Counted[] | null
  topFields: Counted[] | null
  readOn: string | null
}

export interface GlassdoorSummary {
  url: string | null
  rating: number | null
  reviews: number | null
  recommendPct: number | null
  ceo: string | null
  ceoApprovalPct: number | null
  readOn: string | null
}

export interface ReviewStats {
  count: number
  overall: number | null
  culture: number | null
  balance: number | null
  career: number | null
  pay: number | null
  management: number | null
  diversity: number | null
  recommendPct: number | null
  newest: string | null
  oldest: string | null
}

export interface Review {
  date: string | null
  title: string | null
  role: string | null
  status: string | null
  place: string | null
  overall: number | null
  recommend: string | null
  pros: string | null
  cons: string | null
}

export interface MoneyFact {
  /** "revenue", "net_profit" or "market_value". */
  kind: string
  amount: number
  currency: string | null
  year: number | null
  source: string | null
}

export interface NewsItem {
  title: string
  url: string | null
  site: string | null
  date: string | null
}

export interface JobCompany {
  money: MoneyFact[]
  news: NewsItem[]
  facts: CompanyFacts | null
  glassdoor: GlassdoorSummary | null
  reviewStats: ReviewStats | null
  reviews: Review[]
}


export interface PastSchool {
  school: string | null
  degree: string | null
  field: string | null
  start: string | null
  end: string | null
}

export interface PastHire {
  id: string
  name: string | null
  headline: string | null
  currentPosition: string | null
  location: string | null
  avatar: string | null
  linkedin: string | null
  /** "exact": held this role; "adjacent": a role very like it at this employer. */
  status: "exact" | "adjacent"
  confidence: number | null
  experience: PastRole[]
  education: PastSchool[]
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)

const companies = new Map<string, Promise<JobCompany | null>>()
const hires = new Map<string, Promise<PastHire[]>>()

export function loadJobCompany(employer: string, display: string): Promise<JobCompany | null> {
  const key = `${employer}\u0000${display}`
  let p = companies.get(key)
  if (!p) {
    p = Promise.resolve(supabase.rpc("job_company", { p_employer: employer, p_display: display })).then(({ data, error }) => {
      if (error || !data) return null
      const d = data as { money?: MoneyFact[] | null; news?: NewsItem[] | null; facts: CompanyFacts | null; glassdoor: Record<string, unknown> | null; reviewStats: Record<string, unknown> | null; reviews: Array<Record<string, unknown>> | null }
      const g = d.glassdoor
      const s = d.reviewStats

      return {
        money: (d.money ?? []).map((m) => ({ ...m, amount: Number(m.amount) })).filter((m) => Number.isFinite(m.amount)),
        news: (d.news ?? []).filter((n) => n.title),
        facts: d.facts,
        glassdoor: g ? { url: (g.url as string) ?? null, rating: num(g.rating), reviews: num(g.reviews), recommendPct: num(g.recommendPct), ceo: (g.ceo as string) ?? null, ceoApprovalPct: num(g.ceoApprovalPct), readOn: (g.readOn as string) ?? null } : null,
        reviewStats: s ? { count: num(s.count) ?? 0, overall: num(s.overall), culture: num(s.culture), balance: num(s.balance), career: num(s.career), pay: num(s.pay), management: num(s.management), diversity: num(s.diversity), recommendPct: num(s.recommendPct), newest: (s.newest as string) ?? null, oldest: (s.oldest as string) ?? null } : null,
        reviews: (d.reviews ?? []).map((r) => ({ date: (r.date as string) ?? null, title: (r.title as string) ?? null, role: (r.role as string) ?? null, status: (r.status as string) ?? null, place: (r.place as string) ?? null, overall: num(r.overall), recommend: (r.recommend as string) ?? null, pros: (r.pros as string) ?? null, cons: (r.cons as string) ?? null })),
      }
    })
    companies.set(key, p)
  }

  return p
}

/** Only for a signed-in caller (the database answers no one else): asked again after signing in, so the empty answer from before is not kept. */
export function loadPastHires(postingId: string, signedIn: boolean): Promise<PastHire[]> {
  if (!signedIn) return Promise.resolve([])
  let p = hires.get(postingId)
  if (!p) {
    p = Promise.resolve(supabase.rpc("job_successful_candidates", { p_posting: postingId })).then(({ data, error }) => (error || !Array.isArray(data) ? [] : (data as PastHire[])))
    hires.set(postingId, p)
  }

  return p
}

/** Undefined while loading, then the answer. Kept with its key, so another job never shows the last one's data while its own loads. */
function useLoaded<T>(key: string, load: () => Promise<T>): T | undefined {
  const [state, setState] = useState<{ key: string; value: T } | null>(null)
  useEffect(() => {
    let live = true
    void load().then((value) => {
      if (live) setState({ key, value })
    })

    return () => {
      live = false
    }
    // load is rebuilt each render; the key says when it is a different question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state?.key === key ? state.value : undefined
}

export const useJobCompany = (employer: string, display: string): JobCompany | null | undefined => useLoaded(`${employer}\u0000${display}`, () => loadJobCompany(employer, display))

export const usePastHires = (postingId: string, signedIn: boolean): PastHire[] | undefined => useLoaded(`${signedIn ? 1 : 0}\u0000${postingId}`, () => loadPastHires(postingId, signedIn))

export interface LabelledHeadline {
  title: string
  url: string
  site?: string
  date?: string
  labels: string[]
}

interface WikiAmount {
  amount: number
  currency?: string | null
  year?: string | null
}

/** What public/companies/more/<hash>.json holds (research-data/companies/10_more_export.py): business headlines and Wikidata's figures. */
export interface CompanyMore {
  news?: LabelledHeadline[]
  money?: { revenue?: WikiAmount; profit?: WikiAmount; marketValue?: WikiAmount }
  listedOn?: string[]
  parent?: string
  founded?: string
  employees?: { count: number; year?: string | null }
  wikidata?: string
}

const more = new Map<string, Promise<CompanyMore>>()

/** The extra facts for one company, fetched when its job is opened. Empty when there are none. */
export function loadCompanyMore(employer: string): Promise<CompanyMore> {
  let p = more.get(employer)
  if (!p) {
    p = fetch(companyFile(employer).replace("/companies/c/", "/companies/more/"))
      .then((r) => (r.ok ? (r.json() as Promise<CompanyMore>) : {}))
      .catch(() => ({}))
    more.set(employer, p)
  }

  return p
}

export const useCompanyMore = (employer: string): CompanyMore | undefined => useLoaded(`more\u0000${employer}`, () => loadCompanyMore(employer))
