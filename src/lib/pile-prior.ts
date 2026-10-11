import prior from "@/lib/pile-prior.json"

/**
 * How many people apply, on the one site we read, to a posting like this one: a lognormal learned from our own LinkedIn readings
 * (scripts/research/pile_prior.py, held-out log-likelihood -3,638 against -3,808 for one pooled average). The mean moves with the line of
 * work, the level, how well known the employer is and how many days the posting had been up when read; the spread is what is left between postings.
 * A reading is often only a bound ("Be among the first 25 applicants" is fewer than 25, "Over 200 applicants" is at least 200), so the posterior
 * for a posting is the prior cut at that bound, and an exact count is only lightly pulled towards the prior.
 */
export type Reading = "lt" | "gt" | "exact"

const SIGMA: number = prior.sigma
const EFFECTS: Record<string, number> = prior.effects
/** How far a count that is stated can still be from what the posting really had at that moment (rounding, a moving number): log scale. An assumption. */
const COUNT_NOISE = 0.35

const pdf = (z: number): number => Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI)
/** Standard normal cdf (Abramowitz and Stegun 7.1.26 on erf, error under 1.5e-7). */
function cdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)

  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y)
}

/** Mean of log count for a posting like this one, read this many days after it went up. */
export function priorMean(family: string | null | undefined, level: string | null | undefined, tier: string, ageDays: number): number {
  return (
    (EFFECTS.intercept ?? 0) +
    (EFFECTS.logage ?? 0) * Math.log1p(Math.min(60, Math.max(0, ageDays))) +
    (EFFECTS[`family:${family || "Unknown"}`] ?? 0) +
    (EFFECTS[`level:${level || "Not stated"}`] ?? 0) +
    (EFFECTS[`tier:${tier}`] ?? 0)
  )
}

export function readingOf(text: string | null | undefined): Reading {
  return /first 25/i.test(text ?? "") ? "lt" : /over 200/i.test(text ?? "") ? "gt" : "exact"
}

/** The count the posting most likely had when it was read, given what it showed (or nothing, with `count` null). */
export function countAtRead(count: number | null, reading: Reading, mean: number): number {
  if (count === null) return Math.exp(mean)
  if (reading === "exact") {
    const w = SIGMA ** 2 / (SIGMA ** 2 + COUNT_NOISE ** 2)

    return Math.exp(w * Math.log(count) + (1 - w) * mean)
  }
  if (reading === "lt") {
    const a = (Math.log(25) - mean) / SIGMA

    return Math.exp(mean - (SIGMA * pdf(a)) / Math.max(1e-9, cdf(a)))
  }
  const a = (Math.log(200) - mean) / SIGMA

  return Math.exp(mean + (SIGMA * pdf(a)) / Math.max(1e-9, 1 - cdf(a)))
}
