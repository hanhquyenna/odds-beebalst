import { useState } from "react"
import { HIDDEN_AT_START, STANDARD_PROPERTIES, STANDARD_SORTS } from "@/lib/properties"
import { CheckIcon, EyeIcon, EyeSlashIcon, SortIcon } from "@/components/icons"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useViewConfig } from "@/lib/views"
import type { ViewName } from "@/lib/types"

export interface Choice {
  key: string
  label: string
}

/** Sorts whose usual order starts with the most: newest, highest pay, highest chance, most senior. */
const BIG_FIRST = new Set(["pay", "chance", "match", "newest", "posted", "level"])

/** What "ascending" and "descending" mean for each thing a view can be sorted by, in words that fit it. */
function directionLabels(key: string): { asc: string; desc: string } {
  if (["pay", "chance", "match"].includes(key)) {
    return { asc: "Low to high", desc: "High to low" }
  }
  if (key === "level") {
    return { asc: "Junior first", desc: "Senior first" }
  }
  if (key === "newest" || key === "posted") {
    return { asc: "Oldest first", desc: "Newest first" }
  }
  if (key === "language") {
    return { asc: "English first", desc: "Dutch first" }
  }
  if (key === "sponsor") {
    return { asc: "None first", desc: "Sponsors first" }
  }
  if (key === "status") {
    return { asc: "Just saved first", desc: "Furthest along first" }
  }

  return { asc: "A to Z", desc: "Z to A" }
}

/**
 * The two controls every view has, as in Notion: Sort, and Properties. Sort shows
 * what it is sorted by on the button itself, so a change is always visible.
 * Hiding a property only hides it here; nothing is deleted.
 */
export function ViewControls({ view, properties, sorts, sortDefault }: { view: ViewName; properties: ReadonlyArray<Choice>; sorts: ReadonlyArray<Choice>; sortDefault?: string }): React.JSX.Element {
  const { config, show, toggle, update, reset } = useViewConfig(view)
  const [sortOpen, setSortOpen] = useState<boolean>(false)
  const [propsOpen, setPropsOpen] = useState<boolean>(false)
  const key = config.sortKey || sortDefault || ""
  const active = sorts.find((s) => s.key === key)
  const labels = directionLabels(key)
  // Properties that start hidden do not count as something changed until they are turned on.
  const hiddenCount = properties.filter((p) => !show(p.key) && !HIDDEN_AT_START.has(p.key)).length + (config.shown?.length ?? 0)
  const button = "flex h-10 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] bg-card px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-accent"

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={sortOpen} onOpenChange={setSortOpen}>
        <PopoverTrigger className={`${button} ${config.sortKey ? "border-brand bg-accent" : ""}`}>
          <SortIcon className="size-4" aria-hidden="true" />
          {config.sortKey && active ? `${active.label}: ${labels[config.sortDir]}` : "Sort"}
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-72 max-w-[calc(100vw-2rem)] flex-col p-1.5">
          {sorts.map((s) => {
            const on = s.key === key && config.sortKey !== ""
            const words = directionLabels(s.key)

            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  // First press sorts the way people usually want it, the next press turns it around.
                  const first = BIG_FIRST.has(s.key) ? "desc" : "asc"
                  update({ sortKey: s.key, sortDir: on ? (config.sortDir === "asc" ? "desc" : "asc") : first })
                }}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent ${on ? "bg-accent font-medium" : ""}`}
              >
                {s.label}
                {on ? (
                  <span className="flex items-center gap-1.5 text-[0.8125rem] font-normal text-brand-ink">
                    {words[config.sortDir]}
                    <CheckIcon className="size-4" aria-hidden="true" />
                  </span>
                ) : null}
              </button>
            )
          })}
          {config.sortKey ? (
            <button
              type="button"
              onClick={() => {
                update({ sortKey: "", sortDir: "desc" })
                setSortOpen(false)
              }}
              className="mt-1 cursor-pointer rounded-md border-t-[1.5px] px-2.5 pt-3 pb-1.5 text-left text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              Remove sort
            </button>
          ) : (
            <p className="px-2.5 pt-2 pb-1 text-[0.8125rem] text-muted-foreground">Press again to reverse the order.</p>
          )}
        </PopoverContent>
      </Popover>

      {properties.length > 0 ? (
      <Popover open={propsOpen} onOpenChange={setPropsOpen}>
        <PopoverTrigger className={button}>
          <EyeIcon className="size-4" aria-hidden="true" />
          Properties
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-64 flex-col gap-0.5 p-1.5">
          <p className="px-3 pt-1.5 pb-1 text-[0.8125rem] text-muted-foreground">Shown in this view</p>
          {properties.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={show(p.key)}
              onClick={() => toggle(p.key)}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent"
            >
              <span className={show(p.key) ? "" : "text-muted-foreground"}>{p.label}</span>
              {show(p.key) ? <EyeIcon className="size-4" aria-hidden="true" /> : <EyeSlashIcon className="size-4 text-muted-foreground" aria-hidden="true" />}
            </button>
          ))}
          {hiddenCount > 0 || config.sortKey ? (
            <button type="button" onClick={reset} className="mt-1 cursor-pointer rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground">
              Reset this view
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
      ) : null}
    </div>
  )
}

/**
 * The properties and sorts each view offers. The table and the board offer the
 * same ones, plus your own; the board leaves out Status because its steps are
 * the status. People have their own few.
 */
/** The properties and sorts of the people table, and of the list and board over the same people, plus the ones you added to them. */
export function peopleChoices(columns: ReadonlyArray<string>): { properties: Choice[]; sorts: Choice[]; sortDefault?: string } {
  const custom = columns.map((c) => ({ key: `p:${c}`, label: c }))
  const own: Choice[] = [
    { key: "status", label: "Stage" },
    { key: "company", label: "Company" },
    { key: "job", label: "Linked job" },
    { key: "role", label: "Current job" },
    { key: "update", label: "Last update" },
    { key: "nudge", label: "Nudge" },
    { key: "contact", label: "Link" },
    { key: "place", label: "Place" },
    { key: "messages", label: "Messages" },
    { key: "notes", label: "Notes" },
  ]

  return { properties: [...own, ...custom], sorts: [{ key: "name", label: "Name" }, ...own, ...custom], sortDefault: "company" }
}

export function choicesFor(view: ViewName, columns: ReadonlyArray<string>): { properties: Choice[]; sorts: Choice[]; sortDefault?: string } {
  const custom = columns.map((c) => ({ key: `p:${c}`, label: c }))
  if (view.startsWith("pv:")) {
    return peopleChoices(columns)
  }
  if (view === "peopleBoard") {
    return {
      properties: [
        { key: "job", label: "Linked job" },
      ],
      sorts: [
        { key: "company", label: "Company" },
        { key: "name", label: "Name" },
      ],
      sortDefault: "company",
    }
  }
  if (view === "people") {
    return {
      properties: [
        { key: "status", label: "Stage" },
        { key: "contact", label: "Link" },
      ],
      sorts: [
        { key: "company", label: "Company" },
        { key: "name", label: "Name" },
        { key: "status", label: "Stage" },
      ],
      sortDefault: "company",
    }
  }
  const board = view === "board"

  return {
    properties: [...STANDARD_PROPERTIES.filter((p) => !board || p.key !== "status"), ...custom],
    sorts: [...STANDARD_SORTS.filter((p) => !board || p.key !== "status"), ...custom],
  }
}
