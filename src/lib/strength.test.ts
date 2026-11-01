import { describe, expect, test } from "bun:test"
import { computeShares, standing } from "@/lib/engine"
import { EXAMPLE_PROFILE } from "@/lib/example"
import { FAMILIES } from "@/lib/field"
import { FIT_AVERAGE, FIT_WEIGHTS, STRENGTH_PULL, fitOf } from "@/lib/fit"
import type { Reference } from "@/lib/jobs"
import { GRADE_TIERS, RECOGNITION_TIERS, RELEVANCE_SHARE, STANDING_TIERS, STRENGTH_SPAN, itemStrength, parseItemFacts, relevanceOf, strengthFromItems, type ItemFacts, type ReadItem } from "@/lib/strength"
import type { Posting } from "@/lib/types"

const facts = (over: Partial<ItemFacts> = {}): ItemFacts => ({ standing: "none", recognition: "none", grades: "none", family: "Finance & accounting", ...over })
const item = (over: Partial<ItemFacts> = {}, text = "Audit intern, KPMG (Amsterdam). Jun 2023 to Aug 2023"): ReadItem => ({ text, facts: facts(over) })
const FIN = "Finance & accounting"
const CEILING = FIT_AVERAGE + STRENGTH_SPAN

describe("itemStrength", () => {
  test("an ordinary part has none", () => expect(itemStrength(facts())).toBe(0))
  test("the best signal counts in full and the second at a quarter", () => {
    expect(itemStrength(facts({ recognition: "international" }))).toBeCloseTo(0.8, 12)
    expect(itemStrength(facts({ recognition: "international", grades: "stated_top" }))).toBeCloseTo(0.8 + 0.25 * 0.4, 12)
  })
  test("two small signals do not make a great one", () => {
    expect(itemStrength(facts({ standing: "known", recognition: "national", grades: "stated_high" }))).toBeLessThan(itemStrength(facts({ standing: "elite" })))
  })
  test("every combination stays between 0 and 1, and a stronger answer never lowers it", () => {
    const up = (list: ReadonlyArray<string>, x: string): string => list[Math.min(list.length - 1, list.indexOf(x) + 1)]
    let n = 0
    for (const s of STANDING_TIERS) for (const r of RECOGNITION_TIERS) for (const g of GRADE_TIERS) {
      const v = itemStrength(facts({ standing: s, recognition: r, grades: g }))
      n++
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
      expect(itemStrength(facts({ standing: up(STANDING_TIERS, s) as never, recognition: r, grades: g }))).toBeGreaterThanOrEqual(v)
      expect(itemStrength(facts({ standing: s, recognition: up(RECOGNITION_TIERS, r) as never, grades: g }))).toBeGreaterThanOrEqual(v)
      expect(itemStrength(facts({ standing: s, recognition: r, grades: up(GRADE_TIERS, g) as never }))).toBeGreaterThanOrEqual(v)
    }
    expect(n).toBe(3 * 4 * 3)
  })
})

describe("relevanceOf", () => {
  test("the same line of work is the same", () => {
    for (const f of FAMILIES) expect(relevanceOf(f, f)).toBe("same")
  })
  test("neighbouring lines of work are adjacent, and it works both ways", () => {
    expect(relevanceOf("Finance & accounting", "Risk, compliance & legal")).toBe("adjacent")
    expect(relevanceOf("Risk, compliance & legal", "Finance & accounting")).toBe("adjacent")
    expect(relevanceOf("Software engineering", "Data, analytics & AI")).toBe("adjacent")
  })
  test("far lines of work are unrelated", () => {
    expect(relevanceOf("Finance & accounting", "Design & UX")).toBe("unrelated")
    expect(relevanceOf("Software engineering", "Sales & account management")).toBe("unrelated")
  })
  test("an unknown line of work on either side is the cautious middle", () => {
    expect(relevanceOf(null, FIN)).toBe("adjacent")
    expect(relevanceOf(FIN, null)).toBe("adjacent")
    expect(relevanceOf(undefined, undefined)).toBe("adjacent")
  })
  test("every family the app knows is a valid answer", () => {
    for (const a of FAMILIES) for (const b of FAMILIES) expect(["same", "adjacent", "unrelated"]).toContain(relevanceOf(a, b))
  })
})

describe("strengthFromItems", () => {
  test("nothing read yet is null, not zero", () => expect(strengthFromItems([], FIN)).toBeNull())
  test("an ordinary profile is exactly the average: no lift and no penalty", () => {
    const s = strengthFromItems([item(), item({}, "BSc Business, a college, 2020 to 2023")], FIN)!
    expect(s.value).toBe(FIT_AVERAGE)
    expect(s.detail).toContain("does not lower your chance")
  })
  test("an elite employer in the job's own line of work lifts the most, then next to it, then far from it", () => {
    const v = (family: string) => strengthFromItems([item({ standing: "elite", family })], FIN)!.value
    expect(v(FIN)).toBeGreaterThan(v("Risk, compliance & legal"))
    expect(v("Risk, compliance & legal")).toBeGreaterThan(v("Design & UX"))
    expect(v("Design & UX")).toBeGreaterThan(FIT_AVERAGE)
    expect(v(FIN)).toBeCloseTo(CEILING, 12)
  })
  test("the same elite experience is worth different amounts for different jobs", () => {
    const items = [item({ standing: "elite", family: FIN })]
    expect(strengthFromItems(items, FIN)!.value).toBeGreaterThan(strengthFromItems(items, "Design & UX")!.value)
  })
  test("each part counts for the job it is closest to: a finance role helps a finance job, a design prize a design job", () => {
    const items = [item({ standing: "elite", family: FIN }, "Audit intern, KPMG"), item({ recognition: "international", family: "Design & UX" }, "Winner, international design awards")]
    expect(strengthFromItems(items, FIN)!.detail).toContain("KPMG")
    expect(strengthFromItems(items, "Design & UX")!.detail).toContain("design awards")
  })
  test("the best part counts in full and the second at a quarter", () => {
    const one = strengthFromItems([item({ recognition: "international" })], FIN)!.value
    const two = strengthFromItems([item({ recognition: "international" }), item({ standing: "known" })], FIN)!.value
    expect(two - one).toBeCloseTo(STRENGTH_SPAN * 0.25 * 0.5, 12)
  })
  test("many small parts do not add up to one great one", () => {
    const small = Array.from({ length: 20 }, () => item({ standing: "known" }))
    expect(strengthFromItems(small, FIN)!.value).toBeLessThan(strengthFromItems([item({ standing: "elite" })], FIN)!.value)
  })
  test("the order of the parts does not matter, and the same facts give the same words", () => {
    const a = item({ standing: "elite" }, "A")
    const b = item({ recognition: "national", family: "Design & UX" }, "B")
    expect(strengthFromItems([a, b], FIN)).toEqual(strengthFromItems([b, a], FIN))
    expect(strengthFromItems([a, b], FIN)).toEqual(strengthFromItems([{ ...a }, { ...b }], FIN))
  })
  test("whatever the facts, the value stays between the average and the ceiling", () => {
    for (const s of STANDING_TIERS) for (const r of RECOGNITION_TIERS) for (const g of GRADE_TIERS) for (const fam of [...FAMILIES, null]) for (const job of [FIN, "Design & UX", null]) {
      const v = strengthFromItems([item({ standing: s, recognition: r, grades: g, family: fam })], job)!.value
      expect(v).toBeGreaterThanOrEqual(FIT_AVERAGE)
      expect(v).toBeLessThanOrEqual(CEILING + 1e-12)
    }
  })
  test("a part is quoted by its start, in the person's own words, up to its first full stop", () => {
    const d = strengthFromItems([item({ standing: "elite" }, "Summer Analyst, Goldman Sachs (London, UK). Jun 2023 to Aug 2023. Built valuation models for two deals")], FIN)!.detail
    expect(d).toBe("Summer Analyst, Goldman Sachs (London, UK): the same kind of work")
  })
  test("a very long first sentence is cut at a word, never in the middle of one", () => {
    const d = strengthFromItems([item({ standing: "elite" }, "Analyst " + "responsibilities ".repeat(30))], FIN)!.detail
    expect(d).toContain("...:")
    expect(d.length).toBeLessThan(130)
    expect(d).not.toMatch(/responsibilit\.\.\./)
  })
  test("the closeness is said in words", () => {
    expect(strengthFromItems([item({ standing: "elite", family: FIN })], FIN)!.detail).toContain("the same kind of work")
    expect(strengthFromItems([item({ standing: "elite", family: "Design & UX" })], FIN)!.detail).toContain("far from this job")
  })
  test("the shares match the tiers used in the arithmetic", () => {
    expect(RELEVANCE_SHARE).toEqual({ unrelated: 0.2, adjacent: 0.6, same: 1 })
  })
})

describe("parseItemFacts", () => {
  test("accepts complete facts, with a family or none", () => {
    expect(parseItemFacts({ standing: "known", recognition: "none", grades: "none", family: FIN })).toEqual({ standing: "known", recognition: "none", grades: "none", family: FIN })
    expect(parseItemFacts({ standing: "none", recognition: "local", grades: "stated_top", family: null })?.family).toBeNull()
  })
  test("rejects anything unexpected instead of guessing", () => {
    expect(parseItemFacts(null)).toBeNull()
    expect(parseItemFacts("elite")).toBeNull()
    expect(parseItemFacts({})).toBeNull()
    expect(parseItemFacts({ standing: "famous", recognition: "none", grades: "none", family: FIN })).toBeNull()
    expect(parseItemFacts({ standing: "none", recognition: "none", grades: "none", family: "Underwater basket weaving" })).toBeNull()
    expect(parseItemFacts({ standing: "none", recognition: "none", grades: "none" })).toBeNull()
    expect(parseItemFacts({ standing: 1, recognition: "none", grades: "none", family: null })).toBeNull()
    expect(parseItemFacts({ standing: "constructor", recognition: "toString", grades: "none", family: null })).toBeNull()
  })
})

describe("fit with strength", () => {
  const base = { title: "Financial Analyst", level: "Entry", years: 1, wanted: [{ name: "excel", tier: "must" as const }, { name: "ifrs", tier: "must" as const }], have: (s: string) => s === "excel", text: "financial analyst excel ifrs msc finance" }
  const str = (over: Partial<ItemFacts> = {}) => strengthFromItems([item(over)], FIN)!

  test("the weights of the three parts add up to one", () => {
    expect(Object.values(FIT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })
  test("without strength the fit is the parts as before", () => {
    expect(fitOf(base)!.parts.map((p) => p.key)).toEqual(["skills", "role", "level"])
    expect(fitOf({ ...base, strength: null })!.parts.map((p) => p.key)).toEqual(["skills", "role", "level"])
  })
  test("a strong record lifts the fit and an ordinary one leaves it exactly where it was", () => {
    const none = fitOf(base)!.score
    expect(fitOf({ ...base, strength: str() })!.score).toBe(none)
    expect(fitOf({ ...base, strength: str({ standing: "elite" }) })!.score).toBeGreaterThan(none)
  })
  test("strength cannot lift the fit by more than its pull allows, and never past 1", () => {
    const none = fitOf(base)!.score
    expect(fitOf({ ...base, strength: str({ standing: "elite" }) })!.score - none).toBeCloseTo(STRENGTH_PULL * STRENGTH_SPAN, 10)
    expect(fitOf({ ...base, have: () => true, field: 1, strength: str({ standing: "elite", recognition: "international", grades: "stated_top" }) })!.score).toBeLessThanOrEqual(1)
  })
  test("a record with nothing else to compare says nothing about the job", () => {
    expect(fitOf({ title: "", level: "Not stated", years: 0, wanted: [], have: () => false, text: "", strength: str({ standing: "elite" }) })).toBeNull()
  })
  test("a strong record does not rescue a profile that fails the skills badly", () => {
    const bad = { ...base, have: () => false, text: "barista", years: 12 }
    expect(fitOf({ ...bad, strength: str({ standing: "elite" }) })!.score).toBeLessThan(fitOf({ ...base, have: () => true })!.score)
  })
})

describe("standing with strength", () => {
  const ref = { bands: {}, transitions: {}, ageFactors: {}, tax: null } as unknown as Reference
  const post = {
    id: "p1", employer: "acme", employer_display: "Acme", ats: "greenhouse", source: "ats_board", title: "Financial Analyst", region: "Amsterdam, NL", cat: "finance_business", cbs_group: "0812",
    url: "https://example.com/1", ind_sponsor: true, ind_sponsor_name: "Acme", years_min: null, dutch_required: false, visa_mention: false, junior_title: false, degree_asked: null,
    skills: ["excel", "ifrs", "sql"], pay_posted: null, applicants: null, applicants_text: null, valid_through: null, seniority: "Entry level", posted_at: null, days_open: 3,
    freshness_state: "fresh", fetched_at: null, title_clean: null, level_jev: null, level_conf: null, usable: 1, industry: null, workplace: null, job_type: null, dutch_jev: null, family: FIN,
  } as unknown as Posting
  const shares = computeShares([post])
  const str = (over: Partial<ItemFacts> = {}) => strengthFromItems([item(over, "Audit intern, KPMG, Amsterdam")], post.family)

  test("no strength: the same result as before the feature existed", () => {
    const a = standing(post, EXAMPLE_PROFILE, ref, shares)
    expect(standing(post, EXAMPLE_PROFILE, ref, shares, undefined, false, null).rate).toEqual(a.rate)
    expect(a.fit?.parts.map((p) => p.key)).not.toContain("strength")
  })
  test("an elite record raises the chance, an ordinary one changes nothing, and the top stays under the sourced ceiling", () => {
    const base = standing(post, EXAMPLE_PROFILE, ref, shares).rate!
    const ordinary = standing(post, EXAMPLE_PROFILE, ref, shares, undefined, false, str()).rate!
    const elite = standing(post, EXAMPLE_PROFILE, ref, shares, undefined, false, str({ standing: "elite", recognition: "international" })).rate!
    expect(ordinary.mid).toBeCloseTo(base.mid, 12)
    expect(elite.mid).toBeGreaterThan(base.mid)
    expect(elite.high).toBeLessThanOrEqual(0.54)
    expect(elite.low).toBeLessThanOrEqual(elite.high)
    expect(elite.lines.some((l) => l.label.includes("KPMG"))).toBe(true)
  })
  test("a requirement you do not meet is no hard gate: the chance still comes from your profile and strength, and the unmet ask is listed", () => {
    const s = standing({ ...post, degree_asked: "phd" } as Posting, EXAMPLE_PROFILE, ref, shares, undefined, false, str({ standing: "elite" }))
    expect(s.failing).toBeGreaterThan(0)
    expect(s.rate).not.toBeNull()
  })
  test("strength cannot create a chance where there is no profile", () => {
    const empty = { ...EXAMPLE_PROFILE, cv: "", positions: [], education: [], skills: [] }
    expect(standing(post, empty, ref, shares, undefined, false, str({ standing: "elite" })).rate).toBeNull()
  })
})
