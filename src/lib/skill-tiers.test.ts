import { describe, expect, test } from "bun:test"
import { skillTiersFor, withSkillTiers } from "@/lib/skill-tiers"
import type { Posting } from "@/lib/types"

describe("skillTiersFor", () => {
  const lines = [
    { text: "3+ years of experience with SQL", tier: "must" },
    { text: "Experience with Tableau is a plus", tier: "optional" },
    { text: "Familiarity with Python", tier: "nice" },
  ]
  test("each skill carries the tier of the line that names it", () => {
    expect(skillTiersFor("body", lines)).toEqual({ sql: "must", tableau: "optional", python: "nice" })
  })
  test("a skill named twice keeps the strongest tier", () => {
    expect(skillTiersFor("body", [...lines, { text: "Python is required", tier: "must" }]).python).toBe("must")
  })
  test("requirement lines that name no skill give no skills, not the whole text's skills", () => {
    expect(skillTiersFor("We use Python and SQL every day", [{ text: "A relevant master's degree and good communication", tier: "must" }])).toEqual({})
  })
  test("with no Jev lines the text decides: skills come from the text, tiers from its headings", () => {
    const t = skillTiersFor("Requirements:\n- Experience with SQL and Excel in finance reporting\n\nNice to have:\n- Knowledge of Tableau dashboards for management", null)
    expect(t.sql).toBe("must")
    expect(t.tableau).toBe("nice")
  })
  test("garbage lines are ignored, and an empty reading falls back to the text", () => {
    expect(skillTiersFor("Requirements:\n- Experience with SQL databases is needed", [{ text: "x", tier: "banana" }, { text: "y", tier: "" }])).toEqual(skillTiersFor("Requirements:\n- Experience with SQL databases is needed", null))
  })
  test("the same inputs give the same result", () => {
    expect(skillTiersFor("body", lines)).toEqual(skillTiersFor("body", [...lines]))
  })
})

describe("withSkillTiers", () => {
  const post = { id: "p", skills: ["old"], title: "t" } as unknown as Posting
  test("stored tiers become the posting's skills and tiers", () => {
    const p = withSkillTiers({ ...post, skill_tiers: { sql: "must", excel: null, tableau: "nice" } })
    expect(p.skills).toEqual(["sql", "excel", "tableau"])
    expect(p.tiers).toEqual({ sql: "must", tableau: "nice" })
  })
  test("an empty object means no skills are compared", () => {
    expect(withSkillTiers({ ...post, skill_tiers: {} }).skills).toEqual([])
  })
  test("nothing stored leaves the posting as it was", () => {
    const a = { ...post, skill_tiers: null }
    const b = { ...post }
    expect(withSkillTiers(a)).toBe(a)
    expect(withSkillTiers(b)).toBe(b)
    expect(withSkillTiers(a).skills).toEqual(["old"])
  })
})
