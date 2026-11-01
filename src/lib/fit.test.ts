import { describe, expect, test } from "bun:test"
import { FIT_AVERAGE, FIT_WEIGHTS_FIELD, SKILL_PRIOR, fitOf, levelFromYears } from "@/lib/fit"

const base = { title: "Financial Analyst", level: "Entry", years: 1, wanted: [{ name: "excel", tier: "must" as const }, { name: "sql", tier: "must" as const }], have: (s: string) => s === "excel", text: "financial analyst excel ifrs msc finance" }

describe("fitOf", () => {
  test("judges skills, role and level, each 0 to 1", () => {
    const fit = fitOf(base)!
    expect(fit.parts.map((p) => p.key)).toEqual(["skills", "role", "level"])
    expect(fit.parts[0].value).toBeCloseTo((1 + FIT_AVERAGE * SKILL_PRIOR) / (2 + SKILL_PRIOR), 10)
    expect(fit.parts[1].value).toBe(1)
  })
  test("the right level is no achievement: it earns an average applicant's score, and only a mismatch counts against", () => {
    const level = (job: string, years: number): number => fitOf({ ...base, level: job, years })!.parts.find((p) => p.key === "level")!.value
    expect(level("Entry", 1)).toBe(FIT_AVERAGE)
    expect(level("Mid", 1)).toBe(FIT_AVERAGE / 2)
    expect(level("Senior", 1)).toBe(0)
  })
  test("a title word found in every line of work counts for little, one found in a single line counts for more", () => {
    const specificity = (w: string): number => (w === "equiti" || w === "equity" ? 1 : 0.1)
    const only = (text: string): number => fitOf({ ...base, title: "Growth Equity", text, specificity, wanted: [] })!.parts.find((p) => p.key === "role")!.value
    expect(only("growth marketing lead")).toBeCloseTo(0.1 / 1.1, 5)
    expect(only("private equity associate")).toBeCloseTo(1 / 1.1, 5)
    expect(only("growth equity")).toBe(1)
  })
  test("the kept words of the last text never answer for a new text", () => {
    const role = (text: string): number => fitOf({ ...base, text: text })!.parts.find((p) => p.key === "role")!.value
    expect(role("financial analyst")).toBe(1)
    expect(role("nurse")).toBe(0)
    expect(role("financial analyst")).toBe(1)
  })
  test("missing a must-have costs more than missing a nice-to-have", () => {
    const wanted = (tier: "must" | "nice") => [{ name: "excel", tier: "must" as const }, { name: "sql", tier }]
    const missMust = fitOf({ ...base, wanted: wanted("must"), have: (s) => s === "excel" })!
    const missNice = fitOf({ ...base, wanted: wanted("nice"), have: (s) => s === "excel" })!
    expect(missNice.parts[0].value).toBeGreaterThan(missMust.parts[0].value)
    expect(missNice.parts[0].detail).toContain("1 of 1 must-have")
    expect(missNice.parts[0].detail).toContain("0 of 1 nice to have")
  })
  test("a better CV scores higher than a worse one on the same job", () => {
    const good = fitOf({ ...base, have: () => true })!
    const bad = fitOf({ ...base, have: () => false, text: "barista" , years: 12 })!
    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.score).toBeGreaterThan(FIT_AVERAGE)
    expect(bad.score).toBeLessThan(FIT_AVERAGE)
  })
  test("a fit judged on one part only stays near average", () => {
    const only = fitOf({ title: "Graduate Trainee Programme", level: "Entry", years: 1, wanted: [], have: () => false, text: "" })!
    expect(only.parts.map((p) => p.key)).toEqual(["level"])
    expect(Math.abs(only.score - FIT_AVERAGE)).toBeLessThan(0.15)
  })
  test("nothing to compare gives null", () => {
    expect(fitOf({ title: "Graduate Programme", level: "Not stated", years: 1, wanted: [], have: () => false, text: "" })).toBeNull()
  })
  test("years point to a level", () => {
    expect([0, 1.9, 2, 4.9, 5, 8.9, 9].map(levelFromYears)).toEqual([1, 1, 2, 2, 3, 3, 4])
  })
})

describe("evidence-weighted skills", () => {
  test("one listed skill that the CV has is not a perfect match", () => {
    const one = fitOf({ ...base, wanted: [{ name: "excel", tier: "must" }], have: () => true })!
    expect(one.parts[0].value).toBeLessThan(0.7)
    expect(one.parts[0].value).toBeGreaterThan(FIT_AVERAGE)
  })
  test("more listed skills met give a higher score than fewer met, up to the ends", () => {
    const wanted = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `s${i}`, tier: "must" as const }))
    const all = (n: number) => fitOf({ ...base, wanted: wanted(n), have: () => true })!.parts[0].value
    expect(all(8)).toBeGreaterThan(all(1))
    expect(all(8)).toBeLessThan(1)
    const none = fitOf({ ...base, wanted: wanted(8), have: () => false })!.parts[0].value
    expect(none).toBeGreaterThan(0)
    expect(none).toBeLessThan(FIT_AVERAGE)
  })
})

describe("field", () => {
  test("the weights add up to one", () => {
    expect(Object.values(FIT_WEIGHTS_FIELD).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })
  test("the same CV scores higher on a job in its own line of work than in another", () => {
    const inField = fitOf({ ...base, field: 0.9 })!.score
    const outField = fitOf({ ...base, field: 0.02 })!.score
    expect(inField).toBeGreaterThan(outField)
    expect(inField - outField).toBeGreaterThan(0.15)
  })
  test("without a field the fit is the three parts as before", () => {
    expect(fitOf({ ...base, field: null })!.parts.map((p) => p.key)).toEqual(["skills", "role", "level"])
    expect(fitOf({ ...base, field: 0.5 })!.parts.map((p) => p.key)).toEqual(["skills", "field", "role", "level"])
  })
  test("consistency is judged next to the field, and a scattered history scores lower than a focused one on the same field match", () => {
    expect(fitOf({ ...base, field: 0.5, consistency: 0.4 })!.parts.map((p) => p.key)).toEqual(["skills", "field", "role", "consistency", "level"])
    const focused = fitOf({ ...base, field: 0.5, consistency: 0.8 })!.score
    const scattered = fitOf({ ...base, field: 0.5, consistency: 0.1 })!.score
    expect(focused).toBeGreaterThan(scattered)
    expect(fitOf({ ...base, field: null, consistency: 0.8 })!.parts.map((p) => p.key)).not.toContain("consistency")
  })
  test("the consistency part says in words how focused the history is", () => {
    const say = (c: number): string => fitOf({ ...base, field: 0.5, consistency: c })!.parts.find((p) => p.key === "consistency")!.detail
    expect(say(0.7)).toContain("focused")
    expect(say(0.3)).toContain("part of your history")
    expect(say(0.05)).toContain("spread over other lines")
  })
  test("the field part says in words how far the job is from the CV", () => {
    expect(fitOf({ ...base, field: 0.8 })!.parts[1].detail).toContain("point to this line of work")
    expect(fitOf({ ...base, field: 0.3 })!.parts[1].detail).toContain("partly")
    expect(fitOf({ ...base, field: 0.01 })!.parts[1].detail).toContain("different line of work")
  })
})
