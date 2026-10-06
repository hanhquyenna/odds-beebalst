import { useMemo, useState } from "react"
import { BadgeCheckIcon, CheckIcon, ChevronDownIcon, PlusIcon, SearchIcon, XIcon, FunnelIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { cityOf, JOB_TYPES, WORKPLACES, type JobType, type Workplace } from "@/lib/job-facts"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { sourceNamesOf } from "@/lib/sources"
import { INDUSTRIES, type Industry } from "@/lib/industries"
import type { Level } from "@/lib/engine"
import { DEFAULT_FILTERS, FIELD_OPTIONS, LEVEL_OPTIONS, STARTING_LEVELS, activeCount, isStartingLevel, type JobFilters as Filters } from "@/lib/filters"

/** The value that stands for "no filter" inside a select, which cannot hold null. */
const ANY = "any"

interface JobFiltersProps {
  filters: Filters
  onChange: (next: Filters) => void
  /** Sits at the end of the row of filters, where the sort goes. */
  trailing?: React.ReactNode
  /** When false the row of filters is folded away (the page has a Filter toggle for it); left out, it is always shown. */
  open?: boolean
  /** False leaves out the search bar (your own list needs none). */
  search?: boolean
  /** More filters in the same row, after the others: the ones on your own search (status and so on). */
  extra?: React.ReactNode
}

const POSTED_ITEMS = [
  { value: ANY, label: "Any time" },
  { value: "day", label: "Past 24 hours" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
]
const PAY_ITEMS = [
  { value: ANY, label: "Any pay" },
  ...[3000, 4000, 5000, 6000, 8000].map((n) => ({ value: String(n), label: `€${n.toLocaleString("en-NL")}+ a month` })),
]

/**
 * The search bar and the filters, the way a job board sets them out: search
 * first, then two filters and an "Add filter" button for the rest, so nothing needs scrolling sideways. Each is a
 * select or a toggle in the same outline as the buttons around it. The
 * text-foreground is for the dark band, where the section's light text would
 * otherwise run into the paper backgrounds of the controls.
 */
export function JobFilters({ filters, onChange, trailing, extra, open, search = true }: JobFiltersProps): React.JSX.Element {
  const active = activeCount(filters)

  const [added, setAdded] = useState<string[]>([])
  const [menu, setMenu] = useState<boolean>(false)
  const defs = useFilterDefs(filters, onChange)
  const shown = (d: Def): boolean => d.on || added.includes(d.key)
  const rest = defs.filter((d) => !d.always && !shown(d))
  const remove = (d: Def): void => {
    onChange({ ...filters, ...d.reset })
    setAdded(added.filter((k) => k !== d.key))
  }

  return (
    <div role="group" aria-label="Search and filter the jobs" className="flex w-full min-w-0 flex-col gap-3 text-foreground">
      {search ? (
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Search jobs, companies or places"
          aria-label="Search jobs, companies or places"
          className="h-12 w-full rounded-xl border-[1.5px] bg-background max-md:bg-card pr-10 pl-11 text-base text-foreground transition-colors duration-150 placeholder:text-muted-foreground focus:border-ring focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {filters.query ? (
          <button type="button" aria-label="Clear the search" onClick={() => onChange({ ...filters, query: "" })} className="absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      ) : null}

      <div className={`flex-wrap items-center gap-2 max-md:grid-cols-2 ${open === false ? "hidden" : "flex max-md:grid"}`}>
        {defs.filter((d) => d.always || shown(d)).map((d) => (
          <span key={d.key} className="flex min-w-0 items-center gap-1 max-md:first:col-span-2 max-md:[&>:first-child]:min-w-0 max-md:[&>:first-child]:flex-1 max-md:[&>:first-child]:justify-between">
            {d.node}
            {!d.always ? (
              <button type="button" aria-label={`Remove the ${d.label} filter`} onClick={() => remove(d)} className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        ))}
        {extra}
        {rest.length > 0 ? (
          <Popover open={menu} onOpenChange={setMenu}>
            <PopoverTrigger className={cn(buttonVariants({ variant: "outline" }), "h-10 cursor-pointer gap-1.5 border-dashed px-3 font-medium max-md:w-full")}>
              <PlusIcon className="size-4" aria-hidden="true" />
              Filter
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-56 flex-col gap-0.5 p-1.5">
              {rest.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => {
                    setAdded([...added, d.key])
                    setMenu(false)
                  }}
                  className="cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent"
                >
                  {d.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
        {active > 0 ? (
          <Button type="button" variant="ghost" onClick={() => { onChange(DEFAULT_FILTERS); setAdded([]) }} className="h-10 cursor-pointer text-inherit hover:bg-transparent hover:opacity-70 max-md:w-full">
            Clear filters
          </Button>
        ) : null}
        {trailing ? <span className="min-w-0 sm:ml-auto max-md:[&>*]:w-full max-md:[&>*]:justify-between">{trailing}</span> : null}
      </div>
    </div>
  )
}

interface Def {
  key: string
  label: string
  always?: boolean
  on: boolean
  reset: Partial<Filters>
  node: React.ReactNode
}

/** Every filter the list offers, each with its control. The row of filters and the preferences editor both draw from this one list. */
function useFilterDefs(filters: Filters, onChange: (next: Filters) => void): Def[] {
  const data = useData()
  // The sites the jobs were found on, with how many each carries. A job on two sites counts under both.
  const sources = useMemo(() => {
    const count = new Map<string, number>()
    for (const post of data.postings) {
      for (const name of sourceNamesOf(post)) {
        if (name !== "Other") {
          count.set(name, (count.get(name) ?? 0) + 1)
        }
      }
    }

    return [...count].sort((a, b) => b[1] - a[1])
  }, [data.postings])
  const cities = useMemo(() => {
    const count = new Map<string, number>()
    for (const post of data.postings) {
      const city = cityOf(post)
      if (city && city !== "Location not stated") {
        count.set(city, (count.get(city) ?? 0) + 1)
      }
    }

    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([city]) => city).sort((a, b) => a.localeCompare(b))
  }, [data.postings])

  const defs: Def[] = [
    { key: "level", label: "Level", always: true, on: !isStartingLevel(filters.level), reset: { level: [...STARTING_LEVELS] }, node: <MultiPick label="Level" any="Any level" rest={STARTING_LEVELS} restLabel="Internship, traineeship & entry" items={LEVEL_OPTIONS.map((level) => ({ value: level, label: level }))} value={filters.level} onChange={(v) => onChange({ ...filters, level: v as Level[] })} /> },
    { key: "language", label: "Language", always: true, on: !(filters.language.length === DEFAULT_FILTERS.language.length && filters.language.every((l) => DEFAULT_FILTERS.language.includes(l))), reset: { language: [...DEFAULT_FILTERS.language] }, node: <MultiPick label="Language" any="Any language" rest={DEFAULT_FILTERS.language} items={[{ value: "english", label: "English" }, { value: "dutch", label: "Dutch needed" }]} value={filters.language} onChange={(v) => onChange({ ...filters, language: v as Array<"english" | "dutch"> })} /> },
    { key: "posted", label: "Date posted", always: true, on: filters.posted !== "any", reset: { posted: "any" }, node: <Pick label="Date posted" rest={DEFAULT_FILTERS.posted} value={filters.posted === "any" ? ANY : filters.posted} items={POSTED_ITEMS} onChange={(v) => onChange({ ...filters, posted: v === ANY ? "any" : (v as Filters["posted"]) })} /> },
    { key: "type", label: "Job type", always: true, on: filters.type.length > 0, reset: { type: [] }, node: <MultiPick label="Job type" any="Any job type" items={JOB_TYPES.map((t) => ({ value: t, label: t }))} value={filters.type} onChange={(v) => onChange({ ...filters, type: v as JobType[] })} /> },
    { key: "workplace", label: "Workplace", on: filters.workplace.length > 0, reset: { workplace: [] }, node: <MultiPick label="Workplace" any="Any workplace" items={WORKPLACES.map((w) => ({ value: w, label: w }))} value={filters.workplace} onChange={(v) => onChange({ ...filters, workplace: v as Workplace[] })} /> },
    { key: "pay", label: "Pay", on: filters.minPay !== null, reset: { minPay: null }, node: <Pick label="Pay" value={filters.minPay === null ? ANY : String(filters.minPay)} items={PAY_ITEMS} onChange={(v) => onChange({ ...filters, minPay: v === ANY ? null : Number(v) })} /> },
    { key: "city", label: "Location", always: true, on: filters.city.length > 0, reset: { city: [] }, node: <MultiPick label="Location" any="Anywhere" items={cities.map((c) => ({ value: c, label: c }))} value={filters.city} onChange={(v) => onChange({ ...filters, city: v })} /> },
    { key: "source", label: "Source", on: filters.source.length > 0, reset: { source: [] }, node: <MultiPick label="Source" any="Any source" items={sources.map(([name, n]) => ({ value: name, label: `${name} (${n})` }))} value={filters.source} onChange={(v) => onChange({ ...filters, source: v })} /> },
    { key: "field", label: "Job field", always: true, on: filters.field.length > 0, reset: { field: [] }, node: <MultiPick label="Job field" any="Any job field" items={FIELD_OPTIONS.map((name) => ({ value: name, label: name }))} value={filters.field} onChange={(v) => onChange({ ...filters, field: v })} /> },
    { key: "industry", label: "Employer industry", on: filters.industry.length > 0, reset: { industry: [] }, node: <MultiPick label="Employer industry" any="Any industry" items={INDUSTRIES.map((name) => ({ value: name, label: name }))} value={filters.industry} onChange={(v) => onChange({ ...filters, industry: v as Industry[] })} /> },
    {
      key: "sponsor",
      label: "IND sponsors",
      on: filters.sponsorOnly,
      reset: { sponsorOnly: false },
      node: (
        <Button type="button" variant={filters.sponsorOnly ? "default" : "outline"} aria-pressed={filters.sponsorOnly} onClick={() => onChange({ ...filters, sponsorOnly: !filters.sponsorOnly })} className="h-10 cursor-pointer">
          <BadgeCheckIcon aria-hidden="true" />
          IND sponsors
        </Button>
      ),
    },
  ]

  // Job type is hidden for now. The filter and its logic stay in place, so it can come back by removing this line.
  return defs.filter((d) => d.key !== "type")
}

/** All the filters in one place, one labelled row each, for setting job preferences. */
export function FilterEditor({ filters, onChange }: { filters: Filters; onChange: (next: Filters) => void }): React.JSX.Element {
  const defs = useFilterDefs(filters, onChange)

  return (
    <div className="flex flex-col gap-3">
      {defs.map((d) => (
        <div key={d.key} className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium">{d.label}</span>
          {d.node}
        </div>
      ))}
    </div>
  )
}

interface PickProps {
  /** The value that is the starting point, drawn plain. Anything else is a choice made and is outlined in orange. */
  rest?: string
  items: ReadonlyArray<{ value: string; label: string }>
  label: string
  onChange: (value: string) => void
  value: string
}

/**
 * A select drawn as an outline button, the same height as the toggle beside
 * it. The label is for screen readers; sighted readers get the chosen value.
 */
function Pick({ items, label, onChange, value, rest = ANY }: PickProps): React.JSX.Element {
  return (
    <Select items={items} value={value} onValueChange={(next) => onChange(next ?? ANY)}>
      <SelectTrigger
        aria-label={label}
        className={cn(buttonVariants({ variant: "outline" }), "h-10 data-[size=default]:h-10 cursor-pointer gap-2 border-border bg-background px-3 font-medium max-md:bg-card", value !== rest && "border-brand bg-accent")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value} className="cursor-pointer">
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

interface MultiPickProps {
  label: string
  /** What the button says with nothing chosen. */
  any: string
  items: ReadonlyArray<{ value: string; label: string }>
  value: ReadonlyArray<string>
  onChange: (value: string[]) => void
  /** The starting point, drawn plain like a select at rest. Anything else is a choice made and is outlined in orange. */
  rest?: ReadonlyArray<string>
  /** What the button says at the starting point. */
  restLabel?: string
}

/**
 * Several values at once, drawn as the same outline button as the single selects. Pressing a value ticks it and the
 * list stays open, so more can be chosen. Nothing ticked means any.
 */
export function MultiPick({ label, any, items, value, onChange, rest = [], restLabel }: MultiPickProps): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const atRest = value.length === rest.length && value.every((v) => rest.includes(v))
  const names = value.map((v) => items.find((i) => i.value === v)?.label ?? v)
  const shown = value.length === 0 ? any : atRest && restLabel ? restLabel : names.length <= 3 ? names.join(", ") : `${label} · ${names.length}`
  const toggle = (v: string): void => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${label}: ${shown}`}
        className={cn(buttonVariants({ variant: "outline" }), "h-10 max-w-64 cursor-pointer gap-2 border-border bg-background px-3 font-medium max-md:bg-card max-md:max-w-none", !atRest && value.length > 0 && "border-brand bg-accent")}
      >
        <span className="truncate">{shown}</span>
        <ChevronDownIcon aria-hidden="true" className="pointer-events-none size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex max-h-80 w-64 flex-col gap-0.5 overflow-y-auto p-1.5">
        {items.map((item) => {
          const on = value.includes(item.value)

          return (
            <button
              key={item.value}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(item.value)}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-accent"
            >
              <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border-[1.5px]", on ? "border-brand bg-brand text-background" : "border-border")}>{on ? <CheckIcon className="size-3" aria-hidden="true" /> : null}</span>
              <span className="truncate">{item.label}</span>
            </button>
          )
        })}
        {value.length > 0 ? (
          <button type="button" onClick={() => onChange([])} className="mt-1 cursor-pointer rounded-md border-t-[1.5px] px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
            Clear
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** The underlined "Filter" that folds the row of filters away and brings it back, with how many are set. It sits in the bar with the layout and sort buttons. */
export function FilterToggle({ open, onToggle, count }: { open: boolean; onToggle: () => void; count: number }): React.JSX.Element {
  return (
    <button type="button" aria-expanded={open} onClick={onToggle} className={`flex cursor-pointer items-center gap-1 text-sm underline underline-offset-4 hover:text-foreground max-md:h-10 max-md:gap-1.5 max-md:rounded-full max-md:border-[1.5px] max-md:px-3 max-md:font-medium max-md:no-underline ${open || count > 0 ? "max-md:border-foreground max-md:bg-foreground max-md:text-background" : "max-md:bg-card"}`}>
      <FunnelIcon className="size-4 md:hidden" aria-hidden="true" />
      Filter{count > 0 ? ` (${count})` : ""}
      <ChevronDownIcon className={`size-3.5 transition-transform duration-150 max-md:hidden ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
  )
}
