import { useMemo, useState } from "react"
import { CalendarPlusIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons"
import { buildIcs, saveIcs, type IcsEvent } from "@/lib/ics"
import { usePhone } from "@/lib/use-phone"
import { STEPS, stepOf } from "@/components/job-steps"
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

interface CalendarItem {
  id: string
}

interface CalendarProps<T extends CalendarItem> {
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
  /** What an item becomes in someone's own calendar app: its title, and a description with the status and their notes. */
  exportOf: (item: T, keyLabel: string) => Omit<IcsEvent, "uid" | "day">
}

/**
 * A month with items on their days, shared by the jobs and the people. The date comes from a property you choose (the day you applied, a nudge due, any date of your own).
 * Each item is a small chip with a coloured dot; a day with more than three shows the rest when asked;
 */
function ItemCalendar<T extends CalendarItem>({ items, dateProps, dateKey, onDateKey, dateOf, label, hint, color, dim, onOpen, exportOf }: CalendarProps<T>): React.JSX.Element {
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const now = new Date()

    return { y: now.getFullYear(), m: now.getMonth() }
  })
  const [open, setOpen] = useState<string | null>(null)
  const today = todayIso()
  // A phone shows dots in the month and the chosen day's items under it, the way a phone calendar does.
  const [picked, setPicked] = useState<string>(today)
  const phone = usePhone()
  const key = dateProps.some((d) => d.key === dateKey) ? dateKey : (dateProps[0]?.key ?? "")

  const days = useMemo(() => byDay(items, (item) => dateOf(item, key), cursor.y, cursor.m), [items, cursor, key, dateOf])
  const weeks = monthGrid(cursor.y, cursor.m)
  const monthName = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })
  const move = (by: number): void => setCursor(({ y, m }) => ({ y: y + Math.floor((m + by) / 12), m: (((m + by) % 12) + 12) % 12 }))
  const round = "flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-150 hover:bg-white/30"
  const keyLabel = dateProps.find((d) => d.key === key)?.label ?? "Date"
  // Every dated item, not only this month's: the export is the whole calendar for the chosen date.
  const dated = items.flatMap((item) => {
    const day = dateOf(item, key)

    return day ? [{ item, day }] : []
  })

  function exportAll(): void {
    const events = dated.map(({ item, day }) => ({ uid: `${item.id}-${key}`, day, ...exportOf(item, keyLabel) }))
    void saveIcs(buildIcs(events, `odds: ${keyLabel}`), `odds-${keyLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`)
  }

  const exportButton = (
    <button type="button" onClick={exportAll} disabled={dated.length === 0} title={dated.length === 0 ? `Nothing has a ${keyLabel.toLowerCase()} yet` : `Add ${dated.length} to your calendar`} className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-50">
      <CalendarPlusIcon weight="bold" className="size-4" aria-hidden="true" />
      Export
    </button>
  )

  return (
    <div className="overflow-hidden rounded-2xl border-2 border-line bg-card shadow-sm max-md:-mx-5 max-md:rounded-none max-md:border-x-0 max-md:border-y-[1.5px] max-md:shadow-none">
      {phone ? (
        <PhoneHeader
          month={monthName}
          year={cursor.y}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onToday={() => {
            setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() })
            setPicked(today)
          }}
          picker={
            <select aria-label="Date to lay the calendar out by" value={key} onChange={(e) => onDateKey(e.target.value)} className="h-10 min-w-0 flex-1 cursor-pointer rounded-full bg-secondary px-4 font-medium">
              {dateProps.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          }
          exportButton={
            <button type="button" onClick={exportAll} disabled={dated.length === 0} className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40">
              <CalendarPlusIcon weight="bold" className="size-4" aria-hidden="true" />
              Export
            </button>
          }
        />
      ) : (
      <div className="flex flex-wrap items-center justify-between gap-3 bg-red-600 px-4 py-4 text-white md:gap-4 md:px-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-baseline gap-2.5" aria-live="polite">
            <span className="text-2xl leading-none font-bold tracking-tight md:text-3xl">{monthName}</span>
            <span className="text-xl leading-none font-medium text-white/75 tabular-nums">{cursor.y}</span>
          </h3>
        </div>
        <div className="flex items-center gap-2 max-md:w-full">
          <select aria-label="Date to lay the calendar out by" value={key} onChange={(e) => onDateKey(e.target.value)} className="h-9 min-w-0 cursor-pointer rounded-full max-md:flex-1 bg-white/15 px-3.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/30">
            {dateProps.map((d) => (
              <option key={d.key} value={d.key} className="bg-card text-foreground">
                {d.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() })} className="h-9 cursor-pointer rounded-full bg-white px-4 text-sm font-semibold text-red-600 transition-colors duration-150 hover:bg-white/90">
            Today
          </button>
          {exportButton}
          <button type="button" aria-label="Previous month" onClick={() => move(-1)} className={round}>
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => move(1)} className={round}>
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      )}

      <div className="md:overflow-x-auto">
        <div className="md:min-w-[44rem]">
          <div className="grid grid-cols-7 border-b-2 border-line bg-secondary/60 max-md:border-b-[1.5px] max-md:bg-transparent text-[0.6875rem] font-bold tracking-widest text-muted-foreground uppercase">
            {WEEKDAYS.map((d, i) => (
              <div key={d} className={`py-2 text-center tracking-normal md:px-3 md:text-left md:tracking-widest ${i > 4 ? "text-red-600/80" : ""}`}>
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
                  <div key={i} onClick={() => day && setPicked(day)} className={`min-h-[3.25rem] border-b-[1.5px] border-line p-1 md:border-r-[1.5px] transition-colors duration-150 last:border-r-0 max-md:cursor-pointer md:min-h-[6.5rem] md:p-2 ${day ? (weekend ? "bg-secondary/25 hover:bg-secondary/50" : "hover:bg-accent/40") : "bg-secondary/50"} ${day && day === picked && day !== today ? "max-md:bg-accent" : ""}`}>
                    {day ? (
                      <>
                        <p className={`mx-auto mb-1 flex size-7 items-center justify-center rounded-full text-sm tabular-nums md:mx-0 md:mb-1.5 ${day === today ? "bg-red-600 font-bold text-white shadow-sm" : list.length > 0 ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{Number(day.slice(8))}</p>
                        {list.length > 0 ? (
                          <span className="flex justify-center gap-0.5 md:hidden" aria-hidden="true">
                            {list.slice(0, 3).map((item) => (
                              <span key={item.id} className="size-1.5 rounded-full" style={{ background: color(item) ?? "var(--muted-foreground)" }} />
                            ))}
                          </span>
                        ) : null}
                        <ul className="hidden flex-col gap-1 md:flex">
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
                          <button type="button" onClick={() => setOpen(day)} className="mt-1 hidden cursor-pointer px-1 text-xs font-bold text-red-600 hover:underline md:inline">
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
      <DayList day={picked} items={days.get(picked) ?? []} label={label} hint={hint} color={color} dim={dim} onOpen={onOpen} />
    </div>
  )
}

/** Phone only: what is on the chosen day, as full-width rows a thumb can hit. */
function DayList<T extends CalendarItem>({ day, items, label, hint, color, dim, onOpen }: { day: string; items: ReadonlyArray<T>; label: (item: T) => string; hint: (item: T) => string; color: (item: T) => string | null; dim?: (item: T) => boolean; onOpen: (item: T) => void }): React.JSX.Element {
  const title = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })

  return (
    <div className="flex flex-col gap-2 px-4 py-4 md:hidden">
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing on this day.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                style={{ borderLeftColor: color(item) ?? "var(--line)" }}
                className={`flex w-full cursor-pointer flex-col rounded-lg border-l-[4px] bg-secondary px-3 py-2 text-left ${dim?.(item) ? "opacity-60" : ""}`}
              >
                <span className="truncate text-sm font-semibold">{label(item)}</span>
                <span className="truncate text-xs text-muted-foreground">{hint(item).startsWith(`${label(item)} · `) ? hint(item).slice(label(item).length + 3) : hint(item)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
      exportOf={(post, keyLabel) => {
        const status = STEPS.find((s) => s.step === stepOf(data, post))?.title ?? "Saved"
        const notes = ownNotes(profile.columns, profile.notes[post.id])

        return {
          title: `${keyLabel}: ${post.title} · ${post.employer_display}`,
          description: [`Status: ${status}${post.closed_at ? " (closed)" : ""}`, [post.employer_display, post.region].filter(Boolean).join(" · "), ...(notes.length > 0 ? ["", "Your notes:", ...notes] : []), ...(post.url ? ["", post.url] : [])].join("\n"),
          url: post.url || undefined,
        }
      }}
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
      exportOf={(p, keyLabel) => {
        const notes = [...(p.notes.trim() ? [p.notes.trim()] : []), ...ownNotes(custom, profile.peopleNotes?.[p.id])]

        return {
          title: `${keyLabel}: ${p.name}${p.company ? ` · ${p.company}` : ""}`,
          description: [`Status: ${p.status}`, ...(p.contact ? [`Contact: ${p.contact}`] : []), ...(notes.length > 0 ? ["", "Your notes:", ...notes] : [])].join("\n"),
        }
      }}
    />
  )
}

/** Your own properties that have a value, as "Name: value" lines, in the order of your columns. */
function ownNotes(columns: ReadonlyArray<string>, values: Record<string, string> | undefined): string[] {
  return columns.flatMap((name) => {
    const value = values?.[name]?.trim()

    return value ? [`${name}: ${value}`] : []
  })
}

/** Phone: the month and the arrows on one line, the date to lay out by and Export on the next, on the card itself. */
function PhoneHeader({ month, year, onPrev, onNext, onToday, picker, exportButton }: { month: string; year: number; onPrev: () => void; onNext: () => void; onToday: () => void; picker: React.ReactNode; exportButton: React.ReactNode }): React.JSX.Element {
  const arrow = "flex size-9 cursor-pointer items-center justify-center rounded-full text-foreground active:bg-accent"

  return (
    <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-baseline gap-1.5" aria-live="polite">
          <span className="text-2xl leading-none font-bold tracking-tight">{month}</span>
          <span className="text-lg leading-none font-medium text-muted-foreground tabular-nums">{year}</span>
        </h3>
        <div className="flex items-center">
          <button type="button" aria-label="Previous month" onClick={onPrev} className={arrow}>
            <ChevronLeftIcon weight="bold" className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={onToday} className="h-9 cursor-pointer rounded-full px-2.5 text-sm font-semibold text-red-600 active:bg-accent">
            Today
          </button>
          <button type="button" aria-label="Next month" onClick={onNext} className={arrow}>
            <ChevronRightIcon weight="bold" className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {picker}
        {exportButton}
      </div>
    </div>
  )
}
