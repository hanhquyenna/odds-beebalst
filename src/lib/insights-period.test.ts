import { expect, test } from "bun:test"
import { insightsPeriod } from "./insights-period"
test("calendar periods have exact Monday boundaries and exclude future dates", () => {
  const now = new Date(2026, 9, 15, 10)
  const current = insightsPeriod("this_week", now)
  expect(current.dates).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"])
  expect(current.includes("2026-10-16")).toBe(false)
  const last = insightsPeriod("last_week", now)
  expect(last.dates[0]).toBe("2026-10-05")
  expect(last.dates.at(-1)).toBe("2026-10-11")
  expect(last.includes("2026-10-12")).toBe(false)
  expect(last.includes("not a date")).toBe(false)
  const fortnight = insightsPeriod("two_weeks", now)
  expect(fortnight.dates).toHaveLength(14)
  expect(fortnight.dates[0]).toBe("2026-10-02")
})
test("a Monday still has one drawable point and last week has seven days", () => {
  const monday = new Date(2026, 9, 12)
  expect(insightsPeriod("this_week", monday).dates).toHaveLength(1)
  expect(insightsPeriod("last_week", monday).dates).toHaveLength(7)
  expect(insightsPeriod("eight_weeks", monday).dates).toHaveLength(56)
})
