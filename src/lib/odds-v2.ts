/**
 * Interview chance, version 2: "where do you land in the pile?"
 *
 * A job gets about N applications and invites about k of them. Every applicant has a strength z on one scale, where the
 * average applicant to a posting is 0 and one unit is the spread between applicants. The recruiter sees z through noise
 * (sd NOISE) and invites the top k. So the chance for someone of strength z is
 *
 *   p = 1 - Phi((T - z) / NOISE),   with T chosen so that the pool as a whole gets k of N:  T = Phi^-1(1 - k/N) * sqrt(1 + NOISE^2)
 *
 * Why this shape: the 2-5% interview rate per application (Huntr 2025: 3.5%; Ashby 2026: 3.6-4.7%) is an average over everyone
 * who applies, most of whom do not fit the job. A CV that does fit gets far more: 19% (Mihut 2022), 38% (Thijssen et al. 2019),
 * 34-79% by occupation (GEMM, Dutch applications, our own fit in research-data/gemm). Adding effects on one probability scale
 * (the old engine) cannot give both; ranking in a pile does, and it saturates on its own instead of needing caps.
 *
 * Strength z is a sum of parts, each from a study. Effects measured as odds ratios enter as STEP * ln(OR), STEP = 0.59 being the
 * usual logit-to-probit scale. Backtest and persona checks: research-data/backtest and odds-v2.test.ts.
 */
import { derive } from "@/lib/engine"
import { familyOfTitle } from "@/lib/field"
import { relevanceOf, type Relevance } from "@/lib/strength"
import { employerTier, type EmployerTier } from "@/lib/tiers"
import type { Posting, Profile } from "@/lib/types"

/** Recruiter noise, in units of the spread between applicants. 1 keeps the best fitted models' AUC near 0.7, as in GEMM and Oreopoulos. */
export const NOISE = 1
/**
 * An odds ratio measured at a callback rate p0 becomes the step on the strength scale that moves p0 to the same new rate:
 * Phi^-1(p1) - Phi^-1(p0). Converting at the rate the study measured matters: in the thin tail where most chances live, the same
 * step multiplies the chance by far more than near 50%. (A single logit-to-probit factor overstated every effect 1.5-3x in the
 * first backtest: research-data/backtest/score_both.py.)
 */
interface Effect {
  or: number
  /** The callback rate in the study's reference group. */
  at: number
}
export function step(e: Effect): number {
  const odds = (e.at / (1 - e.at)) * e.or
  return phiInv(odds / (1 + odds)) - phiInv(e.at)
}

/**
 * Strength from the single most relevant past role: 0.2 for no relevant work, up to 1.7 for a full job in the same line of work.
 * Anchors: a CV matched to the vacancy gets about 19-38% in field experiments (Mihut 2022; Thijssen et al. 2019), one with only
 * "transferable" experience 3.9% (Mihut), which in the default pile below are strengths of about 1.7 and 0.65.
 */
const RELEVANCE_WORTH: Record<Relevance | "none", number> = { same: 1, adjacent: 0.3, unrelated: 0.05, none: 0 }
const RELEVANCE_SPAN = 1.5
const RELEVANCE_FLOOR = 0.2
/** What kind of role it was: a full job counts fully, an internship 0.8 of it (Nunley et al. 2016: an internship is worth about 55% of a post-graduation in-field job's +25%), a job for money about nothing (Kessler et al. 2019; Baert et al. 2016). */
const KIND_WORTH = { job: 1, internship: 0.8, student: 0.15 } as const

/**
 * The employer's name. The one callback measure is Oreopoulos 2011: experience at a very large firm, OR 1.09 (1.16 within job) at a
 * 10% callback rate, a step of about 0.07, which is "large" here. "elite" is twice that: Kessler et al. 2019 find a top-firm internship
 * worth about twice a second ordinary internship in recruiter ratings. In another line of work we keep 40% (no study tests it; the
 * evidence allows 30-50%). The first backtest put elite at 0.35 and overstated big-firm experience 1.48x vs 1.11x observed.
 */
const PRESTIGE: Record<EmployerTier, number> = { elite: 0.15, large: 0.07, mid: 0, small: 0, unknown: 0 }
const PRESTIGE_OFF_FIELD = 0.4

/** Effects from field experiments, as odds ratios with the callback rate they were measured at. */
export const EFFECTS = {
  /** Fewer qualifications or less experience than asked: GEMM NL own fit OR 0.53 [0.40, 0.69]. */
  underqualified: { or: 0.53, at: 0.46 },
  /** Clearly more than asked: Baert & Verhaest 2019 0.83; GEMM NL n.s. (1.14). */
  overqualified: { or: 0.85, at: 0.12 },
  /** Non-EU origin: meta-analysis of correspondence tests 0.66 [0.63, 0.70] (Lippens et al. 2023); GEMM NL white-collar about 0.72. */
  nonEu: { or: 0.66, at: 0.3 },
  /** EU but not Dutch: GEMM NL Western/Eastern Europe 0.87-0.89 (n.s.). */
  euNonNative: { or: 0.88, at: 0.46 },
  /** All work experience from outside the EU: Oreopoulos 2011 own fit 0.72 [0.57, 0.91]. */
  foreignExperienceOnly: { or: 0.72, at: 0.1 },
  /** Language level in the host language (Sweden, 3,153 applications to 17 occupations). */
  // Graded against near-native (Carlsson, Eriksson & Rooth 2023, occupation fixed: L2 1.39, L3 1.74, L4 1.91 vs L1), measured at L4's 14.7%.
  dutchNone: { or: 1 / 1.91, at: 0.147 },
  dutchBasic: { or: 1.39 / 1.91, at: 0.147 },
  dutchProfessional: { or: 1.74 / 1.91, at: 0.147 },
  /** A referral: Ashby 2026 screen pass 52% vs 35%. */
  referral: { or: 1.49, at: 0.35 },
  /** A cover letter tailored to the job: ResumeGo 2020 (vendor test, weakest evidence). */
  tailored: { or: 1.31, at: 0.125 },
  /** Degree in the job's line of work (Nunley et al.: major alone ~0; Humburg & van der Velden 2015: field match counts in screening). Our cautious value. */
  degreeInField: { or: 1.2, at: 0.17 },
  /** Degree below what the posting asks: treated like being underqualified, but half as strong. */
  degreeBelowAsked: { or: 0.7, at: 0.46 },
  /** A degree from outside the EU (no Dutch or EU degree): Oreopoulos 2011 own fit 0.92 (not significant), at a 10% callback rate. */
  foreignDegree: { or: 0.92, at: 0.1 },
  /** A second relevant internship: Kessler et al. about half the value of the top-internship upgrade. */
  secondInternship: { or: 1.15, at: 0.17 },
} satisfies Record<string, Effect>

/** The share of the Dutch gap kept on a job that does not ask for Dutch. Our assumption: the second learning round found no extra gap where the ad asks for the language, and a recruiter sees little of it in an English application. */
const DUTCH_NOT_ASKED_SHARE = 0.3

/** The most listed skills can move strength either way (our assumption). */
const SKILL_SPAN = 0.2

/** The years a level usually means when a posting does not say: our reading of Dutch job ads (junior 0-2, medior 2-5, senior 5+). */
const LEVEL_YEARS: Partial<Record<NonNullable<Posting["level_view"]>, number>> = { Mid: 2, Senior: 5, Manager: 5, Director: 8 }

/** Each extra year of relevant full-time work above what is asked adds a little, up to three years (Nunley et al.: post-graduation in-field job +25%). */
const YEAR_STEP = 0.08
const YEAR_CAP = 3

const DEGREE_FAMILY: ReadonlyArray<[RegExp, string]> = [
  [/financ|accounting|accountancy|econom|banking|actuar|fiscal/i, "Finance & accounting"],
  [/computer science|software|informatica|computing|informatics/i, "Software engineering"],
  [/data science|statistic|artificial intelligence|machine learning|\bai\b|analytics|mathemat/i, "Data, analytics & AI"],
  [/marketing|communication|media/i, "Marketing & communications"],
  [/business|management|commerce|bedrijfskunde|\bmba\b/i, "Consulting & strategy"],
  [/law|legal|rechten/i, "Risk, compliance & legal"],
  [/engineer|mechanical|electrical|civil|aerospace|physics|chemical/i, "Hardware & engineering"],
  [/supply chain|logistic|operations/i, "Operations & supply chain"],
  [/psycholog|human resource|\bhr\b/i, "HR & recruiting"],
  [/design|ux|interaction/i, "Design & UX"],
  [/medicine|biolog|health|pharma|life science/i, "Healthcare & life sciences"],
]

export function degreeFamily(text: string): string | null {
  for (const [re, fam] of DEGREE_FAMILY) if (re.test(text)) return fam
  return familyOfTitle(text, 0.3)
}

/** How many apply and how many are invited, when the posting does not say. Interviews per role: about 6-10 first conversations (Ashby 2026). */
export interface Pile {
  applicants: number
  interviews: number
  /** Where the numbers came from, for the explanation. */
  source: "posting" | "employer" | "typical"
}

/** Typical applications per posting (Greenhouse 2026: 183 in Europe), scaled by how sought-after the employer is. */
export function pileFor(post: Posting, employerTierOfPost: EmployerTier, employerAvgApplicants?: number | null): Pile {
  const interviews = /intern|stage|stagiair/i.test(post.title) ? 10 : 8
  if (typeof post.applicants === "number" && post.applicants > 0) return { applicants: Math.max(post.applicants, interviews + 1), interviews, source: "posting" }
  if (typeof employerAvgApplicants === "number" && employerAvgApplicants > 0) return { applicants: Math.max(employerAvgApplicants, interviews + 1), interviews, source: "employer" }
  const byTier: Record<EmployerTier, number> = { elite: 600, large: 220, mid: 150, small: 60, unknown: 180 }

  return { applicants: byTier[employerTierOfPost], interviews, source: "typical" }
}

export interface Part {
  /** Which factor this is, so a backtest can weigh each one (research-data/backtest/learn.py). */
  key: string
  label: string
  /** Step on the strength scale, after the learned multiplier. */
  z: number
  /** The step from the study alone, before the multiplier learned from the experiments. */
  study: number
  source: string
}

export interface OddsV2 {
  /** Chance of an interview invitation for this application, with a range from the recruiter noise and the pile size. */
  p: number
  low: number
  high: number
  strength: number
  pile: Pile
  /** Roughly where you rank among the applicants, 0 (top) to 1. */
  percentile: number
  parts: Part[]
}

export interface V2Context {
  referral?: boolean
  tailored?: boolean
  /** What-ifs from the job page: more years in this line of work, skills you would add, a degree you would get. */
  /**
   * The track record read from the saved profile (strength.ts: standing, recognition and grades, already weighted by how close each
   * item is to this job). It is the same signal as an employer's name, read more widely, so it competes with it: the stronger counts.
   */
  record?: { value: number; detail: string } | null
  extraYears?: number
  extraSkills?: ReadonlyArray<string>
  assumeDegree?: boolean
  /** The posting employer's LinkedIn employee count and average applicants, when known (employer_facts, employer_hiring). */
  employerEmployees?: number | null
  employerAvgApplicants?: number | null
}

// Standard normal CDF and its inverse (Acklam), enough precision for a percentage.
export function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}
export function phiInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239]
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572]
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416]
  const q = Math.min(Math.max(p, 1e-9), 1 - 1e-9)
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q))
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1)
  }
  if (q > 1 - 0.02425) return -phiInv(1 - q)
  const r = q - 0.5
  const s = r * r
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1)
}

/** The chance for strength z in a pile of N applicants with k interviews. */
export function chanceIn(z: number, pile: Pile, noise = NOISE): number {
  const T = phiInv(1 - pile.interviews / pile.applicants) * Math.sqrt(1 + noise * noise)
  return 1 - phi((T - z) / noise)
}

/** How a past role relates to the job: the same title, or the same line of work read from either side, counts as the same. */
function roleRelevance(title: string, post: Posting, jobFamily: string | null): Relevance {
  const norm = (x: string): string => x.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\b(junior|senior|medior|intern|trainee|stagiair)\b/g, " ").replace(/\s+/g, " ").trim()
  if (norm(title) && norm(title) === norm(post.title)) return "same"
  const fam = familyOfTitle(title, 0.3)
  if (!fam) return "unrelated"
  const fromTitle = familyOfTitle(post.title, 0.3)
  if (fam === jobFamily || fam === fromTitle) return "same"
  const a = relevanceOf(fam, jobFamily)
  const b = fromTitle ? relevanceOf(fam, fromTitle) : "unrelated"
  return a === "adjacent" || b === "adjacent" ? "adjacent" : "unrelated"
}

const isInternshipTitle = (t: string): boolean => /intern|stagiair|werkstudent|trainee|placement|stage\b/i.test(t)
const isStudentJob = (t: string): boolean => /barista|cashier|waiter|waitress|bartender|server|retail assistant|store assistant|shop assistant|kassa|bezorger|delivery|cleaner|horeca|sales assistant/i.test(t)

/**
 * Multipliers on the study values, learned from 34,549 real applications in three field experiments (GEMM, five countries;
 * Oreopoulos, Canada; Carlsson et al., Sweden) on training splits only, with each study value as the prior
 * (research-data/backtest/learn.py). 1 means the data agreed with the study. Factors the experiments do not vary keep 1.
 */
export const LEARNED: Record<string, number> = {
  relevance: 1.05,
  years: 0.69,
  degreeInField: 0.83,
  nonEu: 1.19,
  euNonNative: 1.51,
  underqualified: 0.67,
  overqualified: 0.63,
  foreignDegree: 1.0,
  foreignExperienceOnly: 1.48,
  prestige: 0.4,
  dutch: 0.81,
}

/** The parts of a person's strength for one job. */
export function strengthParts(post: Posting, profile: Profile, ctx: V2Context = {}): Part[] {
  const base = derive(profile)
  const jobFamily = post.family ?? familyOfTitle(post.title, 0.3)
  const parts: Array<Omit<Part, "study">> = []

  // 1. The most relevant role, by line of work and kind (job, internship, job for money).
  let best = { worth: 0, role: null as null | { title: string; company: string; years: number }, rel: "none" as Relevance | "none", kind: "job" as keyof typeof KIND_WORTH }
  let relevantInternships = 0
  let relevantYears = 0
  for (const r of base.roles) {
    const kind: keyof typeof KIND_WORTH = isStudentJob(r.title) ? "student" : isInternshipTitle(r.title) ? "internship" : "job"
    const rel = roleRelevance(r.title, post, jobFamily)
    const worth = RELEVANCE_WORTH[rel] * KIND_WORTH[kind]
    if (rel === "same" && kind === "internship") relevantInternships++
    if (rel === "same" && kind === "job") relevantYears += r.years
    if (worth > best.worth) best = { worth, role: r, rel, kind }
  }
  // A degree in the line of work counts as relevant evidence for internships and first jobs, the way a matched CV does.
  const degreeFams = profile.education.map((e) => degreeFamily(`${e["Degree Name"] ?? ""} ${e["Field Of Study"] ?? ""}`))
  const degreeIn = jobFamily !== null && degreeFams.includes(jobFamily)
  const firstJob = isInternshipTitle(post.title) || post.level_view === "Internship" || post.level_view === "Entry" || post.role_kind === "internship" || post.role_kind === "entry_job" || post.role_kind === "traineeship"
  let worth = best.worth
  if (firstJob && degreeIn) worth = Math.max(worth, 0.55)
  parts.push({
    key: "relevance",
    label: best.role ? `Most relevant: ${best.role.title}${best.role.company ? ` at ${best.role.company}` : ""} (${best.rel === "same" ? "same line of work" : best.rel === "adjacent" ? "a neighbouring line of work" : "another line of work"})` : degreeIn ? "Degree in this line of work, no work in it yet" : "No work in this line of work yet",
    z: RELEVANCE_FLOOR + RELEVANCE_SPAN * worth,
    source: "Mihut 2022; Thijssen et al. 2019; Nunley et al. 2016",
  })

  // 2. The name of the best-known employer, full weight in the same line of work, 40% elsewhere.
  let prestige = 0
  let prestigeRole = ""
  for (const r of base.roles) {
    const kind = isStudentJob(r.title) ? "student" : isInternshipTitle(r.title) ? "internship" : "job"
    if (kind === "student") continue
    const tier = employerTier(r.company)
    const same = roleRelevance(r.title, post, jobFamily) === "same"
    const z = PRESTIGE[tier] * (same ? 1 : PRESTIGE_OFF_FIELD)
    if (z > prestige) {
      prestige = z
      prestigeRole = `${r.company}${same ? "" : " (other line of work)"}`
    }
  }
  if (ctx.record) {
    // value runs from 0.4 (nothing stands out) to 0.9; the top of it is worth the same as an elite name in this line of work.
    const fromRecord = PRESTIGE.elite * Math.max(0, Math.min(1, (ctx.record.value - 0.4) / 0.5))
    if (fromRecord > prestige) {
      prestige = fromRecord
      prestigeRole = ctx.record.detail
    }
  }
  if (prestige > 0) parts.push({ key: "prestige", label: `Known name or record: ${prestigeRole}`, z: prestige, source: "Kessler, Low & Sullivan 2019; Oreopoulos 2011" })

  relevantYears += ctx.extraYears ?? 0
  const years = base.years + (ctx.extraYears ?? 0)
  // 3. Years of relevant full-time work beyond what is asked.
  const asked = post.years_min ?? (firstJob ? 0 : 2)
  const extra = Math.min(YEAR_CAP, Math.max(0, relevantYears - asked))
  if (extra > 0) parts.push({ key: "years", label: `${extra.toFixed(1)} more years in this line of work than asked`, z: YEAR_STEP * extra, source: "Nunley et al. 2016" })
  if (relevantInternships >= 2) parts.push({ key: "secondInternship", label: "A second internship in this line of work", z: step(EFFECTS.secondInternship), source: "Kessler, Low & Sullivan 2019" })

  // 4. Under- and overqualified.
  // A posting that names no years still has a level; a senior job without a number is not open to someone with one year.
  const implied = post.years_min ?? (post.level_view ? LEVEL_YEARS[post.level_view] ?? null : null)
  const fromLevel = post.years_min == null && implied !== null
  if (implied && years < implied) {
    // GEMM's 0.53 is the average underqualified applicant; the step is scaled from 0.4x (barely short) to 1.2x (nothing of what is asked).
    // The second backtest put 0.6 + short at 0.44x the callbacks against 0.60x observed, so the scale was lowered.
    const short = Math.min(1, (implied - years) / implied)
    parts.push({ key: "underqualified", label: fromLevel ? `A ${post.level_view?.toLowerCase()} job (usually ${implied}+ years), you have ${years.toFixed(1)}` : `Asks for ${implied}+ years, you have ${years.toFixed(1)}`, z: step(EFFECTS.underqualified) * (0.4 + 0.8 * short), source: "GEMM (own fit, Dutch applications); scaled by how far short, our assumption" })
  } else if (post.years_min !== null && post.years_min !== undefined && years > 2 * post.years_min + 4) {
    parts.push({ key: "overqualified", label: "Much more experience than asked", z: step(EFFECTS.overqualified), source: "Baert & Verhaest 2019" })
  }

  // 5. Degree.
  if (degreeIn) parts.push({ key: "degreeInField", label: "Degree in this line of work", z: step(EFFECTS.degreeInField), source: "Humburg & van der Velden 2015 (direction); our size" })
  const rank = { bachelor: 1, master: 2, phd: 3 } as Record<string, number>
  const myDegree = ctx.assumeDegree ? Math.max(rank[base.degree] ?? 0, 2) : (rank[base.degree] ?? 0)
  if (post.degree_asked && myDegree < rank[post.degree_asked]) parts.push({ key: "degreeBelowAsked", label: `Asks for a ${post.degree_asked}`, z: step(EFFECTS.degreeBelowAsked), source: "GEMM underqualified, halved" })

  // 5b. The skills the posting names, weighted by how much it insists (must 1, strong 0.7, optional 0.4, nice 0.2). Only where it names
  // at least three. No field experiment varies listed skills, so this is our assumption and kept small: up to +-0.2.
  if (post.skills.length >= 3) {
    const have = new Set([...base.skills, ...(ctx.extraSkills ?? [])].map((x) => x.toLowerCase()))
    const weight = { must: 1, strong: 0.7, optional: 0.4, nice: 0.2, unspecified: 0.6 } as Record<string, number>
    let got = 0
    let all = 0
    for (const sk of post.skills) {
      const w = weight[post.tiers?.[sk] ?? "unspecified"] ?? 0.6
      all += w
      if (have.has(sk.toLowerCase())) got += w
    }
    const cover = all > 0 ? got / all : 0.5
    parts.push({ key: "skills", label: `Skills the job names: ${Math.round(cover * 100)}% covered`, z: SKILL_SPAN * (cover - 0.5) * 2, source: "Our assumption (no experiment varies listed skills)" })
  }

  // 6. Origin and where the experience is from (field experiments measure what a recruiter infers from a name and a CV).
  if (profile.origin === "non_eu") parts.push({ key: "nonEu", label: "Non-EU background", z: step(EFFECTS.nonEu), source: "Lippens, Vermeiren & Baert 2023; GEMM" })
  else if (profile.origin === "eu_non_native") parts.push({ key: "euNonNative", label: "EU background, not Dutch", z: step(EFFECTS.euNonNative), source: "GEMM" })
  if (profile.origin === "non_eu" && profile.education.length > 0 && !base.dutchDegree) parts.push({ key: "foreignDegree", label: "Degree from outside the Netherlands", z: step(EFFECTS.foreignDegree), source: "Oreopoulos 2011" })
  if (base.share.nonEu > 0.99 && base.roles.length > 0) parts.push({ key: "foreignExperienceOnly", label: "All work experience outside the EU", z: step(EFFECTS.foreignExperienceOnly), source: "Oreopoulos 2011" })

  // 7. Dutch.
  const dutch = profile.dutch
  const level = dutch === "none" ? EFFECTS.dutchNone : dutch === "basic" ? EFFECTS.dutchBasic : dutch === "professional" ? EFFECTS.dutchProfessional : null
  if (level) {
    const name = dutch === "none" ? "No Dutch" : dutch === "basic" ? "Basic Dutch" : "Professional (not native) Dutch"
    // The experiment varied language a recruiter could see in the application itself. Where the job asks for Dutch it shows; on an
    // English-language job it mostly does not, so only a share of the gap is kept there (our assumption; nothing tests it).
    if (post.dutch_required) parts.push({ key: "dutch", label: `${name}; the job asks for Dutch`, z: step(level), source: "Carlsson, Eriksson & Rooth 2023" })
    else parts.push({ key: "dutchNotAsked", label: name, z: step(level) * DUTCH_NOT_ASKED_SHARE, source: "Carlsson, Eriksson & Rooth 2023, scaled down for an English-language job (our assumption)" })
  }

  // 8. What you do for this one application.
  if (ctx.referral) parts.push({ key: "referral", label: "A referral", z: step(EFFECTS.referral), source: "Ashby 2026" })
  if (ctx.tailored) parts.push({ key: "tailored", label: "A cover letter written for this job", z: step(EFFECTS.tailored), source: "ResumeGo 2020" })

  return parts.map((p) => ({ ...p, study: p.z, z: p.z * (LEARNED[p.key] ?? 1) }))
}

/**
 * Nobody is ever told 0%. Field experiments find a few callbacks even for CVs far from the job (Mihut 2022: 3.9% for "transferable"
 * experience), so a chance is never shown below half a percent (a soft floor), and no single missing thing is a gate.
 */
export const FLOOR = 0.005

export function oddsV2(post: Posting, profile: Profile, ctx: V2Context = {}): OddsV2 {
  const parts = strengthParts(post, profile, ctx)
  const z = parts.reduce((s, p) => s + p.z, 0)
  const pile = pileFor(post, employerTier(post.employer_display || post.employer, ctx.employerEmployees), ctx.employerAvgApplicants)
  const p = chanceIn(z, pile)
  // Range: the strength itself is known to about +-0.3 (effects from different studies), and the pile to about a factor 1.6.
  const smaller = { ...pile, applicants: Math.max(pile.interviews + 1, pile.applicants / 1.6) }
  const bigger = { ...pile, applicants: pile.applicants * 1.6 }
  const low = chanceIn(z - 0.3, bigger)
  const high = chanceIn(z + 0.3, smaller)
  const percentile = 1 - phi(z / Math.sqrt(1)) // share of the pool stronger than you, before noise

  // A soft floor: shown = FLOOR + raw * (0.99 - FLOOR). Nobody sees 0%, and every improvement still moves the number (a hard
  // clamp left people at the floor with nothing a referral could change: the "always a way up" test caught it).
  const floor = (x: number): number => (Number.isFinite(x) ? FLOOR + Math.min(1, Math.max(0, x)) * (0.99 - FLOOR) : FLOOR)

  return { p: floor(p), low: floor(Math.min(low, p)), high: floor(Math.max(high, p)), strength: z, pile, percentile, parts }
}
