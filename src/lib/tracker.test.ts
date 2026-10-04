import { describe, expect, test } from "bun:test"
import { FOLLOW_UP_DAYS, NO_TRACKER_FILTER, applyTrackerFilter, appliedOn, byDay, followUpOf, followUpText, isTrackerFilterOn, monthGrid, normalizeTrackerFilter, todayIso } from "@/lib/tracker"

const NOW = new Date(2026, 9, 14, 12, 0) // 14 Oct 2026

describe("followUpOf", () => {
  test("a week after applying, only while it is still waiting", () => {
    expect(FOLLOW_UP_DAYS).toBe(7)
    const f = followUpOf({ logged_at: "2026-10-10", stage: "applied" }, NOW)!
    expect(f.on).toBe("2026-10-17")
    expect(f.inDays).toBe(3)
    expect(f.due).toBe(false)
    expect(followUpText(f)).toBe("In 3 days")
  })
  test("due today and overdue", () => {
    expect(followUpText(followUpOf({ logged_at: "2026-10-07", stage: "applied" }, NOW)!)).toBe("Due today")
    const late = followUpOf({ logged_at: "2026-10-01", stage: "applied" }, NOW)!
    expect(late.due).toBe(true)
    expect(followUpText(late)).toBe("Overdue by 6 days")
    expect(followUpText({ on: "x", inDays: -1, due: true })).toBe("Overdue by 1 day")
    expect(followUpText({ on: "x", inDays: 1, due: false })).toBe("In 1 day")
  })
  test("none once it has moved on, ended, or was never applied to", () => {
    for (const stage of ["interview", "offer", "hired", "rejected", "no_reply", "withdrawn"] as const) {
      expect(followUpOf({ logged_at: "2026-10-01", stage }, NOW)).toBeNull()
    }
    expect(followUpOf(undefined, NOW)).toBeNull()
    expect(followUpOf({ logged_at: "not a date", stage: "applied" }, NOW)).toBeNull()
  })
})

describe("applyTrackerFilter", () => {
  const rows = [
    { id: "a", step: "applied", closed_at: null, app: { logged_at: "2026-10-01", stage: "applied" as const } },
    { id: "b", step: "applied", closed_at: null, app: { logged_at: "2026-10-12", stage: "applied" as const } },
    { id: "c", step: "saved", closed_at: "2026-10-02", app: undefined },
    { id: "d", step: "interview", closed_at: null, app: { logged_at: "2026-10-01", stage: "interview" as const } },
  ]
  const run = (f: Partial<typeof NO_TRACKER_FILTER>): string[] => applyTrackerFilter(rows, { ...NO_TRACKER_FILTER, ...f }, (r) => r.step, (r) => r.app, NOW).map((r) => r.id)
  test("no filter keeps everything", () => {
    expect(run({})).toEqual(["a", "b", "c", "d"])
    expect(isTrackerFilterOn(NO_TRACKER_FILTER)).toBe(false)
  })
  test("by status, hide closed, and follow-ups due", () => {
    expect(run({ status: ["applied"] })).toEqual(["a", "b"])
    expect(run({ status: ["applied", "interview"] })).toEqual(["a", "b", "d"])
    expect(run({ hideClosed: true })).toEqual(["a", "b", "d"])
    expect(run({ followUp: true })).toEqual(["a"])
    expect(isTrackerFilterOn({ ...NO_TRACKER_FILTER, followUp: true })).toBe(true)
  })
  test("filters together", () => {
    expect(run({ status: ["applied"], hideClosed: true, followUp: true })).toEqual(["a"])
    expect(run({ status: ["offer"] })).toEqual([])
  })
})

describe("normalizeTrackerFilter", () => {
  test("a saved filter reads back, and rubbish does not break it", () => {
    expect(normalizeTrackerFilter({ status: ["applied", 3], followUp: true, hideClosed: "yes" })).toEqual({ status: ["applied"], followUp: true, hideClosed: false })
    expect(normalizeTrackerFilter(null)).toEqual(NO_TRACKER_FILTER)
    expect(normalizeTrackerFilter("x")).toEqual(NO_TRACKER_FILTER)
  })
})

describe("calendar", () => {
  test("monthGrid: October 2026 starts on a Thursday, Monday first", () => {
    const g = monthGrid(2026, 9)
    expect(g.every((w) => w.length === 7)).toBe(true)
    expect(g[0].slice(0, 3)).toEqual([null, null, null])
    expect(g[0][3]).toBe("2026-10-01")
    expect(g.flat().filter(Boolean)).toHaveLength(31)
    expect(g.length).toBe(5)
  })
  test("monthGrid: February 2027 fits four weeks exactly", () => {
    const g = monthGrid(2027, 1)
    expect(g.length).toBe(4)
    expect(g[0][0]).toBe("2027-02-01")
  })
  test("byDay groups the jobs on their day, in that month only", () => {
    const rows = [{ n: 1, d: "2026-10-05" }, { n: 2, d: "2026-10-05" }, { n: 3, d: "2026-11-01" }, { n: 4, d: null }]
    const m = byDay(rows, (r) => r.d, 2026, 9)
    expect([...m.keys()]).toEqual(["2026-10-05"])
    expect(m.get("2026-10-05")!.map((r) => r.n)).toEqual([1, 2])
  })
  test("appliedOn and todayIso", () => {
    expect(appliedOn({ logged_at: "2026-10-10" })).toBe("2026-10-10")
    expect(appliedOn(undefined)).toBeNull()
    expect(todayIso(NOW)).toBe("2026-10-14")
  })
})
