import { describe, expect, test } from "bun:test"
import { levelOf } from "@/lib/engine"
import { guessFamily } from "@/lib/field"
import { DEFAULT_FILTERS, NO_FILTERS, STARTING_LEVELS, activeCount, applyFilters, fieldOf, isStartingLevel, normalizeFilters } from "@/lib/filters"
import type { Signals } from "@/lib/jobs"
import { payOf } from "@/lib/spec"
import type { Posting } from "@/lib/types"

function job(over: Partial<Posting>): Posting {
  return {
    id: "x", employer: "e", employer_display: "E", ats: "a", source: "s", title: "Analyst", region: "Amsterdam", cat: "finance_business", cbs_group: null, url: null,
    ind_sponsor: false, ind_sponsor_name: null, years_min: null, dutch_required: false, visa_mention: false, junior_title: false, degree_asked: null, skills: [],
    pay_posted: null, applicants: null, applicants_text: null, valid_through: null, seniority: null, posted_at: null, days_open: 1, freshness_state: "fresh", fetched_at: null,
    ...over,
  }
}

const POOL: Posting[] = [
  job({ id: "1", employer: "ing", cat: "finance_business", title: "Finance Internship", dutch_required: false, ind_sponsor: true }),
  job({ id: "2", employer: "salesforce", cat: "tech", title: "Senior Software Engineer", dutch_required: true, ind_sponsor: true }),
  job({ id: "3", employer: "salesforce", cat: "tech", title: "Junior Data Analyst", dutch_required: false, ind_sponsor: false }),
  job({ id: "4", employer: "pwc", cat: "other", title: "Head of Operations", dutch_required: true, ind_sponsor: false }),
]
const ids = (filters: Parameters<typeof applyFilters>[1]): string[] => applyFilters(POOL, filters).map((p) => p.id)

describe("search words", () => {
  const one = job({ id: "s", employer: "bol", employer_display: "Bol.com", title: "Marketing Interns Wanted", region: "Utrecht, NL", industry: "Retail & e-commerce" })
  const found = (q: string): boolean => applyFilters([one], { ...NO_FILTERS, query: q }).length === 1
  test("finds a word as written, run together, or as a plural", () => {
    expect(found("e-commerce")).toBe(true)
    expect(found("ecommerce")).toBe(true)
    expect(found("e commerce")).toBe(true)
    expect(found("intern")).toBe(true)
    expect(found("interns")).toBe(true)
    expect(found("Bol.com utrecht")).toBe(true)
  })
  test("a short word never matches across the join of two words", () => {
    const data = job({ id: "d", employer_display: "Acme", title: "Pizza Intern", region: "Utrecht, NL" })
    const has = (q: string): boolean => applyFilters([data], { ...NO_FILTERS, query: q }).length === 1
    expect(has("ai")).toBe(false)
    expect(has("tai")).toBe(false)
    expect(has("pizza")).toBe(true)
    const rd = job({ id: "r", title: "R&D Engineer" })
    expect(applyFilters([rd, data], { ...NO_FILTERS, query: "R&D" }).map((p) => p.id)).toEqual(["r"])
    expect(applyFilters([data], { ...NO_FILTERS, query: "pizzaintern" })).toHaveLength(1)
  })
  test("a word of up to three letters matches only where a word starts", () => {
    const ing = job({ id: "i", employer_display: "ING", title: "Analyst" })
    const retail = job({ id: "t", employer_display: "Shop", title: "Retail Analyst" })
    expect(applyFilters([ing, retail], { ...NO_FILTERS, query: "ing" }).map((p) => p.id)).toEqual(["i"])
    expect(applyFilters([ing, retail], { ...NO_FILTERS, query: "ai" })).toHaveLength(0)
    expect(applyFilters([retail], { ...NO_FILTERS, query: "ret" })).toHaveLength(1)
  })
  test("every word must be there", () => {
    expect(found("marketing amsterdam")).toBe(false)
    expect(found("zzz")).toBe(false)
  })
  test("accents and capitals do not matter", () => {
    const nestle = job({ id: "n", employer_display: "Nestlé Nederland", title: "Trainee" })
    expect(applyFilters([nestle], { ...NO_FILTERS, query: "NESTLE" })).toHaveLength(1)
  })
})

describe("applyFilters", () => {
  test("no filters keeps everything", () => {
    expect(ids(NO_FILTERS)).toEqual(["1", "2", "3", "4"])
  })
  test("job field is the job's own line of work, not the employer's industry", () => {
    const post = job({ id: "f", employer: "optiver", title: "Software Engineer Internship", family: "Software engineering" })
    expect(applyFilters([post], { ...NO_FILTERS, field: ["Software engineering"] })).toHaveLength(1)
    expect(applyFilters([post], { ...NO_FILTERS, field: ["Finance & accounting"] })).toHaveLength(0)
  })
  test("industry", () => {
    expect(ids({ ...NO_FILTERS, industry: ["Software & internet"] })).toEqual(["2", "3"])
    expect(ids({ ...NO_FILTERS, industry: ["Accounting"] })).toEqual(["4"])
    expect(ids({ ...NO_FILTERS, industry: ["Banking"] })).toEqual(["1"])
  })
  test("level", () => {
    expect(ids({ ...NO_FILTERS, level: ["Internship"] })).toEqual(["1"])
    expect(ids({ ...NO_FILTERS, level: ["Senior"] })).toEqual(["2"])
    expect(ids({ ...NO_FILTERS, level: ["Entry"] })).toEqual(["3"])
    expect(ids({ ...NO_FILTERS, level: ["Director"] })).toEqual(["4"])
  })
  test("language", () => {
    expect(ids({ ...NO_FILTERS, language: ["english"] })).toEqual(["1", "3"])
    expect(ids({ ...NO_FILTERS, language: ["dutch"] })).toEqual(["2", "4"])
    expect(ids({ ...NO_FILTERS, language: ["english", "dutch"] })).toEqual(["1", "2", "3", "4"])
    expect(ids({ ...NO_FILTERS, language: [] })).toEqual(["1", "2", "3", "4"])
  })
  test("recognised sponsors only", () => {
    expect(ids({ ...NO_FILTERS, sponsorOnly: true })).toEqual(["1", "2"])
  })
  test("filters combine", () => {
    expect(ids({ ...NO_FILTERS, industry: ["Software & internet"], language: ["english"] })).toEqual(["3"])
    expect(ids({ ...NO_FILTERS, industry: ["Software & internet"], language: ["english"], sponsorOnly: true })).toEqual([])
  })
  test("activeCount counts what is set", () => {
    expect(activeCount(NO_FILTERS)).toBe(0)
    expect(activeCount({ ...NO_FILTERS, industry: ["Software & internet"], level: ["Senior"], language: ["dutch"], sponsorOnly: true })).toBe(4)
  })
})

describe("levelOf agrees with the titles used above", () => {
  test("each", () => {
    expect(POOL.map(levelOf)).toEqual(["Internship", "Senior", "Entry", "Director"])
  })
})

describe("payOf", () => {
  test("a yearly figure is shown per month", () => {
    expect(payOf(job({ pay_posted: "€ 61,200 – € 91,800" }), null).text).toBe("€5.100 – €7.650")
  })
  test("one stated monthly figure is shown exactly", () => {
    expect(payOf(job({ pay_posted: "€1016 per month" }), null).text).toBe("€1.016")
  })
  test("a monthly figure is written the same way", () => {
    expect(payOf(job({ pay_posted: "€ 3.891 - € 5.188" }), null).text).toBe("€3.890 – €5.190")
  })
  test("a range wider than three times its low end is ignored", () => {
    expect(payOf(job({ pay_posted: "€ 50.000 tot € 500.000" }), null).basis).toBe("Not known")
    const intern = payOf(job({ title: "Marketing Internship", pay_posted: null }), null)
    expect(intern.basis).toBe("Allowance")
    expect(intern.text).toMatch(/^€\d/)
    expect(intern.text).not.toBe(payOf(job({ title: "Marketing Analyst", pay_posted: null }), null).text)
    expect(payOf(job({ title: "Marketing Internship", pay_posted: "€ 600" }), null).basis).toBe("Stated")
    expect(payOf(job({ title: "Graduate Trainee Programme", pay_posted: null }), null).basis).not.toBe("Allowance")
  })
})

describe("search and the LinkedIn-style filters", () => {
  const none: Signals = { hybrid: false, remote: false, partTime: false, fullTime: false, contract: false }
  const signals: Record<string, Signals> = { "1": { ...none, hybrid: true, fullTime: true }, "2": { ...none, remote: true }, "3": { ...none, partTime: true }, "4": none }

  test("search needs every word, in the title or the company", () => {
    expect(ids({ ...NO_FILTERS, query: "analyst" })).toEqual(["3"])
    expect(ids({ ...NO_FILTERS, query: "banking internship" })).toEqual(["1"])
    expect(ids({ ...NO_FILTERS, query: "nothing like this" })).toEqual([])
  })
  test("date posted keeps what is recent enough", () => {
    const fresh = [job({ id: "a", days_open: 0 }), job({ id: "b", days_open: 5 }), job({ id: "c", days_open: 20 }), job({ id: "d", days_open: null })]
    expect(applyFilters(fresh, { ...NO_FILTERS, posted: "day" }).map((p) => p.id)).toEqual(["a"])
    expect(applyFilters(fresh, { ...NO_FILTERS, posted: "week" }).map((p) => p.id)).toEqual(["a", "b"])
    expect(applyFilters(fresh, { ...NO_FILTERS, posted: "month" }).map((p) => p.id)).toEqual(["a", "b", "c"])
  })
  test("job type and workplace come from the text signals", () => {
    const env = { signals }
    expect(applyFilters(POOL, { ...NO_FILTERS, type: ["Part-time"] }, env).map((p) => p.id)).toEqual(["3"])
    expect(applyFilters(POOL, { ...NO_FILTERS, workplace: ["Hybrid"] }, env).map((p) => p.id)).toEqual(["1"])
    expect(applyFilters(POOL, { ...NO_FILTERS, workplace: ["Remote"] }, env).map((p) => p.id)).toEqual(["2"])
    expect(applyFilters(POOL, { ...NO_FILTERS, workplace: ["On-site"] }, env).map((p) => p.id)).toEqual(["3", "4"])
  })
  test("location keeps one town", () => {
    const towns = [job({ id: "a", region: "Amsterdam" }), job({ id: "b", region: "Utrecht, Netherlands" })]
    expect(applyFilters(towns, { ...NO_FILTERS, city: ["Utrecht"] }).map((p) => p.id)).toEqual(["b"])
  })
  test("activeCount counts the new filters too", () => {
    expect(activeCount({ ...NO_FILTERS, query: "x", posted: "week", type: ["Full-time"], workplace: ["Remote"], city: ["Utrecht"], minPay: 4000 })).toBe(6)
  })
})

describe("level", () => {
  test("starting out keeps internships and entry-level, drops senior and managing roles", () => {
    expect(applyFilters(POOL, { ...NO_FILTERS, level: [...STARTING_LEVELS] }).map((p) => p.id)).toEqual(["1", "3"])
  })
  test("a level picked wins over starting out, and no level keeps everything", () => {
    expect(applyFilters(POOL, { ...NO_FILTERS, level: ["Senior"] }).map((p) => p.id)).toEqual(["2"])
    expect(applyFilters(POOL, NO_FILTERS).map((p) => p.id)).toEqual(["1", "2", "3", "4"])
  })
  test("the starting level is the default, not a filter someone set", () => {
    expect(activeCount(DEFAULT_FILTERS)).toBe(0)
    expect(activeCount({ ...DEFAULT_FILTERS, level: ["Senior"] })).toBe(1)
    expect(activeCount({ ...DEFAULT_FILTERS, posted: "week" })).toBe(1)
    // The page opens on any time, so its list is exactly the database view active_internship_entry. A shorter window is a filter someone set.
    expect(DEFAULT_FILTERS.posted).toBe("any")
    expect(activeCount({ ...DEFAULT_FILTERS, posted: "month" })).toBe(1)
  })
})

describe("choosing several values", () => {
  const none: Signals = { hybrid: false, remote: false, partTime: false, fullTime: false, contract: false }
  const env = { signals: { "1": { ...none, hybrid: true, fullTime: true }, "2": { ...none, remote: true }, "3": { ...none, partTime: true }, "4": none } as Record<string, Signals> }
  const ids2 = (f: Partial<typeof NO_FILTERS>) => applyFilters(POOL, { ...NO_FILTERS, ...f }, env).map((p) => p.id)

  test("several industries show jobs in any of them", () => {
    expect(ids2({ industry: ["Software & internet", "Banking"] })).toEqual(["1", "2", "3"])
    expect(ids2({ industry: ["Software & internet", "Banking", "Accounting"] })).toEqual(["1", "2", "3", "4"])
  })
  test("one more choice never removes a job from the list", () => {
    const one = ids2({ industry: ["Banking"] })
    const two = ids2({ industry: ["Banking", "Accounting"] })
    for (const id of one) expect(two).toContain(id)
    expect(two.length).toBeGreaterThanOrEqual(one.length)
  })
  test("several levels", () => {
    expect(ids2({ level: ["Internship", "Senior"] })).toEqual(["1", "2"])
    expect(ids2({ level: ["Internship", "Entry", "Senior", "Director"] })).toEqual(["1", "2", "3", "4"])
  })
  test("several workplaces", () => {
    expect(ids2({ workplace: ["Hybrid", "Remote"] })).toEqual(["1", "2"])
    expect(ids2({ workplace: ["Hybrid", "On-site"] })).toEqual(["1", "3", "4"])
  })
  test("several job types match a job that has any of them", () => {
    expect(ids2({ type: ["Part-time", "Contract"] }).includes("3")).toBe(true)
  })
  test("different filters still all have to hold: choices inside one filter widen it, filters together narrow it", () => {
    expect(ids2({ industry: ["Software & internet", "Banking"], level: ["Internship", "Senior"] })).toEqual(["1", "2"])
    expect(ids2({ industry: ["Software & internet", "Banking"], level: ["Entry"] })).toEqual(["3"])
    expect(ids2({ industry: ["Banking"], level: ["Senior"] })).toEqual([])
  })
  test("an empty list is any", () => {
    expect(ids2({ industry: [], level: [], type: [], workplace: [], city: [], source: [] })).toEqual(["1", "2", "3", "4"])
  })
  test("a value nobody has gives nothing, not everything", () => {
    expect(ids2({ industry: ["Aerospace" as never] })).toEqual([])
  })
  test("several towns", () => {
    const towns = [
      { ...POOL[0], id: "a", region: "Amsterdam, NL" }, { ...POOL[0], id: "b", region: "Utrecht, NL" }, { ...POOL[0], id: "c", region: "Rotterdam, NL" },
    ]
    expect(applyFilters(towns, { ...NO_FILTERS, city: ["Utrecht", "Amsterdam"] }).map((p) => p.id)).toEqual(["a", "b"])
  })
  test("a job found on two sites matches either site", () => {
    const two = [{ ...POOL[0], id: "x", sources: [{ name: "LinkedIn", url: null, ats: "linkedin" }, { name: "Magnet.me", url: null, ats: "magnet.me" }] }, { ...POOL[0], id: "y", sources: [{ name: "Indeed", url: null, ats: "indeed" }] }] as never
    expect(applyFilters(two, { ...NO_FILTERS, source: ["Magnet.me", "Glassdoor"] }).map((p: { id: string }) => p.id)).toEqual(["x"])
    expect(applyFilters(two, { ...NO_FILTERS, source: ["Magnet.me", "Indeed"] }).map((p: { id: string }) => p.id)).toEqual(["x", "y"])
  })
  test("the count counts a filter once however many values it holds, and the starting level is not a choice", () => {
    expect(activeCount({ ...DEFAULT_FILTERS, industry: ["Banking", "Accounting", "Insurance"] })).toBe(1)
    expect(DEFAULT_FILTERS.language).toEqual(["english"])
    expect(activeCount({ ...DEFAULT_FILTERS, language: [] })).toBe(0)
    expect(activeCount({ ...DEFAULT_FILTERS, language: ["english", "dutch"] })).toBe(0)
    expect(activeCount({ ...DEFAULT_FILTERS, language: ["dutch"] })).toBe(1)
    expect(activeCount({ ...DEFAULT_FILTERS, industry: ["Banking"], level: ["Mid", "Senior"] })).toBe(2)
    expect(activeCount({ ...DEFAULT_FILTERS, level: ["Entry", "Internship"] })).toBe(0)
    expect(isStartingLevel(["Entry", "Internship"])).toBe(true)
    expect(isStartingLevel(["Entry"])).toBe(false)
    expect(isStartingLevel([])).toBe(false)
  })
})

describe("normalizeFilters", () => {
  test("filters saved with a single value or null are read into lists", () => {
    const old = { query: "", industry: "Banking", level: "Senior", language: "english", sponsorOnly: true, posted: "week", type: null, workplace: "Remote", city: "Utrecht", minPay: 4000, source: "LinkedIn" }
    expect(normalizeFilters(old)).toEqual({ ...NO_FILTERS, industry: ["Banking"], level: ["Senior"], language: ["english"], sponsorOnly: true, posted: "week", workplace: ["Remote"], city: ["Utrecht"], minPay: 4000, source: ["LinkedIn"] })
  })
  test("the old 'Starting out' level becomes internship and entry", () => {
    expect(normalizeFilters({ level: "Starting out" }).level).toEqual(["Internship", "Entry"])
  })
  test("the old null for any stays any", () => {
    const n = normalizeFilters({ industry: null, level: null, type: null, workplace: null, city: null, source: null })
    expect(n.industry).toEqual([]); expect(n.level).toEqual([]); expect(n.city).toEqual([])
  })
  test("current filters pass through unchanged", () => {
    const f = { ...DEFAULT_FILTERS, industry: ["Banking", "Insurance"] as never, city: ["Utrecht", "Amsterdam"] }
    expect(normalizeFilters(f)).toEqual(f)
  })
  test("garbage never throws and never narrows the list", () => {
    for (const bad of [null, undefined, 5, "x", [], {}, { level: 7 }, { industry: [1, null, {}] }, { posted: "yesterday" }, { minPay: "lots" }, { level: ["Wizard"] }]) {
      const n = normalizeFilters(bad)
      expect(n.industry.every((x) => typeof x === "string")).toBe(true)
      expect(n.level.every((x) => typeof x === "string")).toBe(true)
      expect(["any", "day", "week", "month"]).toContain(n.posted)
      expect(n.minPay === null || Number.isFinite(n.minPay)).toBe(true)
    }
    expect(normalizeFilters({ level: ["Wizard"] }).level).toEqual([])
    expect(normalizeFilters({ posted: "yesterday" }).posted).toBe(DEFAULT_FILTERS.posted)
  })
  test("a saved preference round-trips through JSON", () => {
    const f = { ...DEFAULT_FILTERS, industry: ["Banking"] as never }
    expect(normalizeFilters(JSON.parse(JSON.stringify(f)))).toEqual(f)
  })
})

describe("fieldOf cache", () => {
  test("a posting given a new title and skills in place is guessed again", () => {
    const post = job({ title: "Backend Software Engineer", skills: ["python"] })
    const before = fieldOf(post)
    expect(before).toBe(guessFamily("Backend Software Engineer", ["python"]))
    post.title = "Financial Accountant"
    post.skills = ["ifrs"]
    expect(fieldOf(post)).toBe(guessFamily("Financial Accountant", ["ifrs"]))
    expect(fieldOf(post)).not.toBe(before)
  })
  test("Jev's reading wins over a cached guess", () => {
    const post = job({ title: "Backend Software Engineer" })
    fieldOf(post)
    post.family = "Marketing and communications"
    expect(fieldOf(post)).toBe("Marketing and communications")
  })
})
