import type { Application } from "@/lib/types"

/**
 * The logic behind the job table's built-in properties and filters, kept apart from the screen so it can be tested.
 * Dates are YYYY-MM-DD days; "today" is passed in.
 */

/** How long to wait after applying before it is worth asking: a week, the usual advice. */
export const FOLLOW_UP_DAYS = 7

const MS_DAY = 86_400_000
const utc = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)
export const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)
export const todayIso = (now: Date = new Date()): string => isoOf(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

/** The day an application was logged, or null. */
export const appliedOn = (app: Pick<Application, "logged_at"> | undefined): string | null => (app && isDay(app.logged_at) ? app.logged_at.slice(0, 10) : null)

export interface FollowUp {
  /** The day to follow up. */
  on: string
  /** Days from today: negative or zero when it is due. */
  inDays: number
  due: boolean
}

/** When to follow up an application that is still waiting (stage "applied"): the chosen number of days after it was logged (a week unless you change it). Null for anything else: no application, or it has moved on or ended. */
export function followUpOf(app: Pick<Application, "logged_at" | "stage"> | undefined, now: Date = new Date(), days: number = FOLLOW_UP_DAYS): FollowUp | null {
  const day = appliedOn(app)
  if (!app || app.stage !== "applied" || !day) {
    return null
  }
  const on = isoOf(utc(day) + days * MS_DAY)
  const inDays = Math.round((utc(on) - utc(todayIso(now))) / MS_DAY)

  return { on, inDays, due: inDays <= 0 }
}

/** The words for it: "Due today", "Overdue by 3 days", "In 2 days". */
export function followUpText(f: FollowUp): string {
  if (f.inDays === 0) return "Due today"
  if (f.inDays < 0) return `Overdue by ${-f.inDays} ${f.inDays === -1 ? "day" : "days"}`

  return `In ${f.inDays} ${f.inDays === 1 ? "day" : "days"}`
}

/** What a saved view keeps from the status side of the table, besides the usual job filters. */
export interface TrackerFilter {
  /** Only these statuses; empty is every status. */
  status: string[]
  /** Only applications that are due for a follow-up. */
  followUp: boolean
  /** Leave out jobs that have closed. */
  hideClosed: boolean
}

export const NO_TRACKER_FILTER: TrackerFilter = { status: [], followUp: false, hideClosed: false }

export const isTrackerFilterOn = (f: TrackerFilter): boolean => f.status.length > 0 || f.followUp || f.hideClosed

/** Reads a saved filter back into shape, ignoring anything it does not know. */
export function normalizeTrackerFilter(raw: unknown): TrackerFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>

  return { status: Array.isArray(r.status) ? r.status.filter((x): x is string => typeof x === "string") : [], followUp: r.followUp === true, hideClosed: r.hideClosed === true }
}

interface Row {
  id: string
  closed_at?: string | null
}

/** The rows that pass the filter. `stepOf` says each row's status, `applicationOf` its application (if any). */
export function applyTrackerFilter<T extends Row>(rows: ReadonlyArray<T>, filter: TrackerFilter, stepOf: (row: T) => string, applicationOf: (row: T) => Pick<Application, "logged_at" | "stage"> | undefined, now: Date = new Date()): T[] {
  return rows.filter((row) => {
    if (filter.hideClosed && row.closed_at) return false
    if (filter.status.length > 0 && !filter.status.includes(stepOf(row))) return false
    if (filter.followUp) {
      const f = followUpOf(applicationOf(row), now)
      if (!f || !f.due) return false
    }

    return true
  })
}

/** The jobs on each day of a month, for the calendar: `dateOf` gives a job's day (or null), and only days in that month count. Rows within a day keep their order. */
export function byDay<T>(rows: ReadonlyArray<T>, dateOf: (row: T) => string | null, year: number, month: number): Map<string, T[]> {
  const out = new Map<string, T[]>()
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`
  for (const row of rows) {
    const day = dateOf(row)
    if (day && day.startsWith(prefix)) {
      out.set(day, [...(out.get(day) ?? []), row])
    }
  }

  return out
}

/** The weeks of a month as rows of seven days, Monday first; days outside the month are null. */
export function monthGrid(year: number, month: number): Array<Array<string | null>> {
  const first = new Date(Date.UTC(year, month, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => isoOf(Date.UTC(year, month, i + 1)))]
  while (cells.length % 7 !== 0) cells.push(null)

  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7))
}
