import { describe, expect, test } from "bun:test"
import { insightsOf, type Snapshot } from "@/lib/insights"

const now = new Date("2026-10-15T10:00:00Z")
const app = (id: string, stage: string, logged_at: string): { posting_id: string; stage: "applied"; logged_at: string } => ({ posting_id: id, stage: stage as "applied", logged_at })

describe("insightsOf", () => {
  test("nothing under a number means no number", () => {
    const i = insightsOf([], [], now)
    expect(i).toEqual({ total: 0, noReplyPct: null, firstReplyDays: null, longest: null, thisWeek: 0, funnel: { applied: 0, interview: 0, offer: 0 } })
  })
  test("the no-reply share counts only what was answered or went unanswered, never what is still waiting", () => {
    const apps = [app("a", "no_reply", "2026-09-01"), app("b", "no_reply", "2026-09-02"), app("c", "rejected", "2026-09-03"), app("d", "interview", "2026-09-04"), app("e", "applied", "2026-10-10")]
    expect(insightsOf(apps, [], now).noReplyPct).toBe(50)
  })
  test("the longest wait is the oldest application still at Applied", () => {
    const apps = [app("a", "applied", "2026-09-26"), app("b", "applied", "2026-10-10"), app("c", "interview", "2026-08-01")]
    expect(insightsOf(apps, [], now).longest).toEqual({ postingId: "a", days: 19 })
  })
  test("this week counts the last seven days", () => {
    const apps = [app("a", "applied", "2026-10-15"), app("b", "applied", "2026-10-09"), app("c", "applied", "2026-10-08")]
    expect(insightsOf(apps, [], now).thisWeek).toBe(2)
  })
  test("the funnel counts an offer or a hire as having reached an interview", () => {
    const apps = [app("a", "applied", "2026-10-01"), app("b", "interview", "2026-10-01"), app("c", "offer", "2026-10-01"), app("d", "hired", "2026-10-01"), app("e", "rejected", "2026-10-01")]
    expect(insightsOf(apps, [], now).funnel).toEqual({ applied: 5, interview: 3, offer: 2 })
  })
  test("the first reply takes the middle of the recorded waits, and ignores silence and unrecorded answers", () => {
    const shots: Snapshot[] = [
      { applied_on: "2026-09-01", outcome: "interview", outcome_on: "2026-09-04" },
      { applied_on: "2026-09-01", outcome: "rejected", outcome_on: "2026-09-10" },
      { applied_on: "2026-09-01", outcome: "interview", outcome_on: "2026-09-08" },
      { applied_on: "2026-09-01", outcome: "no_reply", outcome_on: "2026-09-30" },
      { applied_on: "2026-09-01", outcome: null, outcome_on: null },
    ]
    expect(insightsOf([], shots, now).firstReplyDays).toBe(7)
  })
})
