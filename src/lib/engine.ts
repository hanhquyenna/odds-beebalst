import { degreeOf } from "@/lib/degree"
import { monthIndex } from "@/lib/months"
import { consistencyWith, fieldMatch, guessFamily, wordSpecificity } from "@/lib/field"
import { hasLanguage, requiredLanguages } from "@/lib/languages"
import { FIT_AVERAGE, fitOf, type Fit } from "@/lib/fit"
import { SKILLS } from "@/lib/skills"
import type { Strength } from "@/lib/strength"
import type { Reference } from "@/lib/jobs"
import type { Band, Credit, DutchLevel, PayChoices, PermitRoute, Posting, Profile, TaxParams } from "@/lib/types"

const HOURS_PER_YEAR = 2080

// One formatter for every euro amount: toLocaleString("en-NL") builds a new one on each call, which was half the cost of scoring a job.
const EURO_FORMAT = new Intl.NumberFormat("en-NL")

/** A whole-euro amount as shown everywhere ("€3,122"), or a dash when there is none. */
export const eur = (n: number | null | undefined): string =>
  n == null ? "—" : `€${EURO_FORMAT.format(Math.round(n))}`

export const pct = (x: number | null | undefined, digits = 0): string =>
  x == null ? "—" : `${(100 * x).toFixed(digits)}%`

// ---------------------------------------------------------------- tax (Belastingdienst 2026)

function incomeTax(taxable: number, tax: TaxParams): number {
  const [first, second, third] = tax.box1_brackets
  let due = Math.min(taxable, first.upto!) * first.rate
  if (taxable > first.upto!) {
    due += (Math.min(taxable, second.upto!) - first.upto!) * second.rate
  }
  if (taxable > second.upto!) {
    due += (taxable - second.upto!) * third.rate
  }

  return due
}

function credit(taxable: number, c: Credit): number {
  if (taxable <= c.phase_out_start) {
    return c.max
  }
  if (taxable >= c.zero_at) {
    return 0
  }

  return Math.max(0, c.max - c.phase_out_rate * (taxable - c.phase_out_start))
}

/** Net per month. The ruling exempts min(30% of salary, salary minus the applicable floor). */
export function netMonth(
  grossAnnual: number,
  ruling: boolean,
  under30Master: boolean,
  tax: TaxParams,
): { net: number; freeShare: number } {
  const r = tax.ruling_30pct
  const floor = under30Master ? r.min_salary_under30_masters : r.min_salary
  const free = ruling ? Math.min(0.3 * grossAnnual, Math.max(0, grossAnnual - floor)) : 0
  const taxable = grossAnnual - free
  const due = Math.max(0, incomeTax(taxable, tax) - credit(taxable, tax.general_tax_credit) - credit(taxable, tax.labour_tax_credit))

  return { net: (grossAnnual - due) / 12, freeShare: free / grossAnnual }
}

// ---------------------------------------------------------------- skills


// ---------------------------------------------------------------- profile

const NL_PLACES = /netherlands|nederland|amsterdam|rotterdam|utrecht|eindhoven|den haag|the hague|groningen|leiden|delft|tilburg|maastricht|nijmegen/i
const EU_PLACES = /germany|france|belgium|spain|italy|portugal|austria|ireland|sweden|denmark|finland|poland|czech|hungary|greece|romania|bulgaria|croatia|slovakia|slovenia|lithuania|latvia|estonia|luxembourg|malta|cyprus|berlin|paris|brussels|munich|madrid|barcelona|milan|lisbon|dublin|vienna|stockholm|copenhagen|warsaw|prague|switzerland|norway|united kingdom|london/i
const DUTCH_SCHOOL = /(hogeschool|\bvu\b|\buva\b|erasmus|tilburg|maastricht|groningen|utrecht|leiden|delft|twente|wageningen|nyenrode|\bhva\b|amsterdam)/i

/** A date as people write it on a CV: "Mar 2021", "September 2021", "Sept 2021", "Dez 2023", "03/2021", "2021-03", "2021". Anything else is unknown, never an invalid date. */
function parseDate(value: string | undefined): Date | null {
  if (!value) {
    return null
  }
  const named = value.match(/(?:^|[^\p{L}])(\p{L}{3,10})\.?\s+(\d{4})\b/u)
  const month = named ? monthIndex(named[1]) : null
  if (named && month !== null) {
    return new Date(Number(named[2]), month, 1)
  }
  const numeric = value.match(/\b(\d{1,2})\s*[/.-]\s*(\d{4})\b/) ?? null
  if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12) {
    return new Date(Number(numeric[2]), Number(numeric[1]) - 1, 1)
  }
  const isoLike = value.match(/\b(\d{4})\s*[/.-]\s*(\d{1,2})\b/)
  if (isoLike && Number(isoLike[2]) >= 1 && Number(isoLike[2]) <= 12) {
    return new Date(Number(isoLike[1]), Number(isoLike[2]) - 1, 1)
  }
  const year = value.match(/\b(\d{4})\b/)

  return year ? new Date(Number(year[1]), 0, 1) : null
}

function ageOf(profile: Profile): number | null {
  return profile.birth ? new Date().getFullYear() - profile.birth : null
}

function ageBandOf(age: number | null): string | null {
  if (age == null) {
    return null
  }
  const low = Math.floor(age / 5) * 5
  if (low < 15) {
    return "15 tot 20 jaar"
  }
  if (low >= 75) {
    return "75 jaar of ouder"
  }
  if (low >= 65) {
    return "65 tot 75 jaar"
  }

  return `${low} tot ${low + 5} jaar`
}

type Degree = "unknown" | "bachelor" | "master" | "phd"

export interface Derived {
  roles: Array<{ title: string; company: string; where: "NL" | "EU" | "non-EU" | "unknown"; years: number }>
  years: number
  share: { nl: number; eu: number; nonEu: number }
  internship: boolean
  degree: Degree
  dutchDegree: boolean
  skills: Set<string>
  rulingEligible: boolean
  age: number | null
  ageBand: string | null
  /** Studying now: what the person said, else read from the education dates (one still running), else unknown. */
  studying: boolean | null
  /** Months since the last study ended, for someone not studying and with a date to go by. */
  graduatedMonthsAgo: number | null
}

const derivedCache = new WeakMap<Profile, Derived>()

/** The same profile object gives the same answer, so a list of hundreds of jobs works the profile out once. */
export function derive(profile: Profile): Derived {
  const hit = derivedCache.get(profile)
  if (hit) {
    return hit
  }
  const made = deriveFresh(profile)
  derivedCache.set(profile, made)

  return made
}

function deriveFresh(profile: Profile): Derived {
  const now = new Date()
  let months = 0
  const spans: Array<[number, number]> = []
  let nl = 0
  let eu = 0
  let nonEu = 0
  let internship = false
  const roles = profile.positions.map((row) => {
    const start = parseDate(row["Started On"])
    const end = parseDate(row["Finished On"]) ?? now
    const span = start ? Math.max(0, (end.getTime() - start.getTime()) / 2_629_800_000) : 0
    if (start && end.getTime() > start.getTime()) {
      spans.push([start.getTime(), end.getTime()])
    }
    months += span
    const place = row.Location ?? ""
    const where = NL_PLACES.test(place) ? "NL" : EU_PLACES.test(place) ? "EU" : place ? "non-EU" : "unknown"
    // A role with no place says nothing about where it was, so it is left out of the shares rather than counted as work outside the EU.
    if (where === "NL") {
      nl += span
    } else if (where === "EU") {
      eu += span
    } else if (where === "non-EU") {
      nonEu += span
    }
    if (/intern|stagiair|werkstudent|trainee/i.test(row.Title ?? "")) {
      internship = true
    }

    return { title: row.Title ?? "", company: row["Company Name"] ?? "", where: where as "NL" | "EU" | "non-EU" | "unknown", years: span / 12 }
  })
  // Jobs that overlap (an internship alongside a degree, two roles at once) count once, not twice.
  months = 0
  let reach = -Infinity
  for (const [from, to] of spans.sort((a, b) => a[0] - b[0])) {
    const begin = Math.max(from, reach)
    if (to > begin) {
      months += (to - begin) / 2_629_800_000
      reach = to
    }
  }
  const degree: Degree = degreeOf(profile.education, profile.cv)
  const dutchDegree = profile.education.some((e) => NL_PLACES.test(e["School Name"] ?? "") || DUTCH_SCHOOL.test(e["School Name"] ?? ""))
  const skills = new Set(profile.skills.map((s) => (s.Name ?? "").toLowerCase()))
  const haystack = `${profile.cv} ${profile.skills.map((s) => s.Name).join(" ")} ${profile.positions.map((p) => p.Description ?? "").join(" ")}`.toLowerCase()
  for (const [name, pattern] of Object.entries(SKILLS)) {
    if (pattern.test(haystack)) {
      skills.add(name)
    }
  }
  const total = nl + eu + nonEu || 1
  const age = ageOf(profile)
  // Studying: the person's own answer wins. Otherwise an education entry with no end or an end still ahead means yes, entries that all ended mean no, and no entries or no dates at all means unknown.
  const ends = profile.education.map((e) => ({ end: parseDate(e["End Date"]), start: parseDate(e["Start Date"]) }))
  const running = ends.some((e) => (e.end === null && e.start !== null) || (e.end !== null && e.end.getTime() > now.getTime()))
  const finished = ends.map((e) => e.end).filter((d): d is Date => d !== null && d.getTime() <= now.getTime())
  const dated = ends.some((e) => e.end !== null || e.start !== null)
  const studying = typeof profile.studying === "boolean" ? profile.studying : !dated ? null : running
  const graduatedMonthsAgo = studying === false && finished.length > 0 ? Math.max(0, (now.getTime() - Math.max(...finished.map((d) => d.getTime()))) / 2_629_800_000) : null

  return {
    roles,
    years: months / 12,
    share: { nl: nl / total, eu: eu / total, nonEu: nonEu / total },
    internship,
    degree,
    dutchDegree,
    skills,
    rulingEligible: profile.abroad >= 16,
    age,
    ageBand: ageBandOf(age),
    studying,
    graduatedMonthsAgo,
  }
}

// ---------------------------------------------------------------- pay bands

const sectorFor = (cat: Posting["cat"]): "K" | "J" | "M" => (cat === "finance_business" ? "K" : cat === "tech" ? "J" : "M")

export function occupationCategory(code: string): Posting["cat"] {
  return code.startsWith("04") ? "finance_business" : code.startsWith("08") ? "tech" : "other"
}

export interface BandView {
  band: Band
  grossMonth: { p25: number; p50: number; p75: number }
  exclMonth: { p25: number; p50: number; p75: number }
  netOff: { p25: number; p50: number; p75: number }
  netRuling: { p25: number; p50: number; p75: number }
  netRulingUnder30: { p25: number; p50: number; p75: number }
  ageFactor: number | null
  ageBand: string | null
  ageAdjustedP50: number | null
}

function bandFor(code: string | null, cat: Posting["cat"], profile: Profile, ref: Reference): BandView | null {
  const band = code ? ref.bands[code] : undefined
  if (!band) {
    return null
  }
  const hourly = { p25: Number(band.p25_hourly), p50: Number(band.p50_hourly), p75: Number(band.p75_hourly) }
  const gross = (k: keyof typeof hourly): number => (hourly[k] * HOURS_PER_YEAR * 1.08) / 12
  const excl = (k: keyof typeof hourly): number => (hourly[k] * HOURS_PER_YEAR) / 12
  const each = (f: (k: keyof typeof hourly) => number): { p25: number; p50: number; p75: number } => ({ p25: f("p25"), p50: f("p50"), p75: f("p75") })
  const d = derive(profile)
  const factor = d.ageBand ? (ref.ageFactors[sectorFor(cat)]?.[d.ageBand] ?? null) : null

  return {
    band,
    grossMonth: each(gross),
    exclMonth: each(excl),
    netOff: each((k) => netMonth(gross(k) * 12, false, false, ref.tax).net),
    netRuling: each((k) => netMonth(gross(k) * 12, true, false, ref.tax).net),
    netRulingUnder30: each((k) => netMonth(gross(k) * 12, true, true, ref.tax).net),
    ageFactor: factor,
    ageBand: d.ageBand,
    ageAdjustedP50: factor ? gross("p50") * factor : null,
  }
}

/** The ticks for pay: what the person set, else where their answers put each box. Nothing is locked by the profile. */
export function payChoicesOf(profile: Profile): PayChoices {
  const d = derive(profile)
  const age = ageOf(profile) ?? 30
  const route: PermitRoute = profile.permit === "eu" ? "eu" : profile.permit === "orientation_year" ? "orientation_year" : age < 30 ? "hsm_under_30" : "hsm_30_plus"

  return { ruling: d.rulingEligible, masterFloor: (d.age ?? 99) < 30 && d.degree === "master", route, ...profile.payChoices }
}

function myThreshold(profile: Profile, ref: Reference): number {
  const t = ref.tax.ind_hsm_thresholds_h2_2026_monthly_excl_holiday
  const route = payChoicesOf(profile).route
  if (route === "eu") {
    return 0
  }
  if (route === "orientation_year") {
    return t.reduced_orientation_year
  }

  return route === "hsm_under_30" ? t.under_30 : t.age_30_plus
}

export function thresholdLines(view: BandView, profile: Profile, ref: Reference): Array<{ label: string; value: number; clears: boolean; gap: number; yours: boolean }> {
  const t = ref.tax.ind_hsm_thresholds_h2_2026_monthly_excl_holiday
  const route = payChoicesOf(profile).route
  const median = view.exclMonth.p50
  const lines = [
    { label: "Orientation year / after a Dutch degree", value: t.reduced_orientation_year, yours: route === "orientation_year" },
    { label: "Highly skilled migrant, under 30", value: t.under_30, yours: route === "hsm_under_30" },
    { label: "Highly skilled migrant, 30 and over", value: t.age_30_plus, yours: route === "hsm_30_plus" },
  ]

  return lines.map((l) => ({ ...l, clears: median >= l.value, gap: median - l.value }))
}

// ---------------------------------------------------------------- category shares (from the pool itself)

export interface CategoryShare {
  n: number
  dutchRequired: number
  visaMention: number
  asking5plus: number
  junior: number
  skills: Record<string, number>
}

export function computeShares(postings: Posting[]): Record<Posting["cat"], CategoryShare> {
  const out = {} as Record<Posting["cat"], CategoryShare>
  for (const cat of ["finance_business", "tech", "other"] as const) {
    const ps = postings.filter((p) => p.cat === cat)
    const n = ps.length || 1
    const counts: Record<string, number> = {}
    for (const p of ps) {
      for (const s of p.skills) {
        counts[s] = (counts[s] ?? 0) + 1
      }
    }
    out[cat] = {
      n: ps.length,
      dutchRequired: ps.filter((p) => p.dutch_required).length / n,
      visaMention: ps.filter((p) => p.visa_mention).length / n,
      asking5plus: ps.filter((p) => (p.years_min ?? 0) >= 5).length / n,
      junior: ps.filter((p) => p.junior_title).length / n,
      skills: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / n])),
    }
  }

  return out
}

// ---------------------------------------------------------------- standing

export interface WhatIf {
  dutch: boolean
  years: number
  skills: string[]
  referral: boolean
  tailor: boolean | null
  degree: boolean
  /** "I am a student": what the job would say if you are studying now. */
  student: boolean
}

export const NO_WHAT_IF: WhatIf = { dutch: false, years: 0, skills: [], referral: false, tailor: null, degree: false, student: false }

export const isWhatIfActive = (w: WhatIf): boolean => w.dutch || w.years > 0 || w.skills.length > 0 || w.referral || w.tailor !== null || w.degree || w.student

interface Gate {
  name: "Permit" | "Degree" | "Minimum years" | "Dutch" | "Language" | "Student"
  status: "pass" | "fail" | "unknown"
  why: string
  source: string
}

interface RateLine { label: string; source: string }

export interface Standing {
  gates: Gate[]
  failing: number
  checklist: Array<{ skill: string; have: boolean; share: number | null }>
  have: number
  total: number
  band: BandView | null
  rate: { low: number; mid: number; high: number; lines: RateLine[]; thin: boolean } | null
  /** How well this CV fits this job, with its parts. Null when nothing could be compared. */
  fit: Fit | null
  /** True when there is no CV, role, education or skill on the profile yet, so no chance is worked out and it reads 0%. */
  needsProfile: boolean
}

/**
 * One figure from a range: the geometric mean. The two ends come from different
 * studies and differ by a factor (about 2.3 at the base), so the middle of a
 * factor is the square root of the product, not the average.
 */
export const middle = (low: number, high: number): number => Math.sqrt(low * high)

/** A chance as one figure: a decimal below 10% ("3.8%"), whole numbers from there. */
export function point(p: number): string {
  const x = p * 100

  return x >= 9.5 ? `${Math.round(x)}%` : `${x.toFixed(1)}%`
}

export const FACTORS = {
  /** The starting point for each kind of job: the same two studies, read for that kind of role. */
  base: {
    finance_business: {
      low: { value: 0.0236, how: "1 hire per 170 applications (Ashby 2026, EMEA business roles) ÷ 0.81 offers accepted × 3.25 interviews per offer (SmartRecruiters 2025)" },
      high: { value: 0.047, how: "4.7% of applications to business roles reach an interview (Ashby, Q1 2026, 109M applications)" },
    },
    tech: {
      low: { value: 0.0158, how: "1 hire per 254 applications (Ashby 2026, EMEA technical roles) ÷ 0.81 offers accepted × 3.25 interviews per offer (SmartRecruiters 2025)" },
      high: { value: 0.036, how: "3.6% of applications to technical roles reach an interview (Ashby, Q1 2026, 109M applications)" },
    },
    other: {
      low: { value: 0.0236, how: "1 hire per 170 applications (Ashby 2026, EMEA business roles, used for every role without its own figure) ÷ 0.81 offers accepted × 3.25 interviews per offer (SmartRecruiters 2025)" },
      high: { value: 0.054, how: "applicants interviewed, Germany, all functions (SmartRecruiters 2025)" },
    },
  },
  originAll: 0.76,
  originGraduate: 0.93,
  foreignExperience: 0.88,
  internship: 1.126,
  tailored: 1.31,
  referral: 1.49,
  /** Best to worst matched CV: Bertrand and Mullainathan 2004 found higher-quality resumes got 30% more callbacks. Used for fits below an average applicant's. */
  skillMatch: 1.3,
  /**
   * Where a CV that fits the vacancy lands. Dutch field experiments sent applications built to fit each
   * vacancy and got a positive response to 18% (administrative clerk) up to 54% (software developer),
   * 38% overall (Thijssen, Coenders and Lancee 2019, 4,211 applications). Real applicants compete with
   * others, so the top may overstate.
   */
  fitted: { low: 0.18, high: 0.54 },
  /** Where an average applicant sits on the 0 to 1 fit scale. Our assumption: the base rates are for everyone who applies. */
  fitAverage: FIT_AVERAGE,
} as const

const DEGREE_ORDER: Record<Degree, number> = { unknown: 0, bachelor: 1, master: 2, phd: 3 }
const DUTCH_ORDER: Record<DutchLevel, number> = { none: 0, basic: 1, professional: 2, native: 3 }

/** Whether there is anything on the profile to compare with a job: a CV, a role, a school or a skill. Without it the chance reads 0%. */
export function hasCvData(profile: Profile): boolean {
  return profile.positions.length > 0 || profile.education.length > 0 || profile.skills.length > 0 || profile.cv.trim().length >= 20
}

export function standing(
  post: Posting,
  profile: Profile,
  ref: Reference,
  shares: Record<Posting["cat"], CategoryShare>,
  whatIf: WhatIf = NO_WHAT_IF,
  referral = false,
  /** How strong the saved profile reads for this job (strength.ts). Absent until something has been read: the fit is then skills, field, role and level only. */
  strength: Strength | null = null,
): Standing {
  const base = derive(profile)
  const years = base.years + whatIf.years
  const degree: Degree = whatIf.degree && base.degree !== "phd" ? "master" : base.degree
  const skills = new Set([...base.skills, ...whatIf.skills])
  const dutch: DutchLevel = whatIf.dutch ? "professional" : profile.dutch
  // Tailoring is a choice for one application, made on the job page. It is not assumed from the profile, so nobody starts with the boost.
  const tailor = whatIf.tailor === true
  const hasReferral = whatIf.referral || referral
  const view = bandFor(post.cbs_group, post.cat, profile, ref)
  const gates: Gate[] = []

  if (payChoicesOf(profile).route === "eu") {
    gates.push({ name: "Permit", status: "pass", why: "EU/EEA citizen: no salary threshold", source: "IND" })
  } else if (isInternship(post)) {
    gates.push({ name: "Permit", status: "unknown", why: "an internship allowance is not a salary, so the salary threshold can't be checked; ask the employer which permit route applies", source: "IND" })
  } else if (!view) {
    gates.push({ name: "Permit", status: "unknown", why: "no pay band for this title, so the threshold can't be checked", source: "IND" })
  } else {
    const threshold = myThreshold(profile, ref)
    gates.push({
      name: "Permit",
      status: view.exclMonth.p50 >= threshold ? "pass" : "fail",
      why: `median pay ${eur(view.exclMonth.p50)}/month excl. holiday vs your threshold ${eur(threshold)}`,
      source: "CBS 2024 · IND 2026",
    })
  }
  if (post.degree_asked) {
    gates.push({
      name: "Degree",
      status: DEGREE_ORDER[degree] >= DEGREE_ORDER[post.degree_asked] ? "pass" : "fail",
      why: `posting asks ${post.degree_asked}; your profile: ${degree}${base.dutchDegree ? " (Dutch institution)" : ""}`,
      source: "posting · your profile",
    })
  } else {
    gates.push({ name: "Degree", status: "pass", why: "no degree level stated", source: "posting" })
  }
  if (post.years_min != null) {
    gates.push({ name: "Minimum years", status: years >= post.years_min ? "pass" : "fail", why: `${post.years_min}+ asked · ${years.toFixed(1)} on your profile`, source: "posting · your profile" })
  } else {
    gates.push({ name: "Minimum years", status: "pass", why: "no minimum stated", source: "posting" })
  }
  if (post.dutch_required) {
    gates.push({ name: "Dutch", status: DUTCH_ORDER[dutch] >= 2 ? "pass" : "fail", why: `Dutch required · your level: ${dutch}`, source: "posting" })
  } else {
    gates.push({ name: "Dutch", status: "pass", why: "not required in this posting", source: "posting" })
  }

  if (post.enrollment === "required" || post.enrollment === "recent") {
    const asks = post.enrollment === "required" ? "asks for a current student" : "asks for a current student or a recent graduate"
    const studying = whatIf.student ? true : base.studying
    const recent = base.graduatedMonthsAgo !== null && base.graduatedMonthsAgo <= 12
    const status: Gate["status"] = studying === true ? "pass" : studying === null ? "unknown" : post.enrollment === "recent" ? (base.graduatedMonthsAgo === null ? "unknown" : recent ? "pass" : "fail") : "fail"
    gates.push({
      name: "Student",
      status,
      why: studying === null ? `the posting ${asks}; say whether you are studying to check` : studying ? `the posting ${asks} · you are studying` : `the posting ${asks} · you are not studying${base.graduatedMonthsAgo !== null ? ` (finished ${Math.round(base.graduatedMonthsAgo)} months ago)` : ""}`,
      source: "posting · your profile",
    })
  }

  const needed = requiredLanguages(post.title)
  if (needed.length > 0) {
    const have = hasLanguage(profile.languages, needed)
    gates.push({
      name: "Language",
      status: have,
      why: have === "unknown" ? `the title asks for ${needed.join(" and ")}; add your languages to your profile to check` : `the title asks for ${needed.join(" and ")} · ${have === "pass" ? "you list it" : "not among your languages"}`,
      source: "posting title · your profile",
    })
  }

  const failing = gates.filter((g) => g.status === "fail").length
  const catShare = shares[post.cat]
  const checklist = post.skills.map((skill) => ({ skill, have: skills.has(skill), share: catShare?.skills[skill] ?? null }))
  const thin = (catShare?.n ?? 0) < 30

  const mine = [profile.cv, profile.positions.map((p) => `${p.Title ?? ""} ${p.Description ?? ""}`).join(" "), profile.education.map((e) => `${e["Degree Name"] ?? ""} ${e["Field Of Study"] ?? ""} ${e.Notes ?? ""}`).join(" "), [...skills].join(" ")].join(" ").toLowerCase()
  const family = post.family ?? guessFamily(post.title_clean ?? post.title, post.skills)
  const fit = fitOf({ title: post.title_clean ?? post.title, level: levelOf(post), years, wanted: post.skills.map((name) => ({ name, tier: post.tiers?.[name] ?? "unspecified" })), have: (skill) => skills.has(skill), text: mine, field: fieldMatch(profile, skills, family), consistency: consistencyWith(profile, family), specificity: (w) => wordSpecificity(w, family), strength })

  const needsProfile = !hasCvData(profile)
  let rate: Standing["rate"] = null
  // No hard gates: the chance is worked out from your profile whatever the posting asks for. What it asks and you have not ticked is shown beside it, and ticking it is a recommendation.
  if (!needsProfile) {
    const start = FACTORS.base[post.cat] ?? FACTORS.base.other
    let low: number = start.low.value
    let high: number = start.high.value
    const baseLow = low
    const baseHigh = high
    const lines: RateLine[] = [
      { label: `Base, low end: ${start.low.how}`, source: "Ashby 2026 · SmartRecruiters 2025" },
      { label: `Base, high end: ${start.high.how}`, source: post.cat === "other" ? "SmartRecruiters 2025" : "Ashby Talent Trends 2026" },
    ]
    if (profile.origin !== "dutch") {
      low *= FACTORS.originAll
      high *= FACTORS.originGraduate
      lines.push({ label: "Non-native background: ×0.76 across all job levels (low end), ×0.93 for graduate-level jobs (high end)", source: "Thijssen et al. 2021 · SCP 2010 (Dutch field experiments)" })
      if (base.share.nonEu > 0.5) {
        low *= FACTORS.foreignExperience
        lines.push({ label: "Work experience mostly outside the EU: ×0.88, low end only (overlaps with the line above)", source: "Mathematica audit study, not Dutch" })
      }
    }
    if (base.internship) {
      low *= FACTORS.internship
      high *= FACTORS.internship
      lines.push({ label: "Internship on your profile: ×1.126", source: "Baert et al. 2021 (Belgium)" })
    }
    if (tailor) {
      high *= FACTORS.tailored
      lines.push({ label: "Tailored application: ×1.31, high end only (weakest evidence)", source: "ResumeGo 2020 (US vendor test)" })
    }
    if (hasReferral) {
      low *= FACTORS.referral
      high *= FACTORS.referral
      lines.push({ label: "Referral at this employer: ×1.49", source: "Ashby 2026 (global)" })
    }
    if (fit) {
      // Everything above is who you are. This is how well you fit this job. An average applicant sits at
      // 0.4; a CV that fits as the Dutch field experiments' applications did lands at their rates, and a
      // poor fit falls by up to the 30% gap Bertrand and Mullainathan found. How far along the way you are is our scale.
      const t = (fit.score - FACTORS.fitAverage) / (1 - FACTORS.fitAverage)
      const up = (end: number, anchor: number): number => (t >= 0 ? (anchor / end) ** t : FACTORS.skillMatch ** (fit.score / FACTORS.fitAverage - 1))
      low *= up(baseLow, FACTORS.fitted.low)
      high *= up(baseHigh, FACTORS.fitted.high)
      high = Math.min(high, FACTORS.fitted.high)
      low = Math.min(low, high)
      const detail = fit.parts.map((q) => `${q.label.toLowerCase()} ${q.detail}`).join("; ")
      lines.push({
        label: `Fit with this job: ${Math.round(fit.score * 100)}% (${detail}). An average applicant is 40%; a CV built to fit the vacancy got 18% to 54% in Dutch field experiments, and a poor fit about 30% less than average. Where you land between is our scale`,
        source: "Thijssen, Coenders & Lancee 2019 (NL field experiment) · Bertrand & Mullainathan 2004",
      })
    }
    rate = { low, mid: middle(low, high), high, lines, thin }
  }

  return { gates, failing, checklist, have: checklist.filter((c) => c.have).length, total: checklist.length, band: view, rate, fit, needsProfile }
}

export function cumulative(p: number, applications: number): number {
  return 1 - (1 - p) ** applications
}

// ---------------------------------------------------------------- level

/** One vocabulary for level, used by the rows, the filters and the job page. */
export type Level = "Internship" | "Entry" | "Mid" | "Senior" | "Manager" | "Director" | "Not stated"
export const LEVELS: Level[] = ["Internship", "Entry", "Mid", "Senior", "Manager", "Director", "Not stated"]

const ROLE_MANAGER = /\b(account|product|project|program(me)?|brand|customer|client|relationship|partner(ship)?|community|content|social media|marketing|campaign|category|channel|sales|business development|change|release|delivery|service|vendor|procurement|implementation|onboarding|portfolio|risk|compliance|quality|solutions?|technical account|engagement)\s+(\w+\s+)?manager\b/i

function levelFromYearsAndLabel(p: Posting): Level {
  const y = p.years_min
  if (p.seniority === "Mid-Senior level") {
    return (y ?? 0) >= 5 ? "Senior" : "Mid"
  }
  if (p.seniority === "Internship") {
    return "Internship"
  }
  if (p.seniority === "Entry level" || p.seniority === "Associate") {
    return "Entry"
  }
  if (p.seniority === "Director" || p.seniority === "Executive") {
    return "Director"
  }
  if (y != null) {
    return y <= 2 ? "Entry" : y <= 4 ? "Mid" : "Senior"
  }

  return "Not stated"
}

const JEV_LEVEL: Record<string, Level> = { internship: "Internship", entry: "Entry", mid: "Mid", senior: "Senior", manager: "Manager", director: "Director" }

/**
 * An internship or a working-student job: the posting says intern, stage, werkstudent or working student, or the database reads its level as
 * Internship. Neither earns the occupation's full-time salary, so no salary figure is shown for them. Trainee programmes are paid jobs: not counted.
 */
export function isInternship(p: Pick<Posting, "title" | "seniority"> & Partial<Pick<Posting, "level_view" | "role_kind">>): boolean {
  // Where the whole posting has been read, that reading decides: a "traineeship" at a hotel paid a small allowance is an internship, and a "Talent Program" is a paid graduate job.
  if (p.role_kind) {
    return p.role_kind === "internship" || p.role_kind === "working_student"
  }
  // Working students (werkstudent) are paid hourly for a few days a week, nothing like the full-time salary of the same occupation, so they count too.
  return /\b(intern|internship|stagiair\w*|stage|meewerkstage|werkstudent|working student|student assistant)\b/i.test(p.title) || p.seniority === "Internship" || p.level_view === "Internship"
}

const LEVEL_NAMES: ReadonlyArray<string> = ["Internship", "Entry", "Mid", "Senior", "Manager", "Director", "Not stated"]

export function levelOf(p: Posting): Level {
  // The database view app_jobs works the level out with these same rules (supabase/migrations/20261003_app_jobs_view.sql), so its answer is the one used.
  if (p.level_view && LEVEL_NAMES.includes(p.level_view)) {
    return p.level_view
  }
  // Where Jev read the whole posting and is sure, its level wins over the guess from the title.
  const read = p.level_jev ? JEV_LEVEL[p.level_jev] : undefined
  if (read && (p.level_conf ?? 0) >= 0.8) {
    return read
  }
  const t = p.title
  if (/\b(director|vice president|vp\b|svp|evp|head of|head,|managing director|general manager|country manager|chief)\b/i.test(t)) {
    return "Director"
  }
  if (isInternship(p) || /\b(werkstudent|working student)\b/i.test(t)) {
    return "Internship"
  }
  if (/\b(trainee|traineeship)\b/i.test(t)) {
    return "Entry"
  }
  // A named programme for people starting out ("Tax & Legal Development Program", "Graduate Programme"), not a "Program Manager".
  if (/\b(development|graduates?|leadership|talent|rotational|early careers?|future leaders?|young professionals?|fast ?track)\s+(programme|program|track|scheme)\b/i.test(t)) {
    return "Entry"
  }
  if (/\b(senior|sr\.?|staff|principal|architect)\b/i.test(t)) {
    return "Senior"
  }
  if (/\b(team ?lead|tech lead|lead |manager\b|supervisor|teamleider)/i.test(t)) {
    if (ROLE_MANAGER.test(t) && !/team ?lead/i.test(t)) {
      return levelFromYearsAndLabel(p)
    }

    return "Manager"
  }
  if (/\b(junior|jr\.?|graduate|starter|entry|associate|assistant|young professional)\b/i.test(t)) {
    return "Entry"
  }

  return levelFromYearsAndLabel(p)
}

// ---------------------------------------------------------------- pasted postings

const YEARS = /(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years?|yrs?|jaar)/gi
const CROSSWALK: Array<[RegExp, string]> = [
  [/\baccountant\b|\baudit/i, "0411"],
  [/financial controller|finance controller|controller/i, "0412"],
  [/financial analyst|finance analyst|fp&a|treasury|tax|risk analyst|risk manager|pricing analyst|finance manager|finance business partner|fraud analyst|credit analyst|quant(itative)? (analyst|researcher)|trader|trading/i, "0412"],
  [/accounts? (payable|receivable)|bookkeep|billing|accounting (assistant|specialist)/i, "0421"],
  [/business analyst|consultant|strategy|operations analyst|program(me)? manager|project manager|product manager|product owner/i, "0413"],
  [/data analyst|business intelligence|bi analyst|analytics/i, "0412"],
  [/software|developer|engineer(?!.*(sales|support|network|system|devops|site reliability|security))|data scientist|machine learning|backend|frontend|full ?stack|mobile|ios|android/i, "0814"],
  [/devops|site reliability|sre|cloud engineer|platform engineer|infrastructure|security engineer|network|system(s)? (admin|engineer)|database admin/i, "0812"],
  [/marketing|content|communications|brand|seo|growth/i, "0311"],
  [/account manager|account executive|sales|business development|partnership/i, "0321"],
]

export function crosswalk(title: string): string | null {
  return CROSSWALK.find(([pattern]) => pattern.test(title))?.[1] ?? null
}

export function extractPosting(title: string, text: string): Partial<Posting> {
  const years = [...text.matchAll(YEARS)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 15)
  let dutch = false
  for (const match of text.matchAll(/\b(dutch|nederlands(e)?)\b/gi)) {
    const around = text.slice(Math.max(0, (match.index ?? 0) - 80), (match.index ?? 0) + 80)
    if (/(required|fluent|proficien|native|must|mandatory|vereist|verplicht|speak|essential|necessary)/i.test(around)) {
      dutch = true
      break
    }
  }
  const code = crosswalk(title)
  const degree = /\b(phd|doctorate)\b/i.test(text) ? "phd" : /\b(master'?s?|msc|mba)\b/i.test(text) ? "master" : /\b(bachelor|bsc|hbo|wo)\b/i.test(text) ? "bachelor" : null

  return {
    years_min: years.length ? Math.min(...years) : null,
    dutch_required: dutch,
    visa_mention: /\b(visa|sponsorship|sponsor|relocation|work permit|30% ruling|highly skilled migrant|kennismigrant)\b/i.test(text),
    junior_title: /\b(junior|graduate|trainee|starter|entry|intern|associate|werkstudent)\b/i.test(title),
    degree_asked: degree,
    skills: Object.entries(SKILLS).filter(([, pattern]) => pattern.test(text.toLowerCase())).map(([name]) => name),
    cbs_group: code,
    cat: code ? occupationCategory(code) : "other",
  }
}

