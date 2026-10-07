import { useMemo, useState } from "react"
import { JobBoard, JobDrawer } from "@/components/JobBoard"
import { FitTable } from "@/components/FitTable"
import { FilterEditor, JobFilters } from "@/components/JobFilters"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SortSelect } from "@/components/SortSelect"
import { InfoIcon } from "@/components/icons"
import { JobsNotice } from "@/components/JobsNotice"
import { JOB_SORTS, sortJobs, type JobSortKey } from "@/lib/sort"
import { useData } from "@/lib/data"
import { useRemembered, useStoredChoice } from "@/lib/remembered"
import { FilterBus } from "@/lib/filter-bus"
import { standing } from "@/lib/engine"
import { DEFAULT_FILTERS, activeCount, applyFilters, normalizeFilters, type JobFilters as Filters } from "@/lib/filters"
import type { Posting } from "@/lib/types"

/**
 * The jobs for you, as the same list-and-job board as the front page. Jobs whose
 * hard requirements you meet lead; those missing just one follow under their own
 * heading. Saving a job moves it to your tracker and off this list.
 */
export function JobGallery(): React.JSX.Element {
  const data = useData()
  // Preferences saved before several values could be chosen are read into the current shape.
  const stored = data.profile.prefs
  const saved = useMemo(() => (stored ? normalizeFilters(stored) : null), [stored])
  // Preferences only count once there is something in them. Ticked with nothing chosen, the list stays whole.
  const hasPrefs = Boolean(saved && activeCount(saved) > 0)
  const on = Boolean(data.profile.prefsOn) && hasPrefs
  // The board is closed with its cross and brought back from the link beside the job count, so this page holds both.
  const [noticeClosed, setNoticeClosed] = useRemembered("odds:jobs-notice-closed", window.matchMedia("(max-width: 767px)").matches)
  const [editOpen, setEditOpen] = useState<boolean>(false)
  // A job opened from the tailored list, shown in the same drawer as everywhere else.
  const [opened, setOpened] = useState<Posting | null>(null)
  // With preferences switched on the list opens with them loaded, as the same filters.
  const [filters, setFilters] = useState<Filters>(on && saved ? saved : DEFAULT_FILTERS)
  const [sort, setSort] = useStoredChoice<JobSortKey>("odds:jobs-sort", JOB_SORTS.map((s) => s.key), "newest")
  const same = JSON.stringify(filters) === JSON.stringify(saved ?? DEFAULT_FILTERS)

  const groups = useMemo(() => {
    if (!data.reference || !data.shares) {
      return { matches: [] as Posting[], outliers: [] as Posting[] }
    }
    const matches: Posting[] = []
    const outliers: Posting[] = []
    for (const post of applyFilters(data.postings, filters, { signals: data.signals, reference: data.reference })) {
      if (data.passed.has(post.id) || data.saved.has(post.id)) {
        continue
      }
      if (!on) {
        matches.push(post)
        continue
      }
      const failing = standing(post, data.profile, data.reference, data.shares, undefined, data.referrals.has(post.id)).failing
      if (failing === 0) {
        matches.push(post)
      } else if (failing === 1) {
        outliers.push(post)
      }
    }
    const ctx = { reference: data.reference, shares: data.shares, profile: data.profile, referrals: data.referrals }
    const dir = JOB_SORTS.find((o) => o.key === sort)?.dir ?? "desc"

    return { matches: sortJobs(matches, sort, dir, ctx), outliers: sortJobs(outliers, sort, dir, ctx) }
  }, [data.postings, data.passed, data.saved, data.profile, data.reference, data.shares, data.referrals, data.signals, filters, sort, on])

  const total = groups.matches.length + groups.outliers.length
  const filtered = activeCount(filters) > 0

  function toggle(next: boolean): void {
    if (next && !hasPrefs && !filtered) {
      // Nothing chosen yet: ask what they are, instead of switching on a filter that has no content.
      setEditOpen(true)

      return
    }
    data.setProfile({ ...data.profile, prefsOn: next })
    if (next && saved && !filtered) {
      setFilters(saved)
    } else if (!next && same) {
      setFilters(DEFAULT_FILTERS)
    }
  }

  return (
    <FilterBus value={(patch) => setFilters((f) => ({ ...f, ...patch }))}>
    <div className="flex w-full flex-col gap-6">
      {/* What is picked for you comes first; every job, with your chance on each, follows. */}
      <div className="-mt-10">
        <FitTable onOpen={setOpened} />
      </div>
      {opened ? <JobDrawer post={opened} onClose={() => setOpened(null)} onSwitch={setOpened} /> : null}
      <h2 className="mt-4 text-xl font-semibold tracking-tight">All jobs</h2>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <p className="text-xl font-semibold tracking-tight text-balance">
          {filtered && total === 0 ? "Nothing left with these filters." : on ? headline(groups.matches.length, groups.outliers.length) : `${total.toLocaleString()} jobs`}
          {filtered && total === 0 ? <span className="mt-0.5 block text-base font-normal text-muted-foreground">Loosen one, or clear them.</span> : null}
        </p>
        <button
          type="button"
          aria-pressed={!noticeClosed}
          onClick={() => setNoticeClosed(!noticeClosed)}
          className={`flex cursor-pointer items-center gap-1.5 text-sm font-medium underline-offset-4 hover:text-foreground hover:underline ${noticeClosed ? "text-muted-foreground" : "text-foreground underline"}`}
        >
          <InfoIcon className="size-4" aria-hidden="true" />
          where these jobs come from
        </button>
      </div>

      <JobsNotice closed={noticeClosed} onClose={() => setNoticeClosed(true)} />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border-[1.5px] bg-card px-4 py-3 max-md:hidden">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Use my job preferences
        </label>
        <Popover open={editOpen} onOpenChange={setEditOpen}>
          <PopoverTrigger className="h-8 cursor-pointer rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <span className="underline underline-offset-4">Edit</span>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-4 p-4">
            <p className="font-semibold">Your job preferences</p>
            <FilterEditor filters={filters} onChange={setFilters} />
            <div className="flex items-center justify-between gap-2 border-t-[1.5px] pt-3">
              <Button type="button" variant="ghost" onClick={() => setFilters(DEFAULT_FILTERS)} className="h-9 cursor-pointer">
                Clear all
              </Button>
              <Button type="button" onClick={() => data.setProfile({ ...data.profile, prefs: filters, prefsOn: true })} className="h-9 cursor-pointer">
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        </div>
        {filtered && !same ? (
          <button
            type="button"
            onClick={() => data.setProfile({ ...data.profile, prefs: filters, prefsOn: true })}
            className="cursor-pointer text-sm font-medium text-primary underline underline-offset-4"
          >
            Save these as my preferences
          </button>
        ) : null}
      </div>

      <JobFilters filters={filters} onChange={setFilters} trailing={<SortSelect value={sort} onChange={setSort} keys={["match", "newest", "pay", "chance", "company", "title", "level"]} />} />

      <JobBoard
        groups={
          on
            ? [
                { label: `Match your preferences (${groups.matches.length.toLocaleString()})`, jobs: groups.matches },
                { label: `Close, if you want to stretch (${groups.outliers.length.toLocaleString()})`, jobs: groups.outliers },
              ]
            : [{ jobs: groups.matches }]
        }
      />
    </div>
    </FilterBus>
  )
}

function headline(matchCount: number, outlierCount: number): string {
  const what = "what you told us"
  if (matchCount === 1) {
    return `1 job fits ${what}`
  }
  if (matchCount > 1) {
    return `${matchCount.toLocaleString()} jobs fit ${what}`
  }
  if (outlierCount > 0) {
    return "Nothing meets every requirement yet."
  }

  return "That is everything we have today."
}
