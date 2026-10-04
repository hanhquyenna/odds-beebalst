import { NUDGE_AFTER_DAYS, STAGES, nextStep } from "@/lib/outreach-stage"
import { parseFollow } from "@/lib/cells"
import { isDay, isoOf, todayIso } from "@/lib/tracker"
import type { ContactStatus, Person, SavedPeopleView, ViewConfig, ViewLayout } from "@/lib/types"
import { CONTACT_STATUSES } from "@/lib/types"


/**
 * The logic behind the people table, the same idea as the job table's: filters, views and the computed properties, kept apart from the screen so they can be tested.
 * The properties follow the usual outreach and networking trackers: stage, company and job, last update, the next step and whether a nudge is due, how to reach them.
 */

const DAY = 86_400_000

/** What a saved view of people keeps: which stages to show, only those whose nudge is due, only those not linked to a job. */
export interface PeopleFilter {
  status: string[]
  nudgeDue: boolean
  unlinked: boolean
}

export const NO_PEOPLE_FILTER: PeopleFilter = { status: [], nudgeDue: false, unlinked: false }

export const isPeopleFilterOn = (f: PeopleFilter): boolean => f.status.length > 0 || f.nudgeDue || f.unlinked

export function normalizePeopleFilter(raw: unknown): PeopleFilter {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>

  return {
    status: Array.isArray(r.status) ? r.status.filter((x): x is string => typeof x === "string" && (CONTACT_STATUSES as ReadonlyArray<string>).includes(x)) : [],
    nudgeDue: r.nudgeDue === true,
    unlinked: r.unlinked === true,
  }
}

/** The day the stage last changed, or null. Called "Last update" in the table. */
export const lastUpdate = (p: Pick<Person, "statusAt">): string | null => (isDay(p.statusAt) ? p.statusAt.slice(0, 10) : null)

/** The day the one nudge is due: a week after the stage changed, only while the stage is one where waiting is the move. */
export function nudgeOn(p: Pick<Person, "status" | "statusAt">, days: number = NUDGE_AFTER_DAYS): string | null {
  const day = lastUpdate(p)
  if (!day || STAGES[p.status]?.waiting !== true) {
    return null
  }

  return isoOf(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + days * DAY)
}

/** The rows that pass the filter. `linked` says whether a person is tied to a job. */
export function applyPeopleFilter(people: ReadonlyArray<Person>, filter: PeopleFilter, now: Date = new Date(), days: number = NUDGE_AFTER_DAYS): Person[] {
  return people.filter((p) => {
    if (filter.status.length > 0 && !filter.status.includes(p.status)) return false
    if (filter.nudgeDue && !nextStep(p, now, days).due) return false
    if (filter.unlinked && p.jobId) return false

    return true
  })
}

/** Words in a search match a person's name, company, position or notes. */
export function matchesPerson(p: Person, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = `${p.name} ${p.company} ${p.role ?? ""} ${p.notes} ${p.status}`.toLowerCase()

  return words.every((w) => hay.includes(w))
}

/** The starting views, from the usual outreach trackers: everyone in a table, the pipeline by stage, and a calendar. */
export const PEOPLE_SEED_VIEWS: ReadonlyArray<SavedPeopleView> = [
  { id: "all", name: "Everyone", layout: "table", filter: NO_PEOPLE_FILTER },
  { id: "pipeline", name: "Pipeline", layout: "board", filter: NO_PEOPLE_FILTER },
  { id: "calendar", name: "Calendar", layout: "calendar", filter: NO_PEOPLE_FILTER, dateKey: "nudge" },
]

export const PEOPLE_SEED_CONFIG: Record<string, Partial<ViewConfig>> = {}

const LAYOUTS: ReadonlyArray<ViewLayout> = ["list", "table", "board", "calendar"]

export function normalizePeopleViews(raw: unknown): SavedPeopleView[] {
  if (!Array.isArray(raw)) {
    return PEOPLE_SEED_VIEWS.map((v) => ({ ...v }))
  }
  const seen = new Set<string>()
  const out: SavedPeopleView[] = []
  for (const item of raw) {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
    const id = typeof r.id === "string" && r.id.trim() ? r.id : null
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : null
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, layout: LAYOUTS.includes(r.layout as ViewLayout) ? (r.layout as ViewLayout) : "table", filter: normalizePeopleFilter(r.filter), ...(typeof r.dateKey === "string" ? { dateKey: r.dateKey } : {}) })
  }

  return out.length > 0 ? out : PEOPLE_SEED_VIEWS.map((v) => ({ ...v }))
}

export function stageIndex(status: ContactStatus): number {
  return CONTACT_STATUSES.indexOf(status)
}

/** What a person is sorted by for a property's header: a number or a text, or null where there is nothing (those go last). `jobTitle` is the title of the linked job; `custom` reads a property you added. */
export function peopleSortValue(p: Person, key: string, jobTitle: string, custom: (name: string) => string, now: Date = new Date(), days: number = NUDGE_AFTER_DAYS): string | number | null {
  switch (key) {
    case "name":
      return p.name.toLowerCase()
    case "company":
      return p.company.toLowerCase()
    case "job":
      return jobTitle ? jobTitle.toLowerCase() : null
    case "role":
      return p.role ? p.role.toLowerCase() : null
    case "status":
      return stageIndex(p.status)
    case "update":
      return lastUpdate(p)
    case "nudge":
      return nudgeOn(p, days) ?? (nextStep(p, now, days).due ? "0000" : null)
    case "contact":
      return p.contact ? p.contact.toLowerCase() : null
    case "place":
      return p.place ? p.place.toLowerCase() : null
    case "messages":
      return p.messages?.length ?? 0
    case "notes":
      return p.notes ? p.notes.toLowerCase() : null
    default:
      return key.startsWith("p:") ? custom(key.slice(2)).toLowerCase() || null : null
  }
}

/** The people sorted by a key; those with nothing for it always come last, whichever way it runs. */
export function sortPeople(people: ReadonlyArray<Person>, key: string, dir: "asc" | "desc", jobTitleOf: (p: Person) => string, custom: (p: Person, name: string) => string, days: number = NUDGE_AFTER_DAYS): Person[] {
  if (!key) return [...people]
  const sign = dir === "asc" ? 1 : -1
  const val = (p: Person): string | number | null => peopleSortValue(p, key, jobTitleOf(p), (n) => custom(p, n), new Date(), days)

  return [...people].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1

    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sign
  })
}

/**
 * When the nudge is due, from the text for it: what you typed, or "7 days" while the stage is one where waiting is the move. A number of days counts from the last update; a date is that date.
 * Text we cannot read gives no date. Due means that day has come.
 */
export function nudgeFor(p: Pick<Person, "status" | "statusAt">, typed: string, now: Date = new Date(), days: number = NUDGE_AFTER_DAYS): { on: string; due: boolean } | null {
  const waiting = STAGES[p.status]?.waiting === true
  const parsed = parseFollow(typed || (waiting ? `${days} days` : ""))
  if (!parsed) return null
  let on: string | null
  if ("on" in parsed) {
    on = parsed.on
  } else {
    on = waiting ? nudgeOn(p, parsed.days) : null
  }

  return on ? { on, due: on <= todayIso(now) } : null
}
