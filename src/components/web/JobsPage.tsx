import { useEffect, useMemo, useState } from "react"
import { PreferencesDialog, useFitRows } from "@/components/FitTable"
import { useFilterDefs } from "@/components/JobFilters"
import { CompanyLogo } from "@/components/CompanyMark"
import { SortSelect } from "@/components/SortSelect"
import { JobPage } from "@/components/web/JobPage"
import { addedWords } from "@/components/web/QueueButton"
import { WebButton } from "@/components/web/ui"
import { toast } from "sonner"
import { addToQueue, useApplyQueue } from "@/lib/apply-queue"
import { ChevronLeftIcon, FunnelIcon, SearchIcon, XIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { DEFAULT_FILTERS, applyFilters, type JobFilters } from "@/lib/filters"
import { withFitLanguage } from "@/lib/fit-filters"
import { formatAge, formatPlace } from "@/lib/format"
import { openLinkedInImport } from "@/lib/open-profile"
import { useStoredChoice } from "@/lib/remembered"
import { JOB_SORTS, sortJobs, type JobSortKey } from "@/lib/sort"
import { payOf } from "@/lib/spec"
import { takeJob } from "@/lib/web-nav"
import type { Posting } from "@/lib/types"

const FIRST = 20
const MORE = 20

/** The filters on the bar over the list, in the order they were drawn. The rest of them are in Preferences. */
const BAR = ["city", "level", "field", "pay", "sponsor", "posted"] as const

/**
 * The jobs: a long list on the left, the job on the right. The first five on the list are the ones that match your preferences, always;
 * then every other job. Opening a job never leaves the page, and there is no grid of cards.
 */
export function JobsPage(): React.JSX.Element {
  const data = useData()
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_FILTERS)
  const [sort, setSort] = useStoredChoice<JobSortKey>("odds:jobs-sort", JOB_SORTS.map((s) => s.key), "newest")
  // How many of the more-jobs are shown; asking for more only counts for the filters and sort it was asked under.
  const [asked, setAsked] = useState<{ key: string; n: number }>({ key: "", n: FIRST })
  const [preferences, setPreferences] = useState<boolean>(false)
  const [picked, setPicked] = useState<string | null>(() => takeJob())
  const [filterOpen, setFilterOpen] = useState<boolean>(false)
  // Several jobs picked at once for the apply queue.
  const [selecting, setSelecting] = useState<boolean>(false)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [queueing, setQueueing] = useState<boolean>(false)
  const queue = useApplyQueue(data.session !== null)
  const toggleChosen = (id: string): void => setChosen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const stopSelecting = (): void => { setSelecting(false); setChosen(new Set()) }
  const addChosen = (): void => {
    setQueueing(true)
    const ids = [...chosen]
    addToQueue(ids)
      .then((n) => { toast(addedWords(n, ids.length)); stopSelecting() })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "That did not go through. Try again."))
      .finally(() => setQueueing(false))
  }
  const fit = useFitRows()
  const defs = useFilterDefs(filters, setFilters)
  const bar = BAR.map((key) => defs.find((d) => d.key === key)).filter((d): d is NonNullable<typeof d> => Boolean(d))

  const { top, more } = useMemo(() => {
    if (!data.reference || !data.shares) return { top: [] as Posting[], more: [] as Posting[] }
    const ctx = { signals: data.signals, reference: data.reference }
    const all = applyFilters(data.postings, filters, ctx).filter((p) => !data.passed.has(p.id) && !p.closed_at)
    const ids = new Set(all.map((p) => p.id))
    const head = fit.rows.map((r) => r.post).filter((p) => ids.has(p.id)).slice(0, 5)
    const used = new Set(head.map((p) => p.id))
    const sortCtx = { reference: data.reference, shares: data.shares, profile: data.profile, referrals: data.referrals }
    const dir = JOB_SORTS.find((o) => o.key === sort)?.dir ?? "desc"

    return { top: head, more: sortJobs(all.filter((p) => !used.has(p.id)), sort, dir, sortCtx) }
  }, [data.postings, data.passed, data.profile, data.reference, data.shares, data.referrals, data.signals, filters, sort, fit.rows])

  const total = top.length + more.length
  const current = (picked ? data.byId.get(picked) ?? [...data.keptExtra].find((p) => p.id === picked) : undefined) ?? top[0] ?? more[0] ?? null
  // On a phone the list and the job take turns: a job is open only once one was picked.
  const [phoneOpen, setPhoneOpen] = useState<boolean>(() => picked !== null)
  const askKey = JSON.stringify([filters, sort])
  const shown = asked.key === askKey ? asked.n : FIRST
  // On a phone a job is a step forward from the list: the phone's Back goes back to the list, not out of the app.
  const narrow = (): boolean => window.matchMedia("(max-width: 1023px)").matches
  useEffect(() => {
    const back = (): void => setPhoneOpen(false)
    window.addEventListener("popstate", back)

    return () => window.removeEventListener("popstate", back)
  }, [])
  const open = (id: string): void => {
    setPicked(id)
    if (narrow()) {
      history.pushState({ ...(history.state ?? {}), job: id }, "")
      setPhoneOpen(true)
    }
  }

  const list = (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border-[1.5px] border-line bg-card lg:sticky lg:top-[5.25rem] lg:max-h-[calc(100svh-6.5rem)]">
      <div className="flex items-center justify-between gap-3 border-b-[1.5px] border-line/70 px-5 py-3.5 text-sm">
        <span className="text-muted-foreground tabular-nums">{total.toLocaleString()} jobs</span>
        {data.session !== null ? (
          <button type="button" aria-pressed={selecting} onClick={() => (selecting ? stopSelecting() : setSelecting(true))} className="ml-auto h-9 cursor-pointer rounded-full border-[1.5px] border-line bg-card px-3.5 text-[0.8125rem] font-extrabold hover:border-foreground/40 aria-pressed:border-brand aria-pressed:bg-accent">
            {selecting ? "Cancel" : "Select jobs"}
          </button>
        ) : null}
        <SortSelect value={sort} onChange={setSort} keys={["match", "newest", "pay", "chance", "company", "title", "level"]} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {total === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <p className="font-extrabold">No jobs match that</p>
            <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="cursor-pointer text-sm font-bold text-brand-ink underline underline-offset-4">
              Clear the search and filters
            </button>
          </div>
        ) : null}
        {fit.needsProfile ? (
          <div className="mx-2 mt-3 flex flex-col items-start gap-2 rounded-xl border-[1.5px] border-dashed border-brand bg-[#FFF8F1] p-4">
            <p className="text-sm font-bold">Import your LinkedIn or upload your CV, and your top five match jobs show here.</p>
            <button type="button" onClick={openLinkedInImport} className="h-9 cursor-pointer rounded-xl bg-brand px-4 text-[0.8125rem] font-extrabold hover:bg-[#E56E1E]">
              Import LinkedIn
            </button>
          </div>
        ) : null}
        {top.length > 0 ? (
          <section aria-label="Match your preferences" className="bg-[#FFF8F1]">
            <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
              <div className="flex flex-col">
                <h2 className="text-base font-extrabold">Match your preferences</h2>
                <span className="text-xs text-muted-foreground">Your top 5, always first</span>
              </div>
              <button type="button" onClick={() => setPreferences(true)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border-[1.5px] border-line bg-card px-3.5 text-[0.8125rem] font-extrabold hover:border-foreground/40">
                <FunnelIcon className="size-4" aria-hidden="true" /> Preferences
              </button>
            </div>
            <ul className="flex flex-col gap-2 px-2 pb-3">
              {top.map((p) => (
                <JobRow key={p.id} post={p} on={current?.id === p.id} onOpen={() => open(p.id)} pick={selecting ? { checked: chosen.has(p.id), queued: queue.byId.has(p.id), toggle: () => toggleChosen(p.id) } : undefined} />
              ))}
            </ul>
          </section>
        ) : null}
        {more.length > 0 ? (
          <section aria-label="More jobs" className="px-2 pt-4 pb-3">
            {top.length > 0 ? <h2 className="px-3 pb-2 text-base font-extrabold">More jobs</h2> : null}
            <ul className="flex flex-col gap-2">
              {more.slice(0, shown).map((p) => (
                <JobRow key={p.id} post={p} on={current?.id === p.id} onOpen={() => open(p.id)} pick={selecting ? { checked: chosen.has(p.id), queued: queue.byId.has(p.id), toggle: () => toggleChosen(p.id) } : undefined} />
              ))}
            </ul>
            {more.length > shown ? (
              <button type="button" onClick={() => setAsked({ key: askKey, n: shown + MORE })} className="mx-3 mt-3 h-11 w-[calc(100%-1.5rem)] cursor-pointer rounded-xl border-[1.5px] border-line bg-card text-sm font-extrabold hover:border-foreground/40">
                Show more jobs
              </button>
            ) : null}
          </section>
        ) : null}
      </div>
      {selecting ? (
        <div className="flex items-center justify-between gap-3 border-t-[1.5px] border-line/70 bg-card px-5 py-3">
          <span className="text-sm font-bold tabular-nums">{chosen.size} picked</span>
          <WebButton tone="primary" disabled={chosen.size === 0 || queueing} onClick={addChosen}>
            Add {chosen.size > 0 ? chosen.size : ""} to queue
          </WebButton>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-80 lg:max-w-[28.5rem]">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            placeholder="Search jobs, companies, places"
            aria-label="Search jobs, companies or places"
            className="h-[46px] w-full rounded-full border-[1.5px] border-line bg-card pr-10 pl-12 text-[0.95rem] placeholder:text-muted-foreground focus:border-brand focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {filters.query ? (
            <button type="button" aria-label="Clear the search" onClick={() => setFilters({ ...filters, query: "" })} className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </label>
        <button type="button" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-line bg-card px-4 text-sm font-extrabold lg:hidden">
          <FunnelIcon className="size-4" aria-hidden="true" /> Filters
        </button>
        <div role="group" aria-label="Filters" className={`min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:flex lg:justify-end [&_button]:rounded-full! [&_button]:border-line! [&_button]:bg-card! [&_button]:font-extrabold ${filterOpen ? "flex" : "hidden"}`}>
          {bar.map((d) => (
            <span key={d.key}>{d.node}</span>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <div className={phoneOpen ? "max-lg:hidden" : ""}>{list}</div>
        <div className={`min-w-0 ${phoneOpen ? "" : "max-lg:hidden"}`}>
          <button type="button" onClick={() => history.back()} className="mb-3 inline-flex h-10 cursor-pointer items-center gap-1 rounded-full pr-3 text-sm font-extrabold lg:hidden">
            <ChevronLeftIcon weight="bold" className="size-4" aria-hidden="true" /> All jobs
          </button>
          {current ? (
            <JobPage key={current.id} post={current} onOpenJob={(p) => setPicked(p.id)} />
          ) : (
            <div className="rounded-[18px] border-[1.5px] border-line bg-card p-10 text-center text-sm text-muted-foreground">Pick a job on the left.</div>
          )}
        </div>
      </div>

      {preferences ? <PreferencesDialog filters={withFitLanguage(fit.filters)} onChange={fit.saved.setFilters} onClose={() => setPreferences(false)} /> : null}
    </div>
  )
}

function JobRow({ post, on, onOpen, pick }: { post: Posting; on: boolean; onOpen: () => void; pick?: { checked: boolean; queued: boolean; toggle: () => void } }): React.JSX.Element {
  const data = useData()
  const pay = payOf(post, data.reference)
  const posted = post.local ? null : formatAge(post)
  const facts = [formatPlace(post.region), pay.text ? `${pay.text} ${pay.perHour ? "an hour" : "a month"}` : null, posted && posted !== "Date not shown" ? posted : null].filter(Boolean)

  return (
    <li data-job-row>
      <button
        type="button"
        aria-label={`${post.title} ${post.employer_display}`}
        aria-current={on ? "true" : undefined}
        onClick={pick ? pick.toggle : onOpen}
        aria-pressed={pick ? pick.checked : undefined}
        className={`flex w-full cursor-pointer items-start gap-3.5 rounded-xl border-[1.5px] px-3 py-3 text-left transition-colors ${on ? "border-brand bg-accent shadow-sm" : "border-line bg-card shadow-[0_1px_2px_rgba(28,26,24,0.06)] hover:border-foreground/30 hover:bg-secondary"}`}
      >
        {pick ? (
          <span aria-hidden="true" className={`mt-3 flex size-5 shrink-0 items-center justify-center rounded-md border-[1.5px] text-xs font-extrabold ${pick.checked ? "border-brand bg-brand" : "border-line bg-card"}`}>{pick.checked ? "✓" : ""}</span>
        ) : null}
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-card p-1.5 shadow-[0_0_0_1.5px_var(--line)]">
          <CompanyLogo employer={post.employer} name={post.employer_display} size={36} wide={1.1} url={post.url} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[0.95rem] leading-snug font-extrabold">{post.title}</span>
          <span className="truncate text-[0.8125rem] text-muted-foreground">{post.employer_display}</span>
          <span className="text-[0.8125rem] leading-snug text-[#4E4842]">{facts.join(" · ")}</span>
          {pick?.queued ? <span className="text-[0.75rem] font-extrabold text-brand-ink">Already in your queue</span> : null}
        </span>
      </button>
    </li>
  )
}
