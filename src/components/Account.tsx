import { Suspense, lazy, useMemo, useState } from "react"
import { JobDrawer } from "@/components/JobBoard"
import { FilterToggle, JobFilters } from "@/components/JobFilters"
import { JobGallery } from "@/components/JobGallery"
import { BoardIcon, BookmarkIcon, BuildingsIcon, CalendarIcon, DownloadIcon, ImportExportIcon, UploadIcon, ChevronDownIcon, PeopleIcon, PlusIcon, TableIcon } from "@/components/icons"
import { SearchSummary } from "@/components/InterviewMeter"
import type { ViewLayout, ViewName } from "@/lib/types"
import { ViewTabs, LAYOUT_CHOICES } from "@/components/ViewTabs"
import { ToolBar, ToolButton } from "@/components/ToolBar"
import { TrackerFilters } from "@/components/TrackerFilterBar"
import { TrackerCalendar } from "@/components/TrackerCalendar"
import { applicationOf } from "@/components/tracker-values"
import { useSavedViews } from "@/lib/use-saved-views"
import { usePeopleViews } from "@/lib/use-people-views"
import { applyTrackerFilter, isTrackerFilterOn } from "@/lib/tracker"
import { choicesFor, peopleChoices, ViewControls } from "@/components/ViewSettings"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ColumnsBy, PipelineBoard } from "@/components/PipelineBoard"
import { STEPS, stepOf } from "@/components/job-steps"
import { AddJobs, Tracker, type AddPanel } from "@/components/Tracker"
import { TrackerTable } from "@/components/TrackerTable"
import { SimilarJobs } from "@/components/SimilarJobs"
import { ClaudePromo } from "@/components/ClaudeGuide"
import { Button } from "@/components/ui/button"
import { JobListSkeleton } from "@/components/Skeleton"
import { useData } from "@/lib/data"
import { CompaniesView } from "@/components/Companies"
import { usePhone } from "@/lib/use-phone"
import { FilterBus } from "@/lib/filter-bus"
import { activeCount, applyFilters } from "@/lib/filters"
import { readStored, store } from "@/lib/remembered"
import type { Posting } from "@/lib/types"
import { prefetchOn } from "@/lib/prefetch"
import { downloadCsv, toCsv } from "@/lib/export-csv"
import { appliedDay, overrideOf } from "@/lib/cells"
import { formatPlace } from "@/lib/format"

// Lazy: the people view is the second tab and carries the outreach tools, so the jobs open without it. Pointing at its tab fetches it.
const loadPeople = (): Promise<typeof import("@/components/People")> => import("@/components/People")
const PeopleView = lazy(() => loadPeople().then((module) => ({ default: module.PeopleView })))

const SUBJECT_KEY = "odds:tracker-subject"

interface AccountProps {
  /** True in the job list, false on the account's own page. */
  looking: boolean
  onEdit: () => void
  onStartLooking: () => void
  onStopLooking: () => void
  /** Opens the page on using odds inside Claude. */
  onOpenClaude?: () => void
}

/**
 * The account's own page: the jobs you kept, where you applied, and what we
 * read from you. The big button goes to the jobs that fit.
 */
export function Account({ looking, onStartLooking, onStopLooking, onOpenClaude }: AccountProps): React.JSX.Element {
  const data = useData()
  const saved = useSavedViews()
  const { active, filters, configName } = saved
  const [revisit, setRevisit] = useState<Posting | null>(null)
  const [subject, setSubject] = useState<Subject>(() => (readStored(SUBJECT_KEY) === "people" ? "people" : readStored(SUBJECT_KEY) === "companies" ? "companies" : "jobs"))
  const pviews = usePeopleViews()
  // The form to add jobs of your own: opened by the small link under your jobs, or by the upload button beside Sort.
  const [addPanel, setAddPanel] = useState<AddPanel>(null)
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false)
  // Jobs have views (tabs) that each keep their own layout and filters; people keep a list or a board.
  const phone = usePhone()
  const chosen: Layout = subject === "jobs" ? active.layout : pviews.active.layout
  // The people table has no phone version yet: on a phone it is drawn as the list. The jobs table has its own (TrackerTable).
  const layout: Layout = phone && subject === "people" && chosen === "table" ? "list" : chosen
  // The view's own settings (sort, grouping, properties) are kept per view.
  const view: ViewName = subject === "jobs" ? configName : pviews.configName
  const choose = (next: Subject): void => {
    setSubject(next)
    store(SUBJECT_KEY, next)
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
        <div className="sticky bottom-0 z-20 -mx-5 border-t-[1.5px] bg-background px-5 py-3 max-md:hidden sm:-mx-6 sm:px-6">
          <Button variant="ghost" onClick={onStopLooking} className="mx-auto block w-full max-w-sm cursor-pointer">
            Back to your list
          </Button>
        </div>
      </div>
    )
  }

  /** Your jobs as a spreadsheet: what every job says, where it stands, and the properties you added. Excel opens it. */
  function exportJobs(posts: ReadonlyArray<Posting>): void {
    const notes = data.profile.notes
    const own = data.profile.columns
    const typed = (post: Posting, key: string): string => overrideOf(notes, post.id, key)
    downloadCsv(
      "odds-my-jobs",
      toCsv(
        ["Job", "Company", "Status", "Location", "Posted", "Applied", "Deadline", "Pay", "Link", ...own],
        posts.map((post) => [
          typed(post, "title") || post.title,
          typed(post, "company") || post.employer_display,
          STEPS.find((s) => s.step === stepOf(data, post))?.title ?? "Saved",
          formatPlace(post.region),
          (post.posted_on ?? post.posted_at ?? "").slice(0, 10),
          appliedDay(applicationOf(data, post), typed(post, "applied")) ?? "",
          (typed(post, "deadline") || post.valid_through || "").slice(0, 10),
          post.pay_posted ?? "",
          post.url ?? "",
          ...own.map((c) => notes[post.id]?.[c] ?? ""),
        ]),
      ),
    )
  }

  const filterToggle = <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen(!filtersOpen)} count={activeCount(filters) + (isTrackerFilterOn(active.tracker) ? 1 : 0)} />
  const tools = (
    <span className="flex flex-wrap items-center gap-2 max-md:min-w-0 max-md:shrink! max-md:flex-nowrap max-md:gap-1.5 [&>*]:shrink-0">
      <LayoutMenu subject={subject} layout={layout} onChange={chooseLayout} />
      {subject === "jobs" && layout === "board" ? <ColumnsBy viewName={view} /> : null}
      {subject === "people" ? (
        layout === "calendar" ? null : <ViewControls view={view} {...peopleChoices(data.profile.peopleColumns ?? [])} properties={layout === "table" ? peopleChoices(data.profile.peopleColumns ?? []).properties : []} />
      ) : (
        <>
          <ViewControls view={view} {...choicesFor(layout === "board" ? "board" : "table", data.profile.columns)} properties={layout === "table" ? choicesFor("table", data.profile.columns).properties : []} />
          <DataMenu count={shown.length} onImport={() => setAddPanel("upload")} onAdd={() => setAddPanel("one")} onExport={() => exportJobs(shown)} />
        </>
      )}
    </span>
  )

  return (
    <FilterBus value={(patch) => saved.setFilters({ ...filters, ...patch })}>
    <div className="flex w-full flex-1 flex-col gap-6">
      <div className="flex flex-1 flex-col gap-8">
        {/* A phone has no title here: the switch sits right under the name, like an app's top tabs. */}
        <div className="md:hidden">
          <SubjectSwitch subject={subject} onChange={choose} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight max-md:hidden">{data.profile.name.trim() ? `${data.profile.name.trim().split(" ")[0]}'s job search` : "Your job search"}</h1>

        <SearchSummary />

        {onOpenClaude ? <ClaudePromo onOpen={onOpenClaude} /> : null}

        <section aria-label="Your jobs" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 max-md:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <SubjectSwitch subject={subject} onChange={choose} />
            </div>
          </div>

          {subject === "companies" ? (
            <CompaniesView />
          ) : subject === "people" ? (
            <Suspense fallback={<JobListSkeleton />}>
              <PeopleView onOpen={setRevisit} views={pviews} tools={tools} />
            </Suspense>
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
              {kept.length > 0 ? <SimilarJobs onOpen={setRevisit} /> : null}
            </>
          )}
        </section>

      </div>

      {revisit ? (
        <JobDrawer post={revisit} onClose={() => setRevisit(null)} onSwitch={setRevisit} />
      ) : null}

      <div className="flex justify-center pb-4 max-md:hidden">
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

type Subject = "jobs" | "companies" | "people"
type Layout = ViewLayout

/** Jobs, Companies or People: three sides of the same search. Companies join the other two: each one's jobs and the people you know there. */
function SubjectSwitch({ subject, onChange }: { subject: Subject; onChange: (next: Subject) => void }): React.JSX.Element {
  const items = [
    { value: "jobs", label: "Jobs", Icon: BookmarkIcon },
    { value: "companies", label: "Companies", Icon: BuildingsIcon },
    { value: "people", label: "People", Icon: PeopleIcon },
  ] as const

  return (
    <div role="tablist" aria-label="Show" className="flex h-10 items-center rounded-lg border-[1.5px] bg-card p-0.5 max-md:w-full max-md:rounded-xl max-md:border-0 max-md:bg-secondary max-md:p-1">
      {items.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={subject === value}
          onClick={() => onChange(value)}
          {...(value === "people" ? prefetchOn(loadPeople) : {})}
          className={`flex h-full cursor-pointer items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-150 max-md:flex-1 max-md:justify-center max-md:rounded-lg ${subject === value ? "bg-foreground text-background max-md:bg-card max-md:text-foreground max-md:shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
export function LayoutMenu({ subject, layout, onChange }: { subject: Subject; layout: Layout; onChange: (next: Layout) => void }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const phone = usePhone()
  // No table on a phone: it is drawn as the list there, so it is not offered.
  const options: ReadonlyArray<{ value: Layout; label: string; hint: string; Icon: typeof TableIcon }> = (subject === "jobs" ? LAYOUT_CHOICES : LAYOUTS.people).filter((v) => !(phone && subject === "people" && v.value === "table"))
  const current = options.find((v) => v.value === layout) ?? options[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] bg-card px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-accent max-md:w-10 max-md:justify-center max-md:rounded-full max-md:px-0" aria-label={`Layout: ${current.label}`}>
        <current.Icon className="size-4" aria-hidden="true" />
        <span className="max-md:sr-only">{current.label}</span>
        <ChevronDownIcon className="size-3.5 text-muted-foreground max-md:hidden" aria-hidden="true" />
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

/** Import and export, as in Notion: bring in a spreadsheet of your own jobs, add one by hand, or take this view out as a file Excel opens. */
function DataMenu({ count, onImport, onAdd, onExport }: { count: number; onImport: () => void; onAdd: () => void; onExport: () => void }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const item = "flex w-full cursor-pointer items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
  const choose = (act: () => void): void => {
    setOpen(false)
    act()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label="Import or export" className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] bg-card px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-accent max-md:w-10 max-md:justify-center max-md:rounded-full max-md:px-0">
        <ImportExportIcon className="size-4" aria-hidden="true" />
        <span className="max-md:sr-only">Import / export</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-0.5 p-1.5">
        <p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Import</p>
        <button type="button" onClick={() => choose(onImport)} className={item}>
          <UploadIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="text-sm font-medium">From a CSV file</span>
            <span className="text-[0.8125rem] text-muted-foreground">Your own list of jobs. From Excel or Google Sheets, save or download it as CSV first</span>
          </span>
        </button>
        <button type="button" onClick={() => choose(onAdd)} className={item}>
          <PlusIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="text-sm font-medium">Add a job by hand</span>
            <span className="text-[0.8125rem] text-muted-foreground">One job, with a link or without</span>
          </span>
        </button>
        <p className="mt-1 border-t-[1.5px] px-2.5 pt-2.5 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Export</p>
        <button type="button" disabled={count === 0} onClick={() => choose(onExport)} className={item}>
          <DownloadIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="flex flex-col">
            <span className="text-sm font-medium">To Excel (CSV)</span>
            <span className="text-[0.8125rem] text-muted-foreground">{count === 1 ? "The 1 job in this view" : `The ${count} jobs in this view`}, with status, dates and your notes</span>
          </span>
        </button>
      </PopoverContent>
    </Popover>
  )
}
