import { describe, expect, test } from "bun:test"
import { ladderStats } from "@/lib/ladder"
import type { Posting } from "@/lib/types"

const post = (family: string, level: string, years: number | null, id: string): Posting =>
  ({ id, title: `${level} ${family}`, family, cat: "tech", level_view: level, years_min: years, skills: [] }) as unknown as Posting

describe("ladderStats", () => {
  const field = (family: string, n: number, level: string, years: number): Posting[] => Array.from({ length: n }, (_, i) => post(family, level, years, `${family}-${level}-${i}`))
  const all = [...field("A", 5, "Entry", 1), ...field("B", 14, "Entry", 3), ...field("C", 2, "Entry", 2)]

  test("a field with its own postings uses them, pulled slightly towards the category", () => {
    const entry = ladderStats(all, all[0]).find((r) => r.level === "Entry")
    expect(entry?.wider).toBe(false)
    expect(entry?.years).toBeGreaterThan(1)
    expect(entry?.years).toBeLessThan(2.2)
    expect(entry?.sample).toBe(5)
  })

  test("a field with too few postings falls back to the category and says so", () => {
    const entry = ladderStats(all, all.find((p) => p.family === "C")).find((r) => r.level === "Entry")
    expect(entry?.wider).toBe(true)
    expect(entry?.sample).toBe(21)
  })

  test("two fields get different answers", () => {
    const a = ladderStats(all, all[0]).find((r) => r.level === "Entry")?.years
    const b = ladderStats(all, all.find((p) => p.family === "B")).find((r) => r.level === "Entry")?.years
    expect(a).not.toBe(b)
  })
})
