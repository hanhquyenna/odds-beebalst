import type { Reference } from "@/lib/jobs"
import { eur, isInternship } from "@/lib/engine"
import { formatHourly, formatPosted } from "@/lib/format"
import internPay from "@/lib/intern-pay.json"
import type { Posting } from "@/lib/types"

/** Where a job's pay figure comes from, in the same words everywhere. */
type PayBasis = "Stated" | "Typical" | "Allowance" | "Not known"

export type AllowanceSource = "Allowance stated in the posting" | "Allowance this employer states in its postings" | "Typical internship allowance, from employers that state it"

export interface Pay {
  /** Always gross per month, written the same way: "€3.500 – €4.500", or null when there is nothing to say. */
  text: string | null
  /** Where the figure comes from, in the words shown under it. */
  source: "Stated by the employer" | "Typical for this kind of job" | "Typical traineeship pay" | AllowanceSource | null
  basis: PayBasis
  /** True when the figure is an hourly rate the employer states, not a monthly amount. */
  perHour?: true
}

/**
 * An internship in the Netherlands pays an allowance, not a salary, and CBS has
 * no pay band for it. The figures are what employers write in their own
 * postings, read into intern-pay.json: the
 * posting's own amount first, else what the same employer states in its other
 * postings, else the middle half across the employers that state one.
 */
const INTERN_MARKET = internPay.market
const INTERN_POSTINGS = internPay.postings as unknown as Record<string, [number, number]>
const INTERN_EMPLOYERS = internPay.employers as unknown as Record<string, { low: number | null; high: number | null; postings: number }>

export function allowanceOf(post: Posting): { low: number; high: number; source: AllowanceSource } {
  const own = INTERN_POSTINGS[post.id]
  if (own) {
    return { low: own[0], high: own[1], source: "Allowance stated in the posting" }
  }
  const employer = INTERN_EMPLOYERS[post.employer]
  if (employer && employer.low !== null && employer.high !== null) {
    return { low: employer.low, high: employer.high, source: "Allowance this employer states in its postings" }
  }

  return { low: INTERN_MARKET.p25, high: INTERN_MARKET.p75, source: "Typical internship allowance, from employers that state it" }
}

/** One line for the "?" beside an allowance, saying where the figure came from. */
export function allowanceNote(source: AllowanceSource): string {
  const m = INTERN_MARKET
  const base = "An internship allowance, not a salary, before tax."
  if (source === "Allowance stated in the posting") {
    return `${base} The employer writes this amount in the posting.`
  }
  if (source === "Allowance this employer states in its postings") {
    return `${base} This posting names no amount; this employer states this in its other internship postings.`
  }

  return `${base} This employer names no amount. Across the ${m.employers} employers that do, the middle half state ${eur(m.p25)} to ${eur(m.p75)} (lowest ${eur(m.low)}, highest ${eur(m.high)}), read from ${m.postings} postings. The Dutch average is 370 to 400 euros (CBS). A few employers pay interns well above this, and this posting does not say which kind this is.`
}

/**
 * What a traineeship pays when the posting names no amount. A traineeship is a paid first job, so CBS's pay for the occupation (all ages, all
 * levels) is the wrong yardstick and an internship allowance is too low. Two published figures bound it: a junior trainee's salary from the
 * Nationale Beroepengids (EUR 2,446 to 2,596 gross a month, 40 hours a week, holiday allowance included, updated 18 February 2025) up to what
 * the Dutch government pays a starting Rijkstrainee (EUR 3,496 gross a month, scale 10 step 0, werkenvoornederland.nl). 
 */
export const TRAINEE_PAY = { low: 2450, high: 3500 } as const
export const TRAINEE_NOTE =
  "No amount is named, so this is a range from two published figures: a junior trainee earns about €2,450 a month (Nationale Beroepengids, 2025) and the Dutch government pays a starting Rijkstrainee about €3,500 (Werken voor Nederland). Before tax."

const nearest = (n: number, step: number): number => Math.round(n / step) * step
const range = (low: number, high: number): string => (low === high ? eur(low) : `${eur(low)} – ${eur(high)}`)

/**
 * What the job pays, always gross per month so two jobs can be compared at a
 * glance. The employer's own figure when it gives a believable one (yearly
 * figures are divided by twelve), else the middle half of pay for this kind of
 * job from CBS. A posted range wider than three times its low end is a typo or
 * a catch-all, so it is ignored rather than shown.
 */
export function payOf(post: Posting, reference: Reference | null): Pay {
  const hourly = formatHourly(post.pay_posted)
  if (hourly) {
    const eur2 = (n: number): string => `€${Number.isInteger(n) ? n : n.toFixed(2)}`

    return { text: hourly.low === hourly.high ? eur2(hourly.low) : `${eur2(hourly.low)} – ${eur2(hourly.high)}`, source: "Stated by the employer", basis: "Stated", perHour: true }
  }
  const stated = formatPosted(post.pay_posted)
  if (stated && stated.high <= stated.low * 3) {
    const divide = stated.unit === "year" ? 12 : 1
    // One monthly figure is shown exactly as the employer wrote it (an allowance of 1,016 is not 1,020). A range, or a yearly figure divided by twelve, is rounded to ten.
    const step = stated.unit === "month" && stated.low === stated.high ? 1 : 10

    return { text: range(nearest(stated.low / divide, step), nearest(stated.high / divide, step)), source: "Stated by the employer", basis: "Stated" }
  }
  if (post.role_kind === "traineeship") {
    return { text: range(TRAINEE_PAY.low, TRAINEE_PAY.high), source: "Typical traineeship pay", basis: "Typical" }
  }
  // A working student is paid by the hour for a few hours a week: the internship allowance is not what they earn, so with no stated pay there is no figure.
  if (post.role_kind === "working_student") {
    return { text: null, source: null, basis: "Not known" }
  }
  if (isInternship(post)) {
    const a = allowanceOf(post)

    return { text: range(a.low, a.high), source: a.source, basis: "Allowance" }
  }
  const band = reference && post.cbs_group ? reference.bands[post.cbs_group] : null
  if (band) {
    const month = (hourly: number): number => nearest((hourly * 2080 * 1.08) / 12, 50)

    return { text: range(month(Number(band.p25_hourly)), month(Number(band.p75_hourly))), source: "Typical for this kind of job", basis: "Typical" }
  }

  return { text: null, source: null, basis: "Not known" }
}

/**
 * The single monthly gross figure used to work out what you keep: the middle
 * of the employer's stated range, else the middle of the typical pay for this
 * kind of job. Null when neither exists.
 */
export function payMid(post: Posting, reference: Reference | null): { month: number; basis: "Stated" | "Typical" } | null {
  // An hourly rate has no monthly figure: nobody knows the hours a week, so no tax figure is worked out from it.
  if (formatHourly(post.pay_posted)) {
    return null
  }
  const stated = formatPosted(post.pay_posted)
  if (stated && stated.high <= stated.low * 3) {
    const divide = stated.unit === "year" ? 12 : 1

    return { month: (stated.low + stated.high) / 2 / divide, basis: "Stated" }
  }
  if (post.role_kind === "traineeship") {
    return { month: (TRAINEE_PAY.low + TRAINEE_PAY.high) / 2, basis: "Typical" }
  }
  if (isInternship(post)) {
    return null
  }
  const band = reference && post.cbs_group ? reference.bands[post.cbs_group] : null

  return band ? { month: (Number(band.p50_hourly) * 2080 * 1.08) / 12, basis: "Typical" } : null
}
