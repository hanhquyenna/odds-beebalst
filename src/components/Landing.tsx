import { useEffect, useMemo, useRef, useState } from "react"
import { JobFilters } from "@/components/JobFilters"
import { SortSelect } from "@/components/SortSelect"
import { JOB_SORTS, sortJobs, type JobSortKey } from "@/lib/sort"
import { JobBoard } from "@/components/JobBoard"
import { Button } from "@/components/ui/button"
import logoUrl from "@/logo.svg"
import { ResearchSlides } from "@/components/ResearchSlides"
import { useData } from "@/lib/data"
import { FilterBus } from "@/lib/filter-bus"
import { applyFilters, DEFAULT_FILTERS, type JobFilters as Filters } from "@/lib/filters"
import { jobsHeadline } from "@/lib/headline"
import type { StaticPage } from "@/lib/pages"
import type { Posting } from "@/lib/types"

interface LandingProps {
  onSignIn: () => void
  onStart: () => void
  onOpenPage?: (page: StaticPage) => void
}



/**
 * The front page: a headline, a strip of real employers gliding past under it,
 * then the list itself on a dark band.
 *
 * Anyone can browse and open a job. What the questions unlock is the personal
 * part: whether you clear it, your chance, what you keep after tax, your permit.
 */
export function Landing({ onStart, onSignIn, onOpenPage }: LandingProps): React.JSX.Element {
  const data = useData()
  const [open, setOpen] = useState<Posting | null>(null)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const jobs = data.postings
  const [sortKey, setSortKey] = useState<JobSortKey>("newest")
  const fitting = useMemo(() => {
    const kept = applyFilters(jobs, filters, { signals: data.signals, reference: data.reference })
    if (sortKey === "newest") {
      return sortFresh(kept)
    }

    return sortJobs(kept, sortKey, JOB_SORTS.find((o) => o.key === sortKey)?.dir ?? "desc", { reference: data.reference, shares: data.shares, profile: data.profile, referrals: data.referrals })
  }, [jobs, filters, sortKey, data.reference, data.shares, data.profile, data.referrals, data.signals])

  /** A new filter starts the list from the top again. */
  function refilter(next: Filters): void {
    setFilters(next)
  }

  return (
    <FilterBus value={(patch) => setFilters((f) => ({ ...f, ...patch }))}>
    <div className="flex flex-1 flex-col">
      {/* The opening statement: white, no furniture. -mt-8 undoes the main's top padding. */}
      <section className="relative left-1/2 -mt-8 w-screen -translate-x-1/2 bg-background pt-16 pb-4 sm:pt-28 sm:pb-6">
        <div className="mx-auto w-full max-w-sm px-5 sm:max-w-2xl sm:px-6 lg:max-w-6xl lg:px-10">
          <h1 className="max-w-4xl text-[clamp(3rem,8.5vw,8rem)] leading-[0.92] font-bold tracking-[-0.045em] text-balance">a job search should feel <span className="text-brand">human.</span>
            <img src={logoUrl} alt="" aria-hidden="true" className="ml-[0.15em] inline-block size-[0.82em] align-[-0.06em]" />
          </h1>
          <div className="mt-8 flex flex-col items-start gap-10 sm:gap-14">
            <Button onClick={onStart} className="h-11 cursor-pointer rounded-full px-7">
              Start
            </Button>
            <button type="button" onClick={onSignIn} className="cursor-pointer font-medium text-muted-foreground transition-colors hover:text-foreground">
              Already with us? Sign in
            </button>
            <button
              type="button"
              onClick={() => document.getElementById("film")?.scrollIntoView({ behavior: "smooth", block: "center" })}
              className="cursor-pointer text-3xl leading-[0.95] font-bold tracking-[-0.045em] transition-colors duration-200 hover:text-brand sm:text-5xl"
            >
              see how it works.
            </button>
          </div>
        </div>

            </section>

      {/* The film: where "See how it works" lands. */}
      <section id="film" aria-label="How it works" className="relative left-1/2 w-screen -translate-x-1/2 bg-background pt-0 pb-16 sm:pb-24">
        <div className="mx-auto w-full max-w-sm px-5 sm:max-w-2xl sm:px-6 lg:max-w-6xl lg:px-10">
          <HeroVideo />
        </div>
      </section>

      {jobs.length > 0 ? (
        // The band: the page changes key here, from paper to forest, and the
        // cards sit light on the dark. Full-bleed like the hero.
        <section id="jobs" aria-labelledby="jobs-heading" className="relative left-1/2 w-screen -translate-x-1/2 bg-band pt-10 pb-10 text-band-foreground sm:pt-14 sm:pb-14">
          <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-5 sm:max-w-none sm:px-8 lg:max-w-[88rem] lg:px-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-2">
                <h2 id="jobs-heading" aria-live="polite" className="text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                  {jobsHeadline(fitting.length, filters)}
                </h2>
              </div>
            </div>

            <JobFilters filters={filters} onChange={refilter} trailing={<SortSelect value={sortKey} onChange={setSortKey} keys={["newest", "pay", "company", "title", "level"]} dark />} />
            <JobBoard
              groups={[{ jobs: fitting }]}
              locked={{ onUnlock: onStart }}
              selected={open}
              onSelect={setOpen}
              empty={
                <div className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] bg-card p-6 text-foreground">
                  <p className="text-lg font-semibold tracking-tight">Nothing fits all of that yet.</p>
                  <p className="text-sm text-muted-foreground">Loosen one filter, or tell us about you and we will show you what turns up.</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => refilter(DEFAULT_FILTERS)} className="cursor-pointer">
                      Clear filters
                    </Button>
                    <Button onClick={onStart} className="cursor-pointer">
                      Start
                    </Button>
                  </div>
                </div>
              }
            />
          </div>
        </section>
      ) : null}

      <ResearchSlides onOpenPage={onOpenPage} />
    </div>
    </FilterBus>
  )
}

/** The film: plays when it scrolls into view and starts again as soon as it ends. Still picture where motion is off. */

/** 4K where the screen has the pixels for it (a retina laptop or bigger), 1080p everywhere else, so a phone or a small laptop never decodes pixels it cannot show. */
function pickFilm(): string {
  const wide = typeof window !== "undefined" ? window.screen.width * (window.devicePixelRatio || 1) : 0

  return wide >= 2400 ? "/brag/odds-4k.mp4" : "/brag/odds-1080.mp4"
}

function HeroVideo(): React.JSX.Element {
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const video = useRef<HTMLVideoElement | null>(null)
  const visible = useRef(false)
  const edge = "linear-gradient(to right, transparent, black 2%, black 98%, transparent)"

  useEffect(() => {
    const el = video.current
    if (!el || still || typeof IntersectionObserver === "undefined") {
      return
    }
    const play = (): void => {
      if (visible.current && el.paused) {
        void el.play().catch(() => undefined)
      }
    }
    // Plays while on screen and rests when scrolled away. iPhones can refuse to start a film on their own (Low Power
    // Mode, or while it is still loading), so it is tried again when it loads and on the first touch.
    const watch = new IntersectionObserver(
      (entries) => {
        visible.current = entries.some((entry) => entry.isIntersecting)
        if (visible.current) {
          play()
        } else if (!el.paused) {
          el.pause()
        }
      },
      { threshold: 0.45 },
    )
    watch.observe(el)
    el.addEventListener("canplay", play)
    window.addEventListener("touchend", play, { passive: true })

    return () => {
      watch.disconnect()
      el.removeEventListener("canplay", play)
      window.removeEventListener("touchend", play)
    }
  }, [still])

  return (
    <div className="relative mx-auto aspect-video w-full" style={{ maskImage: edge, WebkitMaskImage: edge }}>
      {still ? (
        <img src="/brag/odds-poster.jpg" alt="odds: every job board in one list, your interview odds, built for international students" className="absolute inset-0 size-full object-cover" />
      ) : (
        <video
          ref={video}
          className="absolute inset-0 size-full object-cover"
          src={pickFilm()}
          poster="/brag/odds-poster.jpg"
          muted
          playsInline
          loop
          preload="auto"
          aria-label="A short film: every job board in one list, your interview odds, built for international students"
        />
      )}
    </div>
  )
}

/**
 * Newest first, strictly: a job posted today is never below one posted yesterday, and postings with no age go last.
 * Among jobs of the same age the employers are dealt out one at a time, so a day with thirty openings at one company
 * does not read as thirty in a row.
 */
function sortFresh(posts: ReadonlyArray<Posting>): ReadonlyArray<Posting> {
  const byAge = new Map<number, Posting[]>()
  for (const post of posts) {
    const age = post.days_open ?? Number.POSITIVE_INFINITY
    byAge.set(age, [...(byAge.get(age) ?? []), post])
  }
  const out: Posting[] = []
  for (const age of [...byAge.keys()].sort((a, b) => a - b)) {
    const queues = new Map<string, Posting[]>()
    for (const post of byAge.get(age) ?? []) {
      queues.set(post.employer, [...(queues.get(post.employer) ?? []), post])
    }
    const day = [...queues.values()]
    for (let round = 0; day.some((q) => q[round]); round++) {
      for (const q of day) {
        if (q[round]) {
          out.push(q[round])
        }
      }
    }
  }

  return out
}
