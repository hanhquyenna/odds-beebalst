import { describe, expect, test } from "bun:test"
import { confidenceOf } from "@/lib/confidence"
import type { Standing } from "@/lib/engine"

const st = (over: Partial<Standing> = {}): Standing =>
  ({ gates: [], failing: 0, checklist: [], have: 0, total: 0, band: null, needsProfile: false, fit: { score: 0.5, parts: [1, 2, 3, 4, 5].map((i) => ({ key: "skills", label: String(i), value: 0.5, detail: "" })) }, rate: { low: 0.02, mid: 0.03, high: 0.045, lines: [], thin: false }, ...over }) as unknown as Standing

describe("how much we had to go on", () => {
  test("a full profile, a posting that lists skills and a tight range is High", () => {
    const c = confidenceOf(st(), { skills: ["sql", "python", "excel"] })!
    expect(c.level).toBe("High")
    expect(c.score).toBeGreaterThanOrEqual(75)
  })
  test("little read from the profile, no skills listed and a wide range is Low", () => {
    const c = confidenceOf(st({ fit: { score: 0.4, parts: [{ key: "level", label: "level", value: 0.4, detail: "" }] }, rate: { low: 0.01, mid: 0.03, high: 0.06, lines: [], thin: true } }), { skills: [] })!
    expect(c.level).toBe("Low")
  })
  test("nothing on the profile gives no confidence figure, not a made-up one", () => {
    expect(confidenceOf(st({ needsProfile: true }), { skills: ["sql"] })).toBeNull()
    expect(confidenceOf(st({ rate: null }), { skills: ["sql"] })).toBeNull()
  })
  test("each part says what was found", () => {
    const c = confidenceOf(st(), { skills: ["sql"] })!
    expect(c.parts.map((p) => p.label)).toEqual(["Benchmark", "Your profile", "The posting", "The range"])
    expect(c.parts[2].line).toContain("1 skill")
  })
})

describe("a thin profile lowers it", () => {
  const full = { positions: [{}, {}, {}], skills: Array.from({ length: 12 }, () => ({})), education: [{}] } as never
  const thin = { positions: [], skills: [], education: [] } as never
  test("the same job and fit read less certain on a profile with almost nothing on it", () => {
    const a = confidenceOf(st(), { skills: ["sql", "python", "excel"] }, full)!
    const b = confidenceOf(st(), { skills: ["sql", "python", "excel"] }, thin)!
    expect(b.score).toBeLessThan(a.score)
    expect(b.level).not.toBe("High")
    expect(a.level).toBe("High")
  })
})
