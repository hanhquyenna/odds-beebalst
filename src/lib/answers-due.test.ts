import { describe, expect, test } from "bun:test"
import { answersDue, ASK_AFTER_DAYS } from "@/lib/answers-due"
import type { Application } from "@/lib/types"

const NOW = Date.parse("2026-10-20T12:00:00Z")
const app = (id: number | string, posting: string, logged: string, stage: Application["stage"] = "applied"): Application => ({ id, posting_id: posting, title: posting, employer: "X", fit_tier: "x", stage, logged_at: logged })

describe("who to ask 'did you hear back?'", () => {
  test("only applications still marked applied and old enough, the longest wait first", () => {
    const due = answersDue([app(1, "new", "2026-10-15"), app(2, "old", "2026-09-20"), app(3, "mid", "2026-10-02"), app(4, "answered", "2026-09-01", "interview"), app(5, "edge", "2026-10-06")], {}, NOW)
    expect(due.map((a) => a.posting_id)).toEqual(["old", "mid", "edge"])
    expect(ASK_AFTER_DAYS).toBe(14)
  })

  test("one put off recently waits a week, then is asked again", () => {
    const apps = [app(1, "a", "2026-09-20"), app(2, "b", "2026-09-21")]
    expect(answersDue(apps, { a: "2026-10-18" }, NOW).map((x) => x.posting_id)).toEqual(["b"])
    expect(answersDue(apps, { a: "2026-10-12" }, NOW).map((x) => x.posting_id)).toEqual(["a", "b"])
  })

  test("a job typed in by hand (local) is not asked about, and a bad date does not break it", () => {
    expect(answersDue([app("local-1", "x", "2026-09-01"), app(2, "y", "not a date")], {}, NOW)).toEqual([])
  })
})
