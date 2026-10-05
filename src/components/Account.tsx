import { useMemo, useState } from "react"
import { JobDrawer } from "@/components/JobBoard"
import { FilterToggle, JobFilters } from "@/components/JobFilters"
import { JobGallery } from "@/components/JobGallery"
import { BoardIcon, BookmarkIcon, CalendarIcon, UploadIcon, ChevronDownIcon, PeopleIcon, TableIcon } from "@/components/icons"
import { SearchSummary } from "@/components/InterviewMeter"
import type { ViewLayout, ViewName } from "@/lib/types"
import { ViewTabs, LAYOUT_CHOICES } from "@/components/ViewTabs"
import { FitTable, HearBackTable } from "@/components/FitTable"
import { ToolBar } from "@/components/ToolBar"
import { TrackerFilters } from "@/components/TrackerFilterBar"
import { TrackerCalendar } from "@/components/TrackerCalendar"
import { applicationOf } from "@/components/tracker-values"
import { useSavedViews } from "@/lib/use-saved-views"
import { usePeopleViews } from "@/lib/use-people-views"
import { applyTrackerFilter, isTrackerFilterOn } from "@/lib/tracker"
import { PeopleView, ToolButton } from "@/components/People"
import { choicesFor, peopleChoices, ViewControls } from "@/components/ViewSettings"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PipelineBoard, stepOf } from "@/components/PipelineBoard"
import { AddJobs, Tracker, type AddPanel } from "@/components/Tracker"
import { TrackerTable } from "@/components/TrackerTable"
import { Button } from "@/components/ui/button"
import { JobListSkeleton } from "@/components/Skeleton"
import { useData } from "@/lib/data"
import { FilterBus } from "@/lib/filter-bus"
import { activeCount, applyFilters } from "@/lib/filters"
import type { Posting } from "@/lib/types"

interface AccountProps {
  /** True in the job list, false on the account's own page. */
  looking: boolean
  onEdit: () => void
  onStartLooking: () => void
  onStopLooking: () => void
}

/**
 * The account's own page: the jobs you kept, where you applied, and what we
 * read from you. The big button goes to the jobs that fit.
 */
export function Account({ looking, onStartLooking, onStopLooking }: AccountProps): React.JSX.Element {
  const data = useData()
  const saved = useSavedViews()
  const { active, filters, configName } = saved
  const [revisit, setRevisit] = useState<Posting | null>(null)
  const [subject, setSubject] = useState<Subject>(() => remembered("subject", ["jobs", "people"], "jobs"))
  const pviews = usePeopleViews()
  // The form to add jobs of your own: opened by the small link under your jobs, or by the upload button beside Sort.
  const [addPanel, setAddPanel] = useState<AddPanel>(null)
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false)
  // Jobs have views (tabs) that each keep their own layout and filters; people keep a list or a board.
  const layout: Layout = subject === "jobs" ? active.layout : pviews.active.layout
  // The view's own settings (sort, grouping, properties) are kept per view.
  const view: ViewName = subject === "jobs" ? configName : pviews.configName
  const choose = (next: Subject): void => {
    setSubject(next)
    remember("subject", next)
  }
  const chooseLayout = (next: Layout): void => {
    if (subject === "jobs") {
      saved.setLayout(next)

      return
    }
    pviews.setLayout(next)
  }

  const kept = useMemo(() => {
    const applied = new Set(data.applications.map((a) => a.posting_id))

    // Jobs you kept that have closed since are still here, marked closed.
    return [...data.postings, ...data.keptExtra].filter((post) => data.saved.has(post.id) || applied.has(post.id))
  }, [data.postings, data.keptExtra, data.saved, data.applications])
  // The open view's filters: the usual job filters, then the ones on your own search (status, follow-up due, closed).
  const shown = useMemo(
    () =>
      applyTrackerFilter(
        applyFilters(kept, filters, { signals: data.signals, reference: data.reference }),
        active.tracker,
        (post) => stepOf(data, post),
        (post) => applicationOf(data, post),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kept, filters, active.tracker, data.signals, data.reference, data.applications],
  )
  const shownIds = useMemo(() => new Set(shown.map((p) => p.id)), [shown])
  const filtered = activeCount(filters) > 0 || isTrackerFilterOn(active.tracker)
  // How many jobs are in the pool: one plain number, the same one the job list counts from, not a personal subset of it.
  const pool = data.postings.length

  if (data.status === "loading") {
    return <JobListSkeleton />
  }

  if (looking) {
    return (
      <div className="flex w-full flex-1 flex-col gap-5">
        <div className="flex flex-1 flex-col">
          <JobGallery />
        </div>
        <div className="sticky bottom-0 z-20 -mx-5 border-t-[1.5px] bg-background px-5 py-3 sm:-mx-6 sm:px-6">
          <Button variant="ghost" onClick={onStopLooking} className="mx-auto block w-full max-w-sm cursor-pointer">
            Back to your list
          </Button>
        </div>
      </div>
    )
  }

  const filterToggle = <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen(!filtersOpen)} count={activeCount(filters) + (isTrackerFilterOn(active.tracker) ? 1 : 0)} />
  const tools = (
    <span className="flex items-center gap-2 sm:flex-wrap [&>*]:shrink-0">
      <LayoutMenu subject={subject} layout={layout} onChange={chooseLayout} />
      {subject === "people" ? (
        layout === "calendar" ? null : <ViewControls view={view} {...peopleChoices(data.profile.peopleColumns ?? [])} properties={layout === "table" ? peopleChoices(data.profile.peopleColumns ?? []).properties : []} />
      ) : (
        <>
          <ViewControls view={view} {...choicesFor(layout === "board" ? "board" : "table", data.profile.columns)} properties={layout === "table" ? choicesFor("table", data.profile.columns).properties : []} />
          <ToolButton pressed={addPanel === "upload"} onClick={() => setAddPanel(addPanel === "upload" ? null : "upload")}>
            <UploadIcon className="size-4" aria-hidden="true" />
            <span>
              Upload<span className="hidden sm:inline"> your own jobs</span>
            </span>
          </ToolButton>
        </>
      )}
    </span>
  )

  return (
    <FilterBus value={(patch) => saved.setFilters({ ...filters, ...patch })}>
    <div className="flex w-full flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col gap-8">
        <h1 className="text-2xl font-semibold tracking-tight">{data.profile.name.trim() ? `${data.profile.name.trim().split(" ")[0]}'s job search` : "Your job search"}</h1>

        <SearchSummary />

        <section aria-label="Your jobs" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SubjectSwitch subject={subject} onChange={choose} />
            </div>
          </div>

          {subject === "people" ? (
            <PeopleView onOpen={setRevisit} views={pviews} tools={tools} />
          ) : (
            <>
              <ViewTabs views={saved.views} active={active} onSelect={saved.select} onAdd={saved.add} onRename={saved.rename} onDuplicate={saved.duplicate} onRemove={saved.remove} onReset={saved.reset} />
              {kept.length > 0 ? (
                <>
                  <JobFilters search={false} open={filtersOpen} filters={filters} onChange={saved.setFilters} extra={<TrackerFilters value={active.tracker} onChange={saved.setTracker} />} />
                </>
              ) : null}
              {kept.length > 0 && layout !== "table" ? <ToolBar noun={{ one: "job", many: "jobs" }} tools={tools} lead={filterToggle} /> : null}
              {kept.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed bg-secondary/30 px-6 py-14 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-card text-brand shadow-sm">
                    <BookmarkIcon weight="fill" className="size-6" aria-hidden="true" />
                  </span>
                  <p className="text-lg font-semibold tracking-tight">Nothing saved yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">Press the bookmark on a job and it lands here with its pay, your fit and your odds. You can also add a list of your own.</p>
                  <ToolButton pressed={addPanel === "upload"} onClick={() => setAddPanel(addPanel === "upload" ? null : "upload")}>
                    <UploadIcon className="size-4" aria-hidden="true" /> Upload your own jobs
                  </ToolButton>
                </div>
              ) : layout === "board" ? (
                <PipelineBoard onOpen={setRevisit} viewName={configName} include={(post) => shownIds.has(post.id)} />
              ) : layout === "calendar" ? (
                <TrackerCalendar posts={shown} dateKey={active.dateKey ?? "applied"} onDateKey={saved.setDateKey} onOpen={setRevisit} />
              ) : shown.length === 0 ? (
                <p className="text-sm text-muted-foreground">{filtered ? "Nothing here fits these filters." : "Nothing here yet."}</p>
              ) : layout === "table" ? (
                <TrackerTable posts={shown} onOpen={setRevisit} viewName={configName} toolbar={tools} lead={filterToggle} />
              ) : (
                <Tracker posts={shown} onOpen={setRevisit} viewName={configName} />
              )}
              <AddJobs panel={addPanel} setPanel={setAddPanel} />
            </>
          )}
        </section>

        {subject === "jobs" ? <FitTable onOpen={setRevisit} /> : null}
        {subject === "jobs" ? <HearBackTable onOpen={setRevisit} /> : null}
      </div>

      {revisit ? (
        <JobDrawer post={revisit} onClose={() => setRevisit(null)} onSwitch={setRevisit} />
      ) : null}

      <div className="flex justify-center pb-4">
        <Button size="lg" onClick={onStartLooking} title={pool > 0 ? `${pool.toLocaleString()} jobs in the job pool` : undefined} className="flex w-full max-w-sm cursor-pointer">
          All jobs
          {/* The size of the job pool, so the button and the list speak about the same set. */}
          {pool > 0 ? <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">{pool.toLocaleString()}</span> : null}
        </Button>
      </div>
    </div>
    </FilterBus>
  )
}

type Subject = "jobs" | "people"
type Layout = ViewLayout

/** A choice kept in the browser so the page opens the way it was left. Without storage it simply starts at the default. */
function remembered<T extends string>(key: string, allowed: ReadonlyArray<T>, fallback: T): T {
  try {
    const value = localStorage.getItem(`odds:tracker-${key}`)

    return allowed.find((a) => a === value) ?? fallback
  } catch {
    return fallback
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(`odds:tracker-${key}`, value)
  } catch {
    // Not remembered; the choice still works for this visit.
  }
}

/** Jobs or People: two sides of the same search, each with its own list and board. */
function SubjectSwitch({ subject, onChange }: { subject: Subject; onChange: (next: Subject) => void }): React.JSX.Element {
  const items = [
    { value: "jobs", label: "Jobs", Icon: BookmarkIcon },
    { value: "people", label: "People", Icon: PeopleIcon },
  ] as const

  return (
    <div role="tablist" aria-label="Show" className="flex h-10 items-center rounded-lg border-[1.5px] bg-card p-0.5">
      {items.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={subject === value}
          onClick={() => onChange(value)}
          className={`flex h-full cursor-pointer items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-150 ${subject === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Icon className="size-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  )
}

const LAYOUTS = {
  people: [
    { value: "table", label: "Table", hint: "Every property as a column. Sort, group, show what you need", Icon: TableIcon },
    { value: "list", label: "List", hint: "Who you know, by company and job", Icon: TableIcon },
    { value: "board", label: "Board", hint: "People by step, from to contact to met", Icon: BoardIcon },
    { value: "calendar", label: "Calendar", hint: "People on a month, by the day a nudge is due or a date of yours", Icon: CalendarIcon },
  ],
} as const

/** List or board, for whichever of jobs or people is showing. */
export function LayoutMenu({ subject, layout, onChange, only }: { subject: Subject; layout: Layout; onChange: (next: Layout) => void; /** Offer only these layouts. */ only?: ReadonlyArray<Layout> }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const all: ReadonlyArray<{ value: Layout; label: string; hint: string; Icon: typeof TableIcon }> = subject === "jobs" ? LAYOUT_CHOICES : LAYOUTS.people
  const options = only ? all.filter((o) => only.includes(o.value)) : all
  const current = options.find((v) => v.value === layout) ?? options[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] bg-card px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-accent">
        <current.Icon className="size-4" aria-hidden="true" />
        {current.label}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-72 flex-col gap-0.5 p-1.5">
        {options.map((v) => (
          <button
            key={v.value}
            type="button"
            aria-pressed={v.value === layout}
            onClick={() => {
              onChange(v.value)
              setOpen(false)
            }}
            className={`flex cursor-pointer items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-150 hover:bg-accent ${v.value === layout ? "bg-accent" : ""}`}
          >
            <v.Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{v.label}</span>
              <span className="text-[0.8125rem] text-muted-foreground">{v.hint}</span>
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
