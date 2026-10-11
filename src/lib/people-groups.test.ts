import { describe, expect, it } from "bun:test"
import { groupOf, moreIn, openIn, revealIn, startGroups, type Suggestion } from "@/lib/suggest"

const p = (name: string, headline: string): Suggestion => ({ name, headline, place: "", url: `https://www.linkedin.com/in/${name}` })
const pool = [p("a", "Financial Analyst"), p("b", "Finance Manager"), p("c", "Marketing Specialist"), p("d", "Junior Controller"), p("e", "Head of Finance")]

describe("people groups for a job", () => {
  it("puts managers and heads under hiring managers, the job's department under same team, the rest under other", () => {
    expect(groupOf(pool[0], "Finance & accounting")).toBe("team")
    expect(groupOf(pool[1], "Finance & accounting")).toBe("manager")
    expect(groupOf(pool[4], "Finance & accounting")).toBe("manager")
    expect(groupOf(pool[2], "Finance & accounting")).toBe("other")
  })

  it("starts with one person in each group, and + hands out one more of that group only", () => {
    let rec = startGroups(pool, "Finance & accounting")!
    expect(openIn(rec, "team", "Finance & accounting").map((x) => x.name)).toEqual(["a"])
    expect(openIn(rec, "manager", "Finance & accounting").map((x) => x.name)).toEqual(["b"])
    expect(openIn(rec, "other", "Finance & accounting").map((x) => x.name)).toEqual(["c"])
    expect(moreIn(rec, "other", "Finance & accounting")).toBe(false)
    rec = revealIn(rec, "team", "Finance & accounting")
    expect(openIn(rec, "team", "Finance & accounting").map((x) => x.name)).toEqual(["a", "d"])
    expect(openIn(rec, "manager", "Finance & accounting")).toHaveLength(1)
    expect(moreIn(rec, "team", "Finance & accounting")).toBe(false)
  })
})
