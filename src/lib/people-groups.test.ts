import { describe, expect, it } from "bun:test"
import { groupOf, moreIn, openIn, revealIn, startGroups, type Suggestion } from "@/lib/suggest"

const p = (name: string, headline: string): Suggestion => ({ name, headline, place: "", url: `https://www.linkedin.com/in/${name}` })
const pool = [p("a", "Financial Analyst"), p("b", "Finance Manager"), p("c", "Marketing Specialist"), p("d", "Junior Controller"), p("e", "Head of Finance")]

describe("people groups for a job", () => {
  it("groups department leads separately without claiming they are hiring managers", () => {
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

it("does not classify seniority, another department, or missing affiliation as a hiring relationship", () => {
  expect(groupOf(p("senior", "Senior Financial Analyst"), "Finance & accounting")).toBe("team")
  expect(groupOf(p("sales", "Sales Manager"), "Finance & accounting")).toBe("other")
  expect(groupOf(p("unknown", "Finance Lead"), null)).toBe("other")
  expect(groupOf({ ...p("unverified", "Finance Lead"), currentEmployerMatched: false }, "Finance & accounting")).toBe("other")
})
