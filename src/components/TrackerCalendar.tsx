import { useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons"
import { stepOf } from "@/components/PipelineBoard"
import { applicationOf } from "@/components/tracker-values"
import { useData } from "@/lib/data"
import { useFollowDays } from "@/lib/follow-days"
import { lastUpdate, nudgeOn } from "@/lib/people-table"
import { lookOf, personColors, personLook, statusColors } from "@/lib/status-colors"
import { appliedDay, followUpFor, overrideOf } from "@/lib/cells"
import { byDay, isDay, monthGrid, todayIso } from "@/lib/tracker"
import type { Person, Posting } from "@/lib/types"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MAX_PER_DAY = 3

export interface CalendarItem {
  id: string
}

export interface CalendarProps<T extends CalendarItem> {
  items: ReadonlyArray<T>
  /** The dates the calendar can be laid out by. */
  dateProps: ReadonlyArray<{ key: string; label: string }>
  dateKey: string
  onDateKey: (key: string) => void
  /** The day (YYYY-MM-DD) of an item for a date property, or null. */
  dateOf: (item: T, key: string) => string | null
  /** What the chip says, its hover text, the colour of its dot, and whether it is dimmed (closed). */
  label: (item: T) => string
  hint: (item: T) => string
  color: (item: T) => string | null
  dim?: (item: T) => boolean
  onOpen: (item: T) => void
}

/**
 * A month with items on their days, shared by the jobs and the people. The date comes from a property you choose (the day you applied, a nudge due, any date of your own).
 * Each item is a small chip with a coloured dot; a day with more than three shows the rest when asked;
 */
export function ItemCalendar<T extends CalendarItem>({ items, dateProps, dateKey, onDateKey, dateOf, label, hint, color, dim, onOpen }: CalendarProps<T>): React.JSX.Element {
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const now = new Date()

    return { y: now.getFullYear(), m: now.getMonth() }
  })
  const [open, setOpen] = useState<string | null>(null)
  const today = todayIso()
  const key = dateProps.some((d) => d.key === dateKey) ? dateKey : (dateProps[0]?.key ?? "")

  const days = useMemo(() => byDay(items, (item) => dateOf(item, key), cursor.y, cursor.m), [items, cursor, key, dateOf])
  const weeks = monthGrid(cursor.y, cursor.m)
  const monthName = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })
  const move = (by: number): void => setCursor(({ y, m }) => ({ y: y + Math.floor((m + by) / 12), m: (((m + by) % 12) + 12) % 12 }))
  const round = "flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/30"

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-line bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-red-600 px-5 py-4 text-white">
        <h3 className="flex items-baseline gap-2.5" aria-live="polite">
          <span className="text-3xl leading-none font-bold tracking-tight">{monthName}</span>
          <span className="text-xl leading-none font-medium text-white/75 tabular-nums">{cursor.y}</span>
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Date to lay the calendar out by" value={key} onChange={(e) => onDateKey(e.target.value)} className="h-9 cursor-pointer rounded-full bg-white/15 px-3.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/30">
            {dateProps.map((d) => (
              <option key={d.key} value={d.key} className="bg-card text-foreground">
                {d.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() })} className="h-9 cursor-pointer rounded-full bg-white px-4 text-sm font-semibold text-red-600 transition-colors duration-150 hover:bg-white/90">
            Today
          </button>
          <button type="button" aria-label="Previous month" onClick={() => move(-1)} className={round}>
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => move(1)} className={round}>
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 border-b-2 border-line bg-secondary/60 text-[0.6875rem] font-bold tracking-widest text-muted-foreground uppercase">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`px-3 py-2 ${i > 4 ? "text-red-600/80" : ""}`}>
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week, w) => (
            <div key={w} className="grid grid-cols-7">
              {week.map((day, i) => {
                const list = day ? (days.get(day) ?? []) : []
                const more = open === day ? 0 : Math.max(0, list.length - MAX_PER_DAY)
                const shown = open === day ? list : list.slice(0, MAX_PER_DAY)
                const weekend = i > 4

                return (
                  <div key={i} className={`min-h-[6.5rem] border-r-[1.5px] border-b-[1.5px] border-line p-2 transition-colors duration-150 last:border-r-0 ${day ? (weekend ? "bg-secondary/25 hover:bg-secondary/50" : "hover:bg-accent/40") : "bg-secondary/50"}`}>
                    {day ? (
                      <>
                        <p className={`mb-1.5 flex size-7 items-center justify-center rounded-full text-sm tabular-nums ${day === today ? "bg-red-600 font-bold text-white shadow-sm" : list.length > 0 ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{Number(day.slice(8))}</p>
                        <ul className="flex flex-col gap-1">
                          {shown.map((item) => (
                            <li key={item.id}>
                              <button
                                type="button"
                                onClick={() => onOpen(item)}
                                title={hint(item)}
                                style={{ borderLeftColor: color(item) ?? "var(--line)" }}
                                className={`w-full cursor-pointer truncate rounded-md border-l-[4px] bg-secondary px-2 py-1 text-left text-xs font-semibold transition-colors duration-150 hover:bg-accent ${dim?.(item) ? "opacity-60" : ""}`}
                              >
                                {label(item)}
                              </button>
                            </li>
                          ))}
                        </ul>
                        {more > 0 ? (
                          <button type="button" onClick={() => setOpen(day)} className="mt-1 cursor-pointer px-1 text-xs font-bold text-red-600 hover:underline">
                            +{more} more
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Your jobs on a calendar: by the day you applied, the day to follow up, or any date property of your own. */
export function TrackerCalendar({ posts, dateKey, onDateKey, onOpen }: { posts: ReadonlyArray<Posting>; dateKey: string; onDateKey: (key: string) => void; onOpen: (post: Posting) => void }): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const colors = statusColors(profile.statusColors)
  const days = useFollowDays()
  const dateProps = [{ key: "applied", label: "Date applied" }, { key: "followup", label: "Follow-up" }, { key: "deadline", label: "Deadline" }, { key: "posted", label: "Date posted" }, ...profile.columns.filter((c) => profile.columnTypes[c] === "date").map((c) => ({ key: `p:${c}`, label: c }))]
  const dateOf = (post: Posting, key: string): string | null => {
    const typed = (k: string): string => overrideOf(profile.notes, post.id, k)
    if (key === "applied") return appliedDay(applicationOf(data, post), typed("applied"))
    if (key === "deadline") {
      const v = typed("deadline") || post.valid_through || ""

      return isDay(v) ? v.slice(0, 10) : null
    }
    if (key === "posted") {
      const v = typed("posted") || post.posted_at || ""

      return isDay(v) ? v.slice(0, 10) : null
    }
    if (key === "followup") return followUpFor(applicationOf(data, post), typed("followup"), appliedDay(applicationOf(data, post), typed("applied")), new Date(), days.followUp)?.on ?? null
    const v = profile.notes[post.id]?.[key.slice(2)]

    return isDay(v) ? v.slice(0, 10) : null
  }

  return (
    <ItemCalendar
      items={posts}
      dateProps={dateProps}
      dateKey={dateKey}
      onDateKey={onDateKey}
      dateOf={dateOf}
      label={(post) => post.title}
      hint={(post) => `${post.title} · ${post.employer_display}`}
      color={(post) => lookOf(stepOf(data, post), colors)?.background ?? null}
      dim={(post) => Boolean(post.closed_at)}
      onOpen={onOpen}
    />
  )
}

/** The people you write to on a calendar: by the day a nudge is due, the day the stage last changed, or any date property of your own. */
export function PeopleCalendar({ people, dateKey, onDateKey, onOpen }: { people: ReadonlyArray<Person>; dateKey: string; onDateKey: (key: string) => void; onOpen: (person: Person) => void }): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const colors = personColors(profile.statusColors)
  const days = useFollowDays()
  const custom = profile.peopleColumns ?? []
  const dateProps = [{ key: "nudge", label: "Nudge due" }, { key: "update", label: "Last update" }, ...custom.filter((c) => profile.peopleColumnTypes?.[c] === "date").map((c) => ({ key: `p:${c}`, label: c }))]
  const dateOf = (p: Person, key: string): string | null => {
    if (key === "nudge") return nudgeOn(p, days.nudge)
    if (key === "update") return lastUpdate(p)
    const v = profile.peopleNotes?.[p.id]?.[key.slice(2)]

    return isDay(v) ? v.slice(0, 10) : null
  }

  return (
    <ItemCalendar
      items={people}
      dateProps={dateProps}
      dateKey={dateKey}
      onDateKey={onDateKey}
      dateOf={dateOf}
      label={(p) => p.name}
      hint={(p) => `${p.name} · ${p.company || p.status} · ${p.status}`}
      color={(p) => personLook(p.status, colors)?.background ?? null}
      onOpen={onOpen}
    />
  )
}
