import { FOLLOW_UP_DAYS, appliedOn, isDay, isoOf, todayIso, type FollowUp } from "@/lib/tracker"
import { toIsoDate } from "@/lib/import"
import type { Application } from "@/lib/types"

/**
 * What you type over a value we read. Every property of a job in the table can be edited; your value is kept with the job in the same place as your own properties, under the
 * property's name with an @ in front, and wins until you clear it. Clearing it brings back the one we read.
 */
export const cellKey = (key: string): string => `@${key}`

export const overrideOf = (notes: Record<string, Record<string, string>> | undefined, postId: string, key: string): string => notes?.[postId]?.[cellKey(key)] ?? ""

const MS_DAY = 86_400_000
const utc = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))

/** What a follow-up text says: a number of days after applying ("7 days", "3d", "10"), a date, or nothing we can read. */
export function parseFollow(text: string): { days: number } | { on: string } | null {
  const t = text.trim()
  if (!t) return null
  const d = t.match(/^(\d{1,3})\s*(d|day|days|dag|dagen)?$/i)
  if (d && Number(d[1]) >= 0) return { days: Number(d[1]) }
  const on = toIsoDate(t)

  return on ? { on } : null
}

/** The day you applied: what you typed if it is a date, else the day the application was logged. */
export const appliedDay = (app: Pick<Application, "logged_at"> | undefined, typed: string): string | null => (isDay(typed) ? typed.slice(0, 10) : toIsoDate(typed) ?? appliedOn(app))

/** The follow-up text shown for a job: what you typed, or "7 days" while an application is waiting. */
export const followUpText = (app: Pick<Application, "stage"> | undefined, typed: string, defaultDays: number = FOLLOW_UP_DAYS): string => (typed ? typed : app?.stage === "applied" ? `${defaultDays} days` : "")

/**
 * When to follow up, from that text. A number of days counts from the day you applied and only while it is still waiting; a date is that date. Text we cannot read gives no date.
 */
export function followUpFor(app: Pick<Application, "logged_at" | "stage"> | undefined, typed: string, applied: string | null, now: Date = new Date(), defaultDays: number = FOLLOW_UP_DAYS): FollowUp | null {
  const parsed = parseFollow(followUpText(app, typed, defaultDays))
  if (!parsed) return null
  let on: string
  if ("on" in parsed) {
    on = parsed.on
  } else {
    if (!app || app.stage !== "applied" || !applied) return null
    on = isoOf(utc(applied) + parsed.days * MS_DAY)
  }
  const inDays = Math.round((utc(on) - utc(todayIso(now))) / MS_DAY)

  return { on, inDays, due: inDays <= 0 }
}
