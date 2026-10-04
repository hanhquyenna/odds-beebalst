import { useState } from "react"
import { BoardIcon, CalendarIcon, ChevronDownIcon, PlusIcon, TableIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ViewLayout } from "@/lib/types"

/** What a tab needs of a view: the views of jobs and of people both have these. */
export interface TabView {
  id: string
  name: string
  layout: ViewLayout
}

export const LAYOUT_CHOICES: ReadonlyArray<{ value: ViewLayout; label: string; hint: string; Icon: typeof TableIcon }> = [
  { value: "table", label: "Table", hint: "Every property as a column. Sort, group, show what you need", Icon: TableIcon },
  { value: "list", label: "List", hint: "One line per job, with its status", Icon: TableIcon },
  { value: "board", label: "Board", hint: "Jobs in columns by status, from saved to offer", Icon: BoardIcon },
  { value: "calendar", label: "Calendar", hint: "Jobs on a month, by the day you applied, follow up, or a date of yours", Icon: CalendarIcon },
]

const iconOf = (layout: ViewLayout): typeof TableIcon => LAYOUT_CHOICES.find((c) => c.value === layout)?.Icon ?? TableIcon

interface ViewTabsProps {
  views: ReadonlyArray<TabView>
  active: TabView
  onSelect: (id: string) => void
  onAdd: (name: string, layout: ViewLayout, fromCurrent: boolean) => void
  onRename: (id: string, name: string) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  onReset: () => void
  /** What the views are over, for the tab list's name. */
  noun?: string
}

/**
 * The views of your jobs as tabs, the way a Notion database has them: each its own layout, filters and sort over the same jobs. The open tab has a menu to rename, copy or
 * delete it (the last one cannot be deleted), and "New view" at the end makes another, optionally starting from the filters you have now.
 */
export function ViewTabs({ views, active, onSelect, onAdd, onRename, onDuplicate, onRemove, onReset, noun = "jobs" }: ViewTabsProps): React.JSX.Element {
  const [menu, setMenu] = useState<boolean>(false)
  const [creating, setCreating] = useState<boolean>(false)
  const [name, setName] = useState<string>("")
  const [layout, setLayout] = useState<ViewLayout>("table")
  const [fromCurrent, setFromCurrent] = useState<boolean>(true)
  const [renaming, setRenaming] = useState<string>("")

  return (
    <div role="tablist" aria-label={`Views of your ${noun}`} className="-mx-1 flex items-end gap-1 overflow-x-auto border-b-[1.5px] px-1">
      {views.map((v) => {
        const on = v.id === active.id
        const Icon = iconOf(v.layout)

        return (
          <div key={v.id} className={`flex shrink-0 items-center border-b-2 ${on ? "border-foreground" : "border-transparent"}`}>
            <button
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSelect(v.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-t-md px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150 ${on ? "font-semibold text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"}`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {v.name}
            </button>
            {on ? (
              <Popover open={menu} onOpenChange={(o) => { setMenu(o); if (o) setRenaming(v.name) }}>
                <PopoverTrigger aria-label={`Options for ${v.name}`} className="mr-1 flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
                  <ChevronDownIcon className="size-3.5" aria-hidden="true" />
                </PopoverTrigger>
                <PopoverContent align="start" className="flex w-60 flex-col gap-1 p-2">
                  <label className="flex flex-col gap-1 text-[0.8125rem] text-muted-foreground">
                    Name
                    <input
                      aria-label="View name"
                      value={renaming}
                      onChange={(e) => setRenaming(e.target.value)}
                      onBlur={() => renaming.trim() && renaming.trim() !== v.name && onRename(v.id, renaming)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className="h-8 rounded-md border-[1.5px] bg-background px-2 text-sm text-foreground"
                    />
                  </label>
                  <button type="button" onClick={() => { onDuplicate(v.id); setMenu(false) }} className="cursor-pointer rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent">
                    Duplicate
                  </button>
                  <button
                    type="button"
                    disabled={views.length <= 1}
                    onClick={() => { onRemove(v.id); setMenu(false) }}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-left text-sm text-red-600 transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
                  >
                    Delete view
                  </button>
                  <button type="button" onClick={() => { if (window.confirm("Go back to the starting views? Views you made, and the filters you set in them, are lost.")) { onReset(); setMenu(false) } }} className="cursor-pointer rounded-md border-t-[1.5px] px-2 pt-2.5 pb-1.5 text-left text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground">
                    Reset all views
                  </button>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        )
      })}

      <Popover open={creating} onOpenChange={setCreating}>
        <PopoverTrigger className="mb-0.5 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
          <PlusIcon className="size-4" aria-hidden="true" />
          New view
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              onAdd(name, layout, fromCurrent)
              setName("")
              setCreating(false)
            }}
          >
            <p className="font-semibold">New view</p>
            <input autoFocus aria-label="Name of the new view" placeholder="Name, e.g. Waiting on a reply" value={name} onChange={(e) => setName(e.target.value)} className="h-9 rounded-md border-[1.5px] bg-background px-2.5 text-sm" />
            <div role="radiogroup" aria-label="Layout" className="flex flex-col gap-0.5">
              {LAYOUT_CHOICES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={layout === c.value}
                  onClick={() => setLayout(c.value)}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-accent ${layout === c.value ? "bg-accent" : ""}`}
                >
                  <c.Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="text-[0.8125rem] text-muted-foreground">{c.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={fromCurrent} onChange={(e) => setFromCurrent(e.target.checked)} className="size-4 cursor-pointer" />
              Start from the filters of {active.name}
            </label>
            <Button type="submit" className="cursor-pointer">
              Create view
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  )
}
