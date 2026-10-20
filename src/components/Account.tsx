import { Suspense, lazy, useEffect, useMemo, useState } from "react"
import { JobDrawer } from "@/components/JobBoard"
import { JobFilters, MultiPick } from "@/components/JobFilters"
import { FunnelIcon, BoardIcon, BookmarkIcon, CalendarIcon, DownloadIcon, ImportExportIcon, UploadIcon, ChevronDownIcon, PlusIcon, TableIcon, DotsThreeVerticalIcon as MoreIcon } from "@/components/icons"
import { SearchSummary } from "@/components/InterviewMeter"
import type { ViewLayout, ViewName } from "@/lib/types"
import { NewViewButton, LAYOUT_CHOICES } from "@/components/ViewTabs"
import { ToolButton } from "@/components/ToolBar"
import { TrackerCalendar } from "@/components/TrackerCalendar"
import { applicationOf } from "@/components/tracker-values"
import { useSavedViews } from "@/lib/use-saved-views"
import { usePeopleViews } from "@/lib/use-people-views"
import { applyTrackerFilter, isTrackerFilterOn } from "@/lib/tracker"
import { APPLICATION_HIDDEN_PROPERTIES, choicesFor, peopleChoices, ViewControls } from "@/components/ViewSettings"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ColumnsBy, PipelineBoard } from "@/components/PipelineBoard"
import { STEPS, stepOf } from "@/components/job-steps"
import { AddJobs, panelWith, type AddPanel } from "@/components/Tracker"
import { TrackerTable } from "@/components/TrackerTable"
import { ClaudePromo } from "@/components/ClaudeGuide"
import { DueNow } from "@/components/DueNow"
import { ExtensionNotice } from "@/components/ExtensionNotice"
import { Insights } from "@/components/Insights"
import { HeardBack } from "@/components/HeardBack"
import { Button } from "@/components/ui/button"
import { WebButton } from "@/components/web/ui"
import { JobListSkeleton } from "@/components/Skeleton"
import { useData } from "@/lib/data"
import { CompaniesView } from "@/components/Companies"
import { usePhone } from "@/lib/use-phone"
import { FilterBus } from "@/lib/filter-bus"
import { activeCount, applyFilters } from "@/lib/filters"
import type { Posting } from "@/lib/types"
import { downloadCsv, toCsv } from "@/lib/export-csv"
import { appliedDay, overrideOf } from "@/lib/cells"
import { formatPlace } from "@/lib/format"
import { LIVE_APPLY_EVENT, peekLiveApplyPostingId, takeLiveApplyPostingId } from "@/lib/apply-nav"
import { goTo } from "@/lib/web-nav"
import { applyActivityOf, isLiveApply, useApplyActivityTick } from "@/lib/apply-activity"
import { fetchKeptPostings } from "@/lib/jobs"
import { APPLICATION_ACTIVITY_GROUPS, applicationProgress, latestApplicationAttempts, manualApplicationAttempt } from "@/lib/application-progress"
import { loadApplicationMonitor, useApplicationMonitor } from "@/lib/application-monitor"

const EMPTY_ACTIVITY_FILTER: string[] = []

const SetupCard = lazy(() => import("@/components/SetupCard").then((m) => ({ default: m.SetupCard })))

// Lazy: People sits next to Jobs under Tracker, so the jobs open without it. Pointing at its tab fetches it.
const PeopleView = lazy(() => import("@/components/People").then((module) => ({ default: module.PeopleView })))

/** Which page of the account this is: Home (the dashboard), or Tracker (Jobs / People / Companies). */
export type AccountPage = "home" | "tracker" | "people" | "companies"

interface AccountProps {
  page?: AccountPage
  onEdit: () => void
  onStartLooking: () => void
  /** Opens the page on using odds inside Claude. */
  onOpenClaude?: () => void
  /** Goes to another page of the account (the People page, from a nudge that is due). */
  onOpenPage?: (page: AccountPage) => void
  /** Goes to the Autofill or Documents tab (from a step of the setup notice). */
  onOpenTab?: (tab: "autofill" | "documents") => void
}

/**
 * The account's own page: the jobs you kept, where you applied, and what we
 * read from you. The big button goes to the jobs that fit.
 */
export function Account({ page = "home", onStartLooking, onOpenClaude, onOpenPage, onOpenTab }: AccountProps): React.JSX.Element {
  const data = useData()
  const saved = useSavedViews()
  const { active, filters, configName } = saved
  const [revisit, setRevisit] = useState<Posting | null>(null)
  const [drawerPost, setDrawerPost] = useState<Posting | null>(null)
  const [historyPostingId, setHistoryPostingId] = useState<string | null>(null)
  const monitor = useApplicationMonitor(data.session?.user.id ?? null, page === "tracker")
  const hasActivity = monitor.attempts.length > 0 || data.applications.length > 0 || Boolean(monitor.error)
  const [historyPosts, setHistoryPosts] = useState<{ userId: string; posts: Posting[] }>({ userId: "", posts: [] })
  const userId = data.session?.user.id ?? ""
  const allPosts = useMemo(() => [...new Map([...(historyPosts.userId === userId ? historyPosts.posts : []), ...data.keptExtra, ...data.postings].map((post) => [post.id, post])).values()], [data.postings, data.keptExtra, historyPosts, userId])
  const missingIds = [...new Set(monitor.attempts.map((attempt) => attempt.run.posting_id).filter((id): id is string => Boolean(id && !allPosts.some((post) => post.id === id))))].sort().join(",")
  useEffect(() => {
    if (!userId || !missingIds) return
    let cancelled = false
    void fetchKeptPostings(missingIds.split(",")).then((posts) => {
      if (!cancelled) setHistoryPosts((previous) => ({ userId: userId, posts: [...(previous.userId === userId ? previous.posts : []), ...posts] }))
    }).catch(() => undefined)

    return () => { cancelled = true }
  }, [missingIds, userId])
  // Apply with Odds: open this job’s drawer on Tracker so Applying… / Captcha / Account updates are visible.
  // Keep the pending id until the drawer closes — Strict Mode remount + empty postings would otherwise clear it too early.
  useEffect(() => {
    const openLive = (postingId: string | null): void => {
      if (!postingId) return
      const post = [...data.postings, ...data.keptExtra].find((p) => p.id === postingId)
      if (!post) return
      if (page === "tracker") setDrawerPost(post)
      else setRevisit(post)
    }
    openLive(peekLiveApplyPostingId())
    const on = (event: Event): void => {
      const id = String((event as CustomEvent<{ postingId?: string }>).detail?.postingId ?? "")
      openLive(id || peekLiveApplyPostingId())
    }
    window.addEventListener(LIVE_APPLY_EVENT, on)
    return () => window.removeEventListener(LIVE_APPLY_EVENT, on)
  }, [data.postings, data.keptExtra, page])
  // A job picked anywhere on Home or the tracker opens on the Jobs page, where the whole job is.
  useEffect(() => {
    if (!revisit) return
    if (peekLiveApplyPostingId() === revisit.id) takeLiveApplyPostingId()
    goTo("jobs", { job: revisit.id })
    setRevisit(null)
  }, [revisit])
  // Each page shows one thing: jobs, people, or companies. Home shows none of them, only what is due.
  const subject: Subject = page === "people" ? "people" : page === "companies" ? "companies" : "jobs"
  const pviews = usePeopleViews()
  // The form to add jobs of your own: opened by the small link under your jobs, or by the upload button beside Sort.
  const [addPanel, setAddPanel] = useState<AddPanel>(null)
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false)
  const [activityChoice, setActivityChoice] = useState<{ viewId: string; values: string[] }>({ viewId: "", values: [] })
  const activityFilter = activityChoice.viewId === active.id ? activityChoice.values : EMPTY_ACTIVITY_FILTER
  // Jobs have views (tabs) that each keep their own layout and filters; people keep a list or a board.
  const phone = usePhone()
  const chosen: Layout = subject === "jobs" ? active.layout : pviews.active.layout
  // The people table has no phone version yet: on a phone it is drawn as the list. The jobs table has its own (TrackerTable).
  const layout: Layout = phone && subject === "people" && chosen === "table" ? "list" : chosen
  // The view's own settings (sort, grouping, properties) are kept per view.
  const view: ViewName = subject === "jobs" ? configName : pviews.configName
  const chooseLayout = (next: Layout): void => {
    if (subject === "jobs") {
      saved.setLayout(next)

      return
    }
    pviews.setLayout(next)
  }

  const applicationTable = page === "tracker" && layout === "table" && hasActivity
  const attemptsByJob = useMemo(() => new Map(latestApplicationAttempts([...monitor.attempts, ...data.applications.map((application) => manualApplicationAttempt(application))]).map((attempt) => [attempt.run.posting_id, attempt])), [monitor.attempts, data.applications])
  const orphanedAttempts = latestApplicationAttempts(monitor.attempts).filter((attempt) => !allPosts.some((post) => post.id === attempt.run.posting_id))
  const applyTick = useApplyActivityTick()
  const kept = useMemo(() => {
    void applyTick
    const applied = new Set(data.applications.map((a) => a.posting_id))

    // Jobs you kept that have closed since are still here, marked closed.
    // Live Apply pins also show even if save state races behind the Tracker jump.
    return allPosts.filter((post) => data.saved.has(post.id) || applied.has(post.id) || monitor.attempts.some((attempt) => attempt.run.posting_id === post.id) || isLiveApply(applyActivityOf(post.id)))
    // applyTick: re-include rows when Apply activity starts/stops
  }, [allPosts, data.saved, data.applications, monitor.attempts, applyTick])
  // The open view's filters: the usual job filters, then the ones on your own search (status, follow-up due, closed).
  const shown = useMemo(
    () =>
      applyTrackerFilter(
        applyFilters(kept, filters, { signals: data.signals, reference: data.reference }),
        active.tracker,
        (post) => stepOf(data, post),
        (post) => applicationOf(data, post),
      ).filter((post) => {
        if (!activityFilter.length) return true
        const attempt = attemptsByJob.get(post.id)
        if (!attempt) return false
        if (activityFilter.includes("history") && (["stopped", "cancelled", "submitted", "failed"].includes(attempt.run.status) || attempt.source === "drive" && attempt.run.reason === "closed")) return true

        return activityFilter.includes(applicationProgress(attempt).group)
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kept, filters, active.tracker, data.signals, data.reference, data.applications, attemptsByJob, activityFilter],
  )
  const shownIds = useMemo(() => new Set(shown.map((p) => p.id)), [shown])
  const filtered = activeCount(filters) > 0 || isTrackerFilterOn(active.tracker) || activityFilter.length > 0
  // How many jobs are in the pool: one plain number, the same one the job list counts from, not a personal subset of it.
  const pool = data.postings.length

  if (data.status === "loading") {
    return <JobListSkeleton />
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

  const filterToggle = <ToolButton pressed={filtersOpen} round onClick={() => setFiltersOpen(!filtersOpen)}><FunnelIcon className="size-4" aria-hidden="true" /><span>Filter</span></ToolButton>
  const toolsSubject: "jobs" | "people" = subject === "people" ? "people" : "jobs"
  const viewCount = toolsSubject === "people" ? pviews.views.length : saved.views.length
  const tools = (
    <span className="application-tools flex flex-wrap items-center gap-2 max-md:min-w-0 max-md:shrink! max-md:flex-nowrap max-md:gap-1.5 [&>*]:shrink-0">
      {toolsSubject === "people" ? <LayoutMenu subject={toolsSubject} layout={layout} onChange={chooseLayout} /> : null}
      {toolsSubject === "jobs" && layout === "board" ? <ColumnsBy viewName={view} /> : null}
      {toolsSubject === "people" ? (
        layout === "calendar" ? null : <ViewControls view={view} {...peopleChoices(data.profile.peopleColumns ?? [])} properties={layout === "table" ? peopleChoices(data.profile.peopleColumns ?? []).properties : []} />
      ) : (
        <>
          <ViewControls view={view} {...choicesFor(layout === "board" ? "board" : "table", data.profile.columns, applicationTable)} initialHidden={applicationTable ? APPLICATION_HIDDEN_PROPERTIES : undefined} properties={layout === "table" ? choicesFor("table", data.profile.columns, applicationTable).properties : []} />
          <DataMenu extra={applicationTable && viewCount <= 1 ? <NewViewButton activeName={active.name} onAdd={saved.add} /> : undefined} refresh={applicationTable ? () => { if (userId) void loadApplicationMonitor(userId, true) } : undefined} count={shown.length} onImport={() => setAddPanel((current) => panelWith(current, "upload"))} onAdd={() => setAddPanel((current) => panelWith(current, "one"))} onExport={() => exportJobs(shown)} />
        </>
      )}
      {/* When there is only the starting view, All jobs / All people is the Tracker tab — New view sits here instead of a second tab row. */}
      {viewCount <= 1 && !applicationTable ? <NewViewButton activeName={toolsSubject === "people" ? pviews.active.name : active.name} onAdd={toolsSubject === "people" ? pviews.add : saved.add} /> : null}
    </span>
  )

  return (
    <FilterBus value={(patch) => saved.setFilters({ ...filters, ...patch })}>
    <div className="flex w-full flex-1 flex-col gap-6">
      <div className={`flex flex-1 flex-col ${page === "home" ? "gap-8" : "gap-4"}`}>
        {page === "home" ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight max-md:hidden">{data.profile.name.trim() ? `${data.profile.name.trim().split(" ")[0]}'s job search` : "Your job search"}</h1>

            <SearchSummary />

            {/* What needs attention sits right under the numbers: finishing setup, the extension being found. */}
            <Suspense fallback={null}>
              <SetupCard onJobs={onStartLooking} onOpenTab={onOpenTab} />
            </Suspense>

            <ExtensionNotice onJobs={onStartLooking} />

            <Insights framed />

            <HeardBack />

            <DueNow onOpenJob={setRevisit} onOpenPeople={() => onOpenPage?.("people")} />

            {/* Only once there is something for Claude to work on: a saved or applied job. Before that, the first thing to do is to find jobs. */}
            {onOpenClaude && kept.length > 0 ? <ClaudePromo onOpen={onOpenClaude} /> : null}
          </>
        ) : null}

        {page !== "home" ? (
        <section aria-label={page === "tracker" ? "Your jobs" : page === "people" ? "Your people" : "Companies"} className="flex flex-col gap-4">
          {subject === "companies" ? (
            <CompaniesView />
          ) : subject === "people" ? (
            <Suspense fallback={<JobListSkeleton />}>
              <PeopleView onOpen={setRevisit} views={pviews} tools={tools} />
            </Suspense>
          ) : (
            <>
              <TrackerBar layout={layout} onLayout={chooseLayout} onImport={() => setAddPanel((current) => panelWith(current, "upload"))} onAdd={() => setAddPanel((current) => panelWith(current, "one"))} />
              {kept.length > 0 ? <TrackerStats posts={kept} /> : null}
              <JobFilters search={false} open={filtersOpen} filters={filters} onChange={saved.setFilters} extra={<>{hasActivity ? <MultiPick label="Activity" any="All activity" items={APPLICATION_ACTIVITY_GROUPS} value={activityFilter} onChange={(values) => setActivityChoice({ viewId: active.id, values: values })} /> : null}</>} />
              {kept.length === 0 && !applicationTable ? (
                <div className="flex flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-line bg-card px-6 py-14 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-accent text-brand">
                    <BookmarkIcon weight="fill" className="size-6" aria-hidden="true" />
                  </span>
                  <p className="text-lg font-extrabold tracking-tight">Nothing saved yet</p>
                  <Button type="button" onClick={onStartLooking} className="cursor-pointer max-md:h-10">
                    See jobs tailored to you
                  </Button>
                  <ToolButton pressed={addPanel === "upload" || addPanel === "both"} onClick={() => setAddPanel((current) => panelWith(current, "upload"))}>
                    <UploadIcon className="size-4" aria-hidden="true" /> Upload your own jobs
                  </ToolButton>
                </div>
              ) : layout === "calendar" ? (
                <TrackerCalendar posts={shown} dateKey={active.dateKey ?? "applied"} onDateKey={saved.setDateKey} onOpen={setRevisit} />
              ) : shown.length === 0 && !applicationTable ? (
                <p className="text-sm text-muted-foreground">{filtered ? "Nothing here fits these filters." : "Nothing here yet."}</p>
              ) : layout === "table" ? (
                <TrackerTable key={data.session?.user.id} posts={shown} onOpen={(post, history) => { setHistoryPostingId(history ? post.id : null); setDrawerPost(post) }} viewName={configName} toolbar={tools} lead={filterToggle} monitor={applicationTable ? monitor : undefined} orphanedAttempts={filtered ? [] : orphanedAttempts} />
              ) : (
                <PipelineBoard onOpen={setRevisit} viewName={configName} include={(post) => shownIds.has(post.id)} />
              )}
              <AddJobs panel={addPanel} setPanel={setAddPanel} />
            </>
          )}
        </section>
        ) : null}

      </div>

      {drawerPost ? (
        <JobDrawer
          post={drawerPost}
          applicationHistoryOpen={historyPostingId === drawerPost.id}
          onClose={() => {
            if (peekLiveApplyPostingId() === drawerPost.id) takeLiveApplyPostingId()
            setDrawerPost(null)
            setHistoryPostingId(null)
          }}
          onSwitch={setDrawerPost}
        />
      ) : null}

      {page === "home" ? (
      <div className="flex justify-center pb-4 max-md:hidden">
        <Button size="lg" onClick={onStartLooking} title={pool > 0 ? `${pool.toLocaleString()} jobs in the job pool` : undefined} className="flex w-full max-w-sm cursor-pointer">
          All jobs
          {/* The size of the job pool, so the button and the list speak about the same set. */}
          {pool > 0 ? <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">{pool.toLocaleString()}</span> : null}
        </Button>
      </div>
      ) : null}
    </div>
    </FilterBus>
  )
}

type Subject = "jobs" | "companies" | "people"
type Layout = ViewLayout

const LAYOUTS = {
  people: [
    { value: "table", label: "Table", hint: "Every property as a column. Sort, group, show what you need", Icon: TableIcon },
    { value: "list", label: "List", hint: "Who you know, by company and job", Icon: TableIcon },
    { value: "board", label: "Pipeline", hint: "People by step, from to contact to met", Icon: BoardIcon },
    { value: "calendar", label: "Calendar", hint: "People on a month, by the day a nudge is due or a date of yours", Icon: CalendarIcon },
  ],
} as const

/** List or pipeline, for whichever of jobs or people is showing. */
export function LayoutMenu({ subject, layout, onChange }: { subject: "jobs" | "people"; layout: Layout; onChange: (next: Layout) => void }): React.JSX.Element {
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
function DataMenu({ count, onImport, onAdd, onExport, extra, refresh }: { count: number; onImport: () => void; onAdd: () => void; onExport: () => void; extra?: React.ReactNode; refresh?: () => void }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const item = "flex w-full cursor-pointer items-start gap-3 rounded-md px-2.5 py-2.5 text-left transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
  const choose = (act: () => void): void => {
    setOpen(false)
    act()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger aria-label={extra || refresh ? "More job actions" : "Import or export"} className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] bg-card px-3.5 text-sm font-medium transition-colors duration-150 hover:bg-accent max-md:w-10 max-md:justify-center max-md:rounded-full max-md:px-0">
        {extra || refresh ? <MoreIcon className="size-4" aria-hidden="true" /> : <ImportExportIcon className="size-4" aria-hidden="true" />}
        {extra || refresh ? null : <span className="max-md:sr-only">Import / export</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-0.5 p-1.5">
        {extra}
        {refresh ? <button type="button" className={item} onClick={() => choose(refresh)}>Refresh activity</button> : null}
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

/** The view switch, import and add buttons over the tracker. The page has no title: the bar says where you are. */
function TrackerBar({ layout, onLayout, onImport, onAdd }: { layout: Layout; onLayout: (next: Layout) => void; onImport: () => void; onAdd: () => void }): React.JSX.Element {
  const shown: Layout = layout === "list" ? "board" : layout

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      <div role="group" aria-label="Layout" className="inline-flex rounded-full border-[1.5px] border-line bg-card p-1">
        {([["board", "Board"], ["table", "Table"], ["calendar", "Calendar"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={shown === value} onClick={() => onLayout(value)} className={`h-9 cursor-pointer rounded-full px-5 text-sm font-extrabold ${shown === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
            {label}
          </button>
        ))}
      </div>
      <WebButton onClick={onImport}>Import a CSV</WebButton>
      <WebButton tone="primary" onClick={onAdd}>
        + Add a job
      </WebButton>
    </div>
  )
}

/** How many jobs are saved, applied to, at interview and at offer: counted from your own list. */
function TrackerStats({ posts }: { posts: ReadonlyArray<Posting> }): React.JSX.Element {
  const data = useData()
  const count = (...steps: string[]): number => posts.filter((p) => steps.includes(stepOf(data, p))).length

  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {([["Saved", count("saved")], ["Applied", count("applied")], ["Interviews", count("interview")], ["Offers", count("offer", "hired")]] as const).map(([label, n]) => (
        <div key={label} className="rounded-[18px] border-[1.5px] border-line bg-card px-6 py-5">
          <dt className="text-sm font-bold text-muted-foreground">{label}</dt>
          <dd className="text-[2rem] leading-tight font-extrabold tracking-tight tabular-nums">{n}</dd>
        </div>
      ))}
    </dl>
  )
}
