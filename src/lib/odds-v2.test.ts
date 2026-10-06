import { describe, expect, test } from "bun:test"
import { chanceIn, oddsV2, phi, phiInv } from "@/lib/odds-v2"
import { EXPECT, JOBS, PEOPLE, job } from "@/lib/odds-v2.personas"
import { employerTier } from "@/lib/tiers"

describe("odds-v2: personas land where common sense and the studies put them", () => {
  for (const [who, what, lo, hi, why] of EXPECT) {
    test(`${who} -> ${what}: ${lo}-${hi}% (${why})`, () => {
      const pct = oddsV2(JOBS[what], PEOPLE[who]).p * 100
      expect(pct).toBeGreaterThanOrEqual(lo)
      expect(pct).toBeLessThanOrEqual(hi)
    })
  }
})

describe("odds-v2: rules every answer must keep", () => {
  const p = (who: keyof typeof PEOPLE, what: keyof typeof JOBS, ctx = {}): number => oddsV2(JOBS[what], PEOPLE[who], ctx).p

  test("the pile as a whole gets k of N", () => {
    // Integrate the chance over a standard-normal pool of strengths: it must give back the interview share.
    const pile = { applicants: 180, interviews: 8, source: "typical" as const }
    let sum = 0
    for (let z = -6; z <= 6; z += 0.01) sum += chanceIn(z, pile) * Math.exp((-z * z) / 2) * 0.01
    expect(sum / Math.sqrt(2 * Math.PI)).toBeCloseTo(8 / 180, 3)
  })
  test("normal helpers invert each other", () => {
    for (const q of [0.01, 0.2, 0.5, 0.9, 0.99]) expect(phi(phiInv(q))).toBeCloseTo(q, 4)
  })
  test("a referral and a tailored letter only ever help", () => {
    expect(p("midFinanceIntern", "midFinanceEntry", { referral: true })).toBeGreaterThan(p("midFinanceIntern", "midFinanceEntry"))
    expect(p("midFinanceIntern", "midFinanceEntry", { tailored: true })).toBeGreaterThan(p("midFinanceIntern", "midFinanceEntry"))
  })
  test("relevant experience beats a famous name in another line of work", () => {
    expect(p("midFinanceIntern", "startupFinance")).toBeGreaterThan(p("mckinseyMarketingToFinance", "startupFinance"))
  })
  test("a famous name counts more in the same line of work than outside it", () => {
    const same = oddsV2(JOBS.scaleupSwe, PEOPLE.googleSwe).parts.find((x) => x.label.startsWith("Known employer"))!.z
    const other = oddsV2(JOBS.scaleupMarketing, PEOPLE.googleSwe).parts.find((x) => x.label.startsWith("Known employer"))!.z
    expect(same).toBeGreaterThan(other)
  })
  test("the same person has a lower chance where more people apply", () => {
    expect(p("gsAnalyst", "startupFinance")).toBeGreaterThan(p("gsAnalyst", "eliteBankAnalyst"))
  })
  test("Dutch matters more where the job asks for it", () => {
    const base = PEOPLE.midFinanceIntern
    const asked = job({ ...JOBS.midFinanceEntry, dutch_required: true })
    const withDutch = oddsV2(asked, { ...base, dutch: "professional" }).p
    const without = oddsV2(asked, { ...base, dutch: "none" }).p
    expect(withDutch / without).toBeGreaterThan(1.3)
  })
  test("missing most of the years asked costs more than missing a few", () => {
    const few = oddsV2(job({ ...JOBS.seniorFinance, years_min: 4 }), PEOPLE.gsAnalyst).p
    const many = oddsV2(job({ ...JOBS.seniorFinance, years_min: 10 }), PEOPLE.gsAnalyst).p
    expect(few).toBeGreaterThan(many)
  })
  test("every chance is a probability and its range holds it", () => {
    for (const who of Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>)
      for (const what of Object.keys(JOBS) as Array<keyof typeof JOBS>) {
        const r = oddsV2(JOBS[what], PEOPLE[who])
        expect(r.p).toBeGreaterThanOrEqual(0)
        expect(r.p).toBeLessThanOrEqual(1)
        expect(r.low).toBeLessThanOrEqual(r.p + 1e-9)
        expect(r.high).toBeGreaterThanOrEqual(r.p - 1e-9)
      }
  })
})

describe("employer tiers", () => {
  test("names and sizes", () => {
    expect(employerTier("Goldman Sachs International")).toBe("elite")
    expect(employerTier("J.P. Morgan")).toBe("elite")
    expect(employerTier("Picnic", 5569)).toBe("large")
    expect(employerTier("Some BV", 40)).toBe("small")
    expect(employerTier("Nobody")).toBe("unknown")
  })
})
