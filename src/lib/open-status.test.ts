import { describe, expect, test } from "bun:test"
import { openStatusOf, openStatusText } from "@/lib/open-status"

const NOW = new Date(2026, 9, 4, 15, 0)

describe("openStatusOf", () => {
  test("open, checked today / yesterday / days ago / never", () => {
    expect(openStatusText(openStatusOf({ closed_at: null, last_checked: "2026-10-04T08:00:00Z" }, NOW))).toBe("Open · checked today")
    expect(openStatusText(openStatusOf({ closed_at: null, last_checked: "2026-10-03" }, NOW))).toBe("Open · checked yesterday")
    expect(openStatusText(openStatusOf({ closed_at: null, last_checked: "2026-09-30" }, NOW))).toBe("Open · checked 4 days ago")
    expect(openStatusText(openStatusOf({ closed_at: null, last_checked: null }, NOW))).toBe("Open")
  })
  test("closed says when", () => {
    const s = openStatusOf({ closed_at: "2026-10-02T10:00:00Z", last_checked: "2026-10-02" }, NOW)
    expect(s.open).toBe(false)
    expect(openStatusText(s)).toBe("Closed on 2 Oct")
    expect(openStatusText(openStatusOf({ closed_at: "x", last_checked: null }, NOW))).toBe("Closed")
  })
  test("never negative when a check is dated in the future", () => {
    expect(openStatusOf({ closed_at: null, last_checked: "2026-10-09" }, NOW).checkedDaysAgo).toBe(0)
  })
})
