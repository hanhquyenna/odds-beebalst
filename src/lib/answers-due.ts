import type { Application } from "@/lib/types"

/**
 * Which applications the app should ask "did you hear back?" about (outcome loop, docs/ENGINE_DATA_PLAN.md E2): still marked applied,
 * logged at least ASK_AFTER_DAYS ago, and not put off lately. Oldest first, so the longest wait is asked first.
 */
export const ASK_AFTER_DAYS = 14
/** "No answer" is offered only once this long has passed: two weeks is still normal for a reply. */
export const NO_ANSWER_AFTER_DAYS = 21
export const SNOOZE_DAYS = 7

const DAY = 86_400_000
const dayOf = (iso: string): number => Math.floor(Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso) / DAY)

export function daysSince(iso: string, now: number): number {
  return Math.floor(now / DAY) - dayOf(iso)
}

/** `snoozed` maps an application's posting id to the day it was last put off (YYYY-MM-DD). */
export function answersDue(applications: ReadonlyArray<Application>, snoozed: Readonly<Record<string, string>>, now = Date.now()): Application[] {
  return applications
    .filter((a) => a.stage === "applied" && !String(a.id).startsWith("local-") && Number.isFinite(dayOf(a.logged_at)) && daysSince(a.logged_at, now) >= ASK_AFTER_DAYS)
    .filter((a) => {
      const put = snoozed[a.posting_id]
      return !put || daysSince(put, now) >= SNOOZE_DAYS
    })
    .sort((a, b) => dayOf(a.logged_at) - dayOf(b.logged_at))
}
