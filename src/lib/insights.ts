import type { Application } from "@/lib/types"

/** What was recorded when someone applied and when they heard back (chance_snapshots): the only place the day of a first answer is kept. */
export interface Snapshot {
  applied_on: string
  outcome: "interview" | "rejected" | "no_reply" | null
  outcome_on: string | null
}

export interface Insights {
  total: number
  /** Of the applications that were answered or went unanswered, the share that were never answered. Null until there is one of either. */
  noReplyPct: number | null
  /** The middle number of days from applying to a first answer (an interview or a no), where the answer was recorded. */
  firstReplyDays: number | null
  /** The application still waiting that was sent longest ago. */
  longest: { postingId: string; days: number } | null
  thisWeek: number
  /** Applications sent in each of the last eight weeks, the oldest first and this week last. */
  weeks: number[]
  /** Everything sent, then what reached an interview, then an offer. */
  funnel: { applied: number; interview: number; offer: number }
}

const DAY = 86_400_000
const dayOf = (iso: string): number | null => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) : null)

/** The numbers behind the search, from the stages and dates already kept. Nothing here is guessed: a number with nothing under it is null. */
export function insightsOf(applications: ReadonlyArray<Pick<Application, "posting_id" | "stage" | "logged_at">>, snapshots: ReadonlyArray<Snapshot>, now: Date = new Date()): Insights {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const count = (...stages: string[]): number => applications.filter((a) => stages.includes(a.stage)).length
  const answered = count("interview", "offer", "hired", "rejected")
  const silent = count("no_reply")
  const waiting = applications
    .filter((a) => a.stage === "applied")
    .map((a) => ({ postingId: a.posting_id, day: dayOf(a.logged_at) }))
    .filter((a): a is { postingId: string; day: number } => a.day !== null)
    .map((a) => ({ postingId: a.postingId, days: Math.max(0, Math.round((today - a.day) / DAY)) }))
    .sort((a, b) => b.days - a.days)
  const waits = snapshots
    .filter((s) => s.outcome !== null && s.outcome !== "no_reply" && s.outcome_on)
    .map((s) => ({ from: dayOf(s.applied_on), to: dayOf(s.outcome_on ?? "") }))
    .filter((s): s is { from: number; to: number } => s.from !== null && s.to !== null && s.to >= s.from)
    .map((s) => Math.round((s.to - s.from) / DAY))
    .sort((a, b) => a - b)
  const middle = waits.length === 0 ? null : waits.length % 2 === 1 ? waits[(waits.length - 1) / 2] : Math.round((waits[waits.length / 2 - 1] + waits[waits.length / 2]) / 2)

  return {
    total: applications.length,
    noReplyPct: answered + silent === 0 ? null : Math.round((silent / (answered + silent)) * 100),
    firstReplyDays: middle,
    longest: waiting[0] ?? null,
    weeks: Array.from({ length: 8 }, (_, i) => {
      const from = today - (7 - i) * 7 * DAY - 6 * DAY
      const to = today - (7 - i) * 7 * DAY

      return applications.filter((a) => {
        const day = dayOf(a.logged_at)

        return day !== null && day >= from && day <= to
      }).length
    }),
    thisWeek: applications.filter((a) => {
      const day = dayOf(a.logged_at)

      return day !== null && today - day < 7 * DAY && today - day >= 0
    }).length,
    funnel: { applied: applications.length, interview: count("interview", "offer", "hired"), offer: count("offer", "hired") },
  }
}
