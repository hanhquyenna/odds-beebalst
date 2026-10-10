// Source for core.js: the app's own job rules, bundled so the MCP server answers exactly as the app does: which jobs are in the
// pool, the filters, the interview chance (odds-v2 inside engine.ts), "Jobs tailored to you" and "Most likely to hear back".
// Rebuild after changing any of them: scripts/build-mcp-core.sh. No database access here: index.ts loads the rows and passes them in.
import { computeShares, hasCvData, LEVELS, standing, type Level } from "@/lib/engine"
import { DEFAULT_FILTERS, FIELD_OPTIONS, applyFilters, fieldOf, type JobFilters } from "@/lib/filters"
import { fitFilters, withFitLanguage } from "@/lib/fit-filters"
import { profileFields } from "@/lib/field"
import { daysSince } from "@/lib/format"
import { hearBackFor } from "@/lib/hear-back"
import type { Reference, Signals } from "@/lib/jobs"
import { oddsV2 } from "@/lib/odds-v2"
import { withSkillTiers } from "@/lib/skill-tiers"
import { payOf } from "@/lib/spec"
import { tailor } from "@/lib/tailor"
import { DEFAULT_PROFILE, type Band, type DutchLevel, type Posting, type Profile, type Row, type TaxParams, type Transition } from "@/lib/types"

export { FIELD_OPTIONS, LEVELS }

const APP = "https://odds.beeblast.co"

/** The pool as the app shows it (fetchPostings in src/lib/jobs.ts, then data.tsx): usable and open, Dutch read from the text, ages from today, one industry per employer, and never a job that asks for Dutch. */
export function preparePool(rows: Posting[]): Posting[] {
  const pool = rows.filter((p) => (p.usable == null || p.usable >= 0.5) && !p.closed_at).map((p) => withSkillTiers(p))
  for (const p of pool) {
    if (!p.dutch_required && (p.dutch_jev ?? 0) >= 0.8) p.dutch_required = true
    if (p.posted_on) {
      p.days_open = daysSince(p.posted_on)
      p.freshness_state = p.days_open <= 6 ? "fresh" : p.days_open <= 44 ? "active" : "aging"
    }
  }
  const votes = new Map<string, Map<string, number>>()
  for (const p of pool) {
    if (!p.industry) continue
    const v = votes.get(p.employer) ?? new Map<string, number>()
    v.set(p.industry, (v.get(p.industry) ?? 0) + 1)
    votes.set(p.employer, v)
  }
  for (const p of pool) {
    const v = votes.get(p.employer)
    p.industry = v ? [...v.entries()].sort((a, b) => b[1] - a[1])[0][0] : null
  }

  return pool.filter((p) => !p.dutch_required)
}

/** The reference tables (cbs_bands, cbs_age_factors, tax_params, transitions) in the shape the engine reads (fetchReference in src/lib/jobs.ts). */
export function makeReference(bands: Band[], ages: Array<{ sector: string; age_band: string; factor: number }>, tax: TaxParams, transitions: Transition[]): Reference {
  const ageFactors: Record<string, Record<string, number>> = {}
  for (const row of ages) (ageFactors[row.sector] ??= {})[row.age_band] = Number(row.factor)

  return { bands: Object.fromEntries(bands.map((b) => [b.code, b])), ageFactors, tax, transitions: Object.fromEntries(transitions.map((t) => [t.title, t])) }
}

export function signalsOf(posts: Posting[]): Record<string, Signals> {
  const out: Record<string, Signals> = {}
  for (const post of posts) {
    const found = post.work_signals ?? []
    if (found.length > 0) out[post.id] = { hybrid: found.includes("hybrid"), remote: found.includes("remote"), partTime: found.includes("partTime"), fullTime: found.includes("fullTime"), contract: found.includes("contract") }
  }

  return out
}

export const sharesOf = computeShares

// ---- A person, as an AI can describe them ----

export interface PersonInput {
  roles?: Array<{ title: string; company?: string; start?: string; end?: string; description?: string }>
  education?: Array<{ school?: string; degree?: string; field?: string; start?: string; end?: string }>
  skills?: string[]
  dutch?: "none" | "basic" | "professional"
  studying?: boolean
  headline?: string
  /** Lines of work to look in, first choice first (FIELD_OPTIONS). */
  fields?: string[]
}

const DUTCH: Record<string, DutchLevel> = { none: "none", basic: "basic", professional: "professional" } as Record<string, DutchLevel>

/** A Profile from what an AI knows about someone: their roles, schools and skills, in the LinkedIn-export shape the engine reads. */
export function profileFrom(input: PersonInput): Profile {
  const positions: Row[] = (input.roles ?? []).map((r) => ({ Title: r.title, "Company Name": r.company ?? "", "Started On": r.start ?? "", "Finished On": r.end ?? "", Description: r.description ?? "" }))
  const education: Row[] = (input.education ?? []).map((e) => ({ "School Name": e.school ?? "", "Degree Name": e.degree ?? "", "Field Of Study": e.field ?? "", "Start Date": e.start ?? "", "End Date": e.end ?? "" }))
  const skills: Row[] = (input.skills ?? []).map((name) => ({ Name: name }))

  return { ...DEFAULT_PROFILE, positions, education, skills, headline: input.headline ?? "", dutch: (input.dutch && DUTCH[input.dutch]) || DEFAULT_PROFILE.dutch, studying: input.studying ?? null }
}

/** A profile kept with an account (profiles.data), filled in the same way the app fills it. */
export function profileFromSaved(data?: Partial<Profile>): Profile {
  return { ...DEFAULT_PROFILE, ...(data ?? {}) } as Profile
}

export const hasProfile = hasCvData

// ---- What one job looks like in an answer ----

export interface JobLine {
  id: string
  title: string
  company: string
  city: string | null
  level: string | null
  field: string | null
  posted_days_ago: number | null
  closes: string | null
  pay: string | null
  pay_basis: string | null
  visa_sponsor: boolean
  applicants: number | null
  workplace: string | null
  url: string | null
  odds_link: string
}

export function jobLine(post: Posting, ref: Reference): JobLine {
  const pay = payOf(post, ref)

  return {
    id: post.id,
    title: post.title,
    company: post.employer_display || post.employer,
    city: (post.region ?? "").split(/[,;]/)[0].trim() || null,
    level: post.level_view ?? null,
    field: fieldOf(post),
    posted_days_ago: post.days_open ?? null,
    closes: post.valid_through ? post.valid_through.slice(0, 10) : null,
    pay: pay.text ? `${pay.text} ${pay.perHour ? "an hour" : "a month"}, before tax` : null,
    pay_basis: pay.text ? pay.source : null,
    visa_sponsor: Boolean(post.ind_sponsor),
    applicants: post.applicants ?? null,
    workplace: post.workplace ?? null,
    url: post.url,
    odds_link: `${APP}/job/${post.id}`,
  }
}

// ---- Search ----

export interface SearchInput {
  query?: string
  fields?: string[]
  levels?: string[]
  cities?: string[]
  sponsor_only?: boolean
  posted_within?: "day" | "week" | "month" | "any"
  min_pay?: number
  workplace?: string[]
  limit?: number
}

const known = <T extends string>(xs: ReadonlyArray<string> | undefined, allowed: ReadonlyArray<T>): T[] => (xs ?? []).map((x) => allowed.find((a) => a.toLowerCase() === x.toLowerCase())).filter((x): x is T => Boolean(x))

export function filtersFrom(input: SearchInput): JobFilters {
  const levels = known(input.levels, LEVELS)

  return {
    ...DEFAULT_FILTERS,
    query: input.query ?? "",
    field: known(input.fields, FIELD_OPTIONS),
    level: levels.length > 0 ? (levels as Level[]) : DEFAULT_FILTERS.level,
    city: input.cities ?? [],
    sponsorOnly: input.sponsor_only === true,
    posted: input.posted_within ?? "any",
    minPay: typeof input.min_pay === "number" ? input.min_pay : null,
    workplace: (input.workplace ?? []) as JobFilters["workplace"],
  }
}

/** The jobs matching a search, newest first. */
export function search(pool: Posting[], ref: Reference, signals: Record<string, Signals>, input: SearchInput): { total: number; jobs: JobLine[] } {
  const found = [...applyFilters(pool, filtersFrom(input), { signals, reference: ref })].sort((a, b) => (a.days_open ?? 1e9) - (b.days_open ?? 1e9))

  return { total: found.length, jobs: found.slice(0, Math.min(input.limit ?? 20, 50)).map((p) => jobLine(p, ref)) }
}

// ---- Interview chance ----

const plainLabel = (label: string): string => label.replace(/^Most relevant: /, "").replace(/ \((same|a neighbouring|another) line of work\)$/, "")

export interface Chance {
  chance_pct: number
  range_pct: [number, number]
  applicants_estimate: number
  interviews_estimate: number
  average_applicant_pct: number
  helps: string[]
  holds_back: string[]
  note: string
}

export function chanceFor(post: Posting, profile: Profile, ref: Reference, shares: ReturnType<typeof computeShares>): Chance | null {
  const st = standing(post, profile, ref, shares)
  if (!st.rate) return null
  const v2 = oddsV2(post, profile, {})
  const pct = (x: number): number => Math.round(x * 1000) / 10

  return {
    chance_pct: pct(st.rate.mid),
    range_pct: [pct(st.rate.low), pct(st.rate.high)],
    applicants_estimate: Math.round(v2.pile.applicants),
    interviews_estimate: v2.pile.interviews,
    average_applicant_pct: pct(v2.pile.interviews / v2.pile.applicants),
    helps: v2.parts.filter((x) => x.z > 0.05).sort((a, b) => b.z - a.z).slice(0, 4).map((x) => plainLabel(x.label)),
    holds_back: v2.parts.filter((x) => x.z < -0.05).sort((a, b) => a.z - b.z).slice(0, 4).map((x) => plainLabel(x.label)),
    note: "An estimate from published hiring studies and the size of the applicant pile, not a promise. Real outcomes are not yet logged to calibrate it.",
  }
}

// ---- Jobs tailored to you ----

export interface TailoredLine extends JobLine {
  chance_pct: number
  why: string
  most_likely_to_hear_back: boolean
}

/** "Jobs tailored to you" exactly as the Jobs page builds it (FitTable.tsx): your fields in your order, jobs like the ones you saved, roles like your own, then the newest, then your chance. */
export function tailoredFor(pool: Posting[], ref: Reference, signals: Record<string, Signals>, shares: ReturnType<typeof computeShares>, profile: Profile, opts: { fields?: string[]; saved?: Posting[]; dismissed?: Set<string>; limit?: number }): TailoredLine[] {
  const fieldOrder = known(opts.fields, FIELD_OPTIONS)
  const filters: JobFilters = { ...DEFAULT_FILTERS, field: fieldOrder }
  const fields = profileFields(profile)
  const effective = fitFilters(filters, profile, fields)
  const ctx = { signals, reference: ref }
  const savedIds = new Set((opts.saved ?? []).map((p) => p.id))
  const open = pool.filter((p) => !savedIds.has(p.id) && !(opts.dismissed?.has(p.id) ?? false))
  const fitting = new Set(applyFilters(open, effective, ctx).map((p) => p.id))
  const candidates = [...applyFilters(open, withFitLanguage(filters), ctx)]
  const memo = new Map<string, number>()
  const chanceOf = (post: Posting): number => {
    let c = memo.get(post.id)
    if (c === undefined) {
      c = standing(post, profile, ref, shares).rate?.mid ?? 0
      memo.set(post.id, c)
    }

    return c
  }
  const liftOf = (post: Posting): string | null => {
    const top = oddsV2(post, profile, {}).parts.filter((x) => x.z > 0.05).sort((a, b) => b.z - a.z)[0]

    return top ? plainLabel(top.label) : null
  }
  const own = [...profile.positions.map((p) => p.Title ?? ""), profile.headline].filter((t) => t.trim() !== "")
  const rows = tailor({ candidates, fitting, saved: opts.saved ?? [], chanceOf, profiles: {}, liftOf, own, fieldOrder })
  const tags = hearBackFor(pool, profile, new Set(), () => null)

  return rows.slice(0, Math.min(opts.limit ?? 15, 50)).map((r) => ({ ...jobLine(r.post, ref), chance_pct: Math.round(r.chance * 1000) / 10, why: r.note, most_likely_to_hear_back: tags.has(r.post.id) }))
}
