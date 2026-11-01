import { describe, expect, test } from "bun:test"
import { describeFilled } from "@/lib/cv-parse"
import { skillLabel } from "@/lib/skills"

describe("skillLabel", () => {
  test("known names keep their own casing, others get a capital", () => {
    expect(skillLabel("power bi")).toBe("Power BI")
    expect(skillLabel("sql")).toBe("SQL")
    expect(skillLabel("financial modelling")).toBe("Financial modelling")
  })
})

describe("describeFilled", () => {
  const f = { roles: 1, degrees: 2, skills: 5 }
  test("says where to check the rows", () => {
    expect(describeFilled(f, false)).toContain("Check them above")
    expect(describeFilled(f, false, "later")).not.toContain("above")
    expect(describeFilled({ roles: 0, degrees: 0, skills: 0 }, false, "later")).toContain("in your profile")
  })
})
