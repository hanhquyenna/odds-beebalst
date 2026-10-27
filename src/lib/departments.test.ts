import { describe, expect, test } from "bun:test"
import { adjacentDepartments, adjacentTitles } from "../../supabase/functions/_shared/departments"

describe("neighbouring departments for the people search", () => {
  test("engineering reaches operations and project work, software too", () => {
    const n = adjacentDepartments("Hardware & engineering")
    expect(n).toContain("Operations & supply chain")
    expect(n).toContain("Software engineering")
    expect(n).not.toContain("Hardware & engineering")
  })
  test("no department, no neighbours; titles stay within the search limit", () => {
    expect(adjacentDepartments(null)).toEqual([])
    expect(adjacentTitles("Finance & accounting").titles.length).toBeLessThanOrEqual(12)
    expect(adjacentTitles("Finance & accounting").departments[0]).toBe("Risk, compliance & legal")
  })
})
