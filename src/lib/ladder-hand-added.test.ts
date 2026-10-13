import { describe, expect, test } from "bun:test"
import { ladderStats, poolOf } from "@/lib/ladder"
import type { Posting } from "@/lib/types"

const post = (over: Partial<Posting>): Posting => ({ id: "x", title: "Analyst", employer: "A", employer_display: "A", cat: "other", family: null, level_view: "Entry", skills: [], ...over }) as unknown as Posting

describe("the career path of a job added by hand (no line of work, no kind)", () => {
  const pool = [post({ id: "1", family: "Finance & accounting", level_view: "Entry" }), post({ id: "2", family: "Finance & accounting", level_view: "Mid" }), post({ id: "3", family: "Finance & accounting", level_view: "Senior" })]

  test("is read from the line of work its title names", () => {
    const hand = post({ title: "Finance & Controlling Internship", level_view: "Internship", cat: "other" })
    expect(poolOf(pool, hand).name).toBe("Finance & accounting")
    expect(ladderStats(pool, hand).filter((s) => s.open > 0).length).toBeGreaterThan(0)
  })

  test("falls back to every posting when nothing else matches, never to an empty path", () => {
    const hand = post({ title: "Intern", level_view: "Internship", cat: "nonexistent" as never })
    expect(poolOf(pool, hand).posts.length).toBe(pool.length)
    expect(ladderStats(pool, hand).filter((s) => s.open > 0).length).toBeGreaterThan(0)
  })
})
