import { describe, expect, test } from "bun:test"
import { appliedDay, followUpFor, followUpText, overrideOf, parseFollow } from "@/lib/cells"

const NOW = new Date(2026, 9, 14, 12, 0)
const app = { logged_at: "2026-10-04", stage: "applied" as const }

describe("follow-up text", () => {
  test("reads days and dates", () => {
    expect(parseFollow("7 days")).toEqual({ days: 7 })
    expect(parseFollow("3d")).toEqual({ days: 3 })
    expect(parseFollow("10")).toEqual({ days: 10 })
    expect(parseFollow("15/11/2026")).toEqual({ on: "2026-11-15" })
    expect(parseFollow("call Sanne")).toBeNull()
    expect(parseFollow("")).toBeNull()
  })
  test("an applied job shows 7 days unless you typed something", () => {
    expect(followUpText(app, "")).toBe("7 days")
    expect(followUpText(app, "2 days")).toBe("2 days")
    expect(followUpText({ stage: "interview" }, "")).toBe("")
  })
  test("days count from the day applied, and are due when reached", () => {
    expect(followUpFor(app, "", "2026-10-04", NOW)).toEqual({ on: "2026-10-11", inDays: -3, due: true })
    expect(followUpFor(app, "14 days", "2026-10-04", NOW)).toEqual({ on: "2026-10-18", inDays: 4, due: false })
  })
  test("a date is that date; days need a waiting application; unreadable text gives none", () => {
    expect(followUpFor(undefined, "2026-10-20", null, NOW)?.on).toBe("2026-10-20")
    expect(followUpFor({ ...app, stage: "interview" as never }, "7 days", "2026-10-04", NOW)).toBeNull()
    expect(followUpFor(app, "call Sanne", "2026-10-04", NOW)).toBeNull()
  })
})

describe("overrides", () => {
  test("applied day: typed date wins over the log", () => {
    expect(appliedDay(app, "2026-10-06")).toBe("2026-10-06")
    expect(appliedDay(app, "")).toBe("2026-10-04")
  })
  test("read from the notes by @key", () => {
    expect(overrideOf({ a: { "@pay": "€3.000" } }, "a", "pay")).toBe("€3.000")
    expect(overrideOf({}, "a", "pay")).toBe("")
  })
})
