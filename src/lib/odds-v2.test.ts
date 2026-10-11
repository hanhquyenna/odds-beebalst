import { describe, expect, test } from "bun:test"
import { chanceIn, FLOOR, oddsV2, OTHER_CHANNELS, phi, phiInv, pileFor, POSITION_KEYS, projectedApplicants, SENIOR_YEARS, stillReviewing } from "@/lib/odds-v2"
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
    const name = (x: { key: string }): boolean => x.key === "prestige" || x.key === "eliteSameLine"
    const same = oddsV2(JOBS.scaleupSwe, PEOPLE.googleSwe).parts.find(name)!.z
    const other = oddsV2(JOBS.scaleupMarketing, PEOPLE.googleSwe).parts.find(name)!.z
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
  test("short names only match as whole names, not inside other words", () => {
    expect(employerTier("ING")).toBe("elite")
    expect(employerTier("ING Bank N.V.")).toBe("elite")
    for (const n of ["Shell", "Shell Nederland B.V.", "Apple Inc.", "Bain & Company", "Amazon", "IMC Trading", "EY", "Goldman Sachs International", "Deloitte Consulting", "PwC Advisory N.V.", "McKinsey &amp; Company", "Blackstone"]) expect(employerTier(n)).toBe("elite")
    for (const n of ["The Sharing Group", "Booking Agency Ltd", "Shell Shock Studios", "Bainbridge Consulting", "Key Accounting", "Imcorp", "Apple Pie Bakery", "Meta Studio", "Amazonia Coffee", "Citizen M", "Stripes & Co Design", "Pingdom", "De Brauw Blackstone Westbroek", "Versuni (formerly Philips Domestic Appliances)"]) expect(employerTier(n)).not.toBe("elite")
  })
})

describe("odds-v2: no hard rejecting", () => {
  const all = (): Array<[string, string, ReturnType<typeof oddsV2>]> =>
    (Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>).flatMap((who) => (Object.keys(JOBS) as Array<keyof typeof JOBS>).map((what) => [who, what, oddsV2(JOBS[what], PEOPLE[who])] as [string, string, ReturnType<typeof oddsV2>]))

  test("nobody is ever shown 0%: every chance is at least the floor", () => {
    for (const [, , r] of all()) {
      expect(r.p).toBeGreaterThanOrEqual(FLOOR)
      expect(r.low).toBeGreaterThanOrEqual(FLOOR)
    }
  })
  test("no single missing thing takes away more than three quarters of a chance", () => {
    // Each part alone, removed from the strength, may not change the chance by more than 4x: there are no gates. The one exception, on
    // purpose: missing most of the years a senior job (5+ years) asks for.
    for (const [, what, r] of all()) {
      const post = JOBS[what as keyof typeof JOBS]
      const seniorAsk = (post.years_min ?? (post.level_view && ["Senior", "Manager", "Director"].includes(post.level_view) ? SENIOR_YEARS : 0)) >= SENIOR_YEARS
      for (const part of r.parts.filter((x) => x.z < 0 && !(seniorAsk && x.key === "underqualified"))) {
        const kept = POSITION_KEYS.has(part.key) ? part.z : part.z * r.factorScale
        const without = chanceIn(r.strength - kept, r.pile)
        const withIt = chanceIn(r.strength, r.pile)
        expect(withIt / without).toBeGreaterThan(0.25)
      }
    }
  })
  test("there is always a way up: a referral raises every chance that is not already at the ceiling", () => {
    for (const who of Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>)
      for (const what of Object.keys(JOBS) as Array<keyof typeof JOBS>) {
        const a = oddsV2(JOBS[what], PEOPLE[who]).p
        const b = oddsV2(JOBS[what], PEOPLE[who], { referral: true }).p
        if (a < 0.99) expect(b).toBeGreaterThan(a)
      }
  })
  test("missing Dutch on a job that asks for it lowers the chance but never to the floor for a relevant candidate", () => {
    const r = oddsV2(JOBS.dutchFinance, { ...PEOPLE.midFinanceIntern, dutch: "none" })
    expect(r.p).toBeGreaterThan(FLOOR * 2)
  })
})

describe("odds-v2: edge cases", () => {
  const empty = { ...PEOPLE.freshFinanceGrad, positions: [], education: [], skills: [], cv: "" }
  const sane = (r: ReturnType<typeof oddsV2>): void => {
    for (const v of [r.p, r.low, r.high, r.strength]) expect(Number.isFinite(v)).toBe(true)
    expect(r.p).toBeGreaterThanOrEqual(FLOOR)
    expect(r.p).toBeLessThanOrEqual(0.99)
    expect(r.low).toBeLessThanOrEqual(r.p)
    expect(r.high).toBeGreaterThanOrEqual(r.p)
  }

  test("an empty profile gets a small chance, not an error", () => {
    const r = oddsV2(JOBS.midFinanceEntry, empty)
    sane(r)
    expect(r.p).toBeLessThan(oddsV2(JOBS.midFinanceEntry, PEOPLE.midFinanceIntern).p)
  })
  test("a posting with nothing but a title", () => {
    sane(oddsV2(job({ title: "Medewerker", employer: "" }), PEOPLE.gsAnalyst))
    sane(oddsV2(job({ title: "", employer: "" }), PEOPLE.gsAnalyst))
  })
  test("odd titles: emoji, non-Latin, very long, punctuation only", () => {
    for (const t of ["🚀 Rockstar Ninja 🚀", "財務アナリスト", "Финансовый аналитик", "x".repeat(5000), "---", "Sr. Fin. Anlst (m/w/d)"]) {
      sane(oddsV2(job({ ...JOBS.midFinanceEntry, title: t }), PEOPLE.gsAnalyst))
      sane(oddsV2(JOBS.midFinanceEntry, { ...PEOPLE.gsAnalyst, positions: [{ ...PEOPLE.gsAnalyst.positions[0], Title: t }] }))
    }
  })
  test("piles of any size: 0, 1, fewer than the interviews, 100,000", () => {
    for (const n of [0, 1, 5, 9, 100_000]) sane(oddsV2(job({ ...JOBS.midFinanceEntry, applicants: n }), PEOPLE.gsAnalyst))
    expect(oddsV2(job({ ...JOBS.midFinanceEntry, applicants: 100_000 }), PEOPLE.gsAnalyst).p).toBeLessThan(oddsV2(job({ ...JOBS.midFinanceEntry, applicants: 20 }), PEOPLE.gsAnalyst).p)
  })
  test("years asked: 0, far more than anyone has, and negative nonsense", () => {
    for (const y of [0, 40, -3]) sane(oddsV2(job({ ...JOBS.midFinanceEntry, years_min: y }), PEOPLE.gsAnalyst))
  })
  test("dates: missing, in the future, reversed, unreadable", () => {
    const roles = [
      { Title: "Financial Analyst", "Company Name": "X", "Started On": "", "Finished On": "", Location: "" },
      { Title: "Financial Analyst", "Company Name": "X", "Started On": "Jan 2031", "Finished On": "Jan 2033", Location: "Amsterdam, Netherlands" },
      { Title: "Financial Analyst", "Company Name": "X", "Started On": "Jan 2024", "Finished On": "Jan 2020", Location: "Amsterdam, Netherlands" },
      { Title: "Financial Analyst", "Company Name": "X", "Started On": "sometime", "Finished On": "later", Location: "Mars" },
    ]
    for (const r of roles) sane(oddsV2(JOBS.midFinanceEntry, { ...PEOPLE.freshFinanceGrad, positions: [r] }))
  })
  test("fifty roles, and the same role many times, stay sane and do not stack", () => {
    const one = PEOPLE.midFinanceIntern.positions[0]
    const many = { ...PEOPLE.midFinanceIntern, positions: Array.from({ length: 50 }, () => one) }
    const r = oddsV2(JOBS.midFinanceEntry, many)
    sane(r)
    expect(r.parts.filter((x) => x.key === "prestige").length).toBeLessThanOrEqual(1)
    expect(r.parts.filter((x) => x.key === "relevance").length).toBe(1)
  })
  test("the order of roles does not change the answer", () => {
    const a = { ...PEOPLE.gsAnalyst, positions: [...PEOPLE.gsAnalyst.positions, ...PEOPLE.barista.positions] }
    const b = { ...PEOPLE.gsAnalyst, positions: [...PEOPLE.barista.positions, ...PEOPLE.gsAnalyst.positions] }
    expect(oddsV2(JOBS.startupFinance, a).p).toBeCloseTo(oddsV2(JOBS.startupFinance, b).p, 10)
  })
  test("the same input always gives the same answer", () => {
    expect(oddsV2(JOBS.big4Audit, PEOPLE.indiaOnlyFinance).p).toBe(oddsV2(JOBS.big4Audit, PEOPLE.indiaOnlyFinance).p)
  })
  test("adding an unrelated job for money never lowers the chance", () => {
    const more = { ...PEOPLE.midFinanceIntern, positions: [...PEOPLE.midFinanceIntern.positions, ...PEOPLE.barista.positions] }
    expect(oddsV2(JOBS.midFinanceEntry, more).p).toBeGreaterThanOrEqual(oddsV2(JOBS.midFinanceEntry, PEOPLE.midFinanceIntern).p - 1e-12)
  })
  test("every Dutch level and origin gives a sane answer, and more Dutch never hurts", () => {
    for (const origin of ["dutch", "eu_non_native", "non_eu"] as const) {
      let prev = 0
      for (const dutch of ["none", "basic", "professional", "native"] as const) {
        const r = oddsV2(JOBS.dutchFinance, { ...PEOPLE.midFinanceIntern, origin, dutch })
        sane(r)
        expect(r.p).toBeGreaterThanOrEqual(prev)
        prev = r.p
      }
    }
  })
  test("each part names a source and a key, so every number can be traced", () => {
    for (const who of Object.keys(PEOPLE) as Array<keyof typeof PEOPLE>)
      for (const p of oddsV2(JOBS.dutchFinance, PEOPLE[who], { referral: true, tailored: true }).parts) {
        expect(p.key.length).toBeGreaterThan(0)
        expect(p.source.length).toBeGreaterThan(0)
      }
  })
})

describe("a posting's applicant count is a floor, not the final pile", () => {
  const now = Date.parse("2026-10-11T12:00:00Z")

  test("a count read two days after posting is carried forward to a typical posting's life", () => {
    // 48 read on day 2 of a posting still open on day 13: about 48 × √(28 / 2), not 48.
    const p = projectedApplicants(48, { posted_on: "2026-09-28", fetched_at: "2026-09-30T08:00:00Z" }, now)
    expect(p.daysAfterPosting).toBe(2)
    expect(p.applicants).toBe(Math.round(48 * Math.sqrt(28 / 2)))
  })

  test("a count read late barely moves, and it never goes down", () => {
    expect(projectedApplicants(200, { posted_on: "2026-09-01", fetched_at: "2026-09-29T08:00:00Z" }, now).applicants).toBeGreaterThanOrEqual(200)
    expect(projectedApplicants(200, { posted_on: "2026-09-01", fetched_at: "2026-09-29T08:00:00Z" }, now).applicants).toBeLessThan(260)
  })

  test("read on a known day but no posting date: as a typical posting read on day 9", () => {
    expect(projectedApplicants(90, { posted_on: null, fetched_at: "2026-10-01T08:00:00Z" }, now).applicants).toBe(Math.round(90 * Math.sqrt(28 / 9)))
  })

  test("no idea when it was read (typed in by hand): the count is taken as it stands", () => {
    expect(projectedApplicants(90, { posted_on: null, fetched_at: null }, now).applicants).toBe(90)
  })

  test("a posting open past its usual life keeps gathering, up to a cap", () => {
    const old = projectedApplicants(10, { posted_on: "2026-07-01", fetched_at: "2026-07-02T08:00:00Z" }, now)
    expect(old.applicants).toBe(60)
  })

  test("the chance falls when the same count was read earlier in the posting's life", () => {
    const early = oddsV2(job({ ...JOBS.midFinanceEntry, applicants: 48, posted_on: "2026-09-28", fetched_at: "2026-09-30T08:00:00Z" }), PEOPLE.gsAnalyst)
    const late = oddsV2(job({ ...JOBS.midFinanceEntry, applicants: 48, posted_on: "2026-09-01", fetched_at: "2026-09-29T08:00:00Z" }), PEOPLE.gsAnalyst)
    expect(early.p).toBeLessThan(late.p)
    expect(early.pile.seen).toEqual({ count: 48, daysAfterPosting: 2 })
  })
})

describe("still reviewing (old postings)", () => {
  const now = Date.parse("2026-10-11T12:00:00Z")

  test("a new posting is read in full; the chance falls with age after two weeks and never rises again", () => {
    const at = (days: number): number => stillReviewing({ days_open: days, valid_through: null }, now)
    expect(at(0)).toBe(1)
    expect(at(14)).toBe(1)
    let last = 1
    for (const d of [15, 21, 28, 35, 42, 56, 70, 84, 120, 365]) {
      expect(at(d)).toBeLessThanOrEqual(last)
      last = at(d)
    }
    // The points taken from our own postings: between the two readings of the checker's closes (28 days: 62% to 87%; 56 days: 31% to 64%).
    expect(at(28)).toBeGreaterThan(0.62)
    expect(at(28)).toBeLessThan(0.87)
    expect(at(56)).toBeGreaterThan(0.31)
    expect(at(56)).toBeLessThan(0.64)
    expect(at(365)).toBeGreaterThan(0.2)
  })

  test("an unknown age or a closing date still ahead takes nothing off: everyone who applies by then is read", () => {
    expect(stillReviewing({ days_open: null, valid_through: null }, now)).toBe(1)
    expect(stillReviewing({ days_open: 50, valid_through: "2026-11-15" }, now)).toBe(1)
    expect(stillReviewing({ days_open: 50, valid_through: "2026-09-01" }, now)).toBeLessThan(1)
  })

  test("the same person gets a lower chance on an old posting than on a new one, never zero, and the range follows", () => {
    const base = { ...JOBS.financeIntern, valid_through: null }
    const fresh = oddsV2({ ...base, days_open: 3 }, PEOPLE.gsAnalyst)
    const old = oddsV2({ ...base, days_open: 60 }, PEOPLE.gsAnalyst)
    expect(fresh.reviewing).toBe(1)
    expect(old.reviewing).toBeLessThan(0.6)
    expect(old.p).toBeLessThan(fresh.p)
    expect(old.p).toBeGreaterThanOrEqual(FLOOR)
    expect(old.low).toBeLessThanOrEqual(old.p)
    expect(old.high).toBeGreaterThanOrEqual(old.p)
  })
})

describe("odds-v2: a count seen on one site is not the whole pile", () => {
  test("the pile is the projected count times the other channels", () => {
    const pile = pileFor(job({ ...JOBS.midFinanceEntry, applicants: 40, posted_on: null, fetched_at: null }), "mid")
    expect(pile.applicants).toBe(40 * OTHER_CHANNELS)
  })
})
