import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AboutCompany } from "@/components/CompanyInsights"
import { CompanyLogo } from "@/components/CompanyMark"
import { JobDrawer, JobRow } from "@/components/JobBoard"
import { PersonAvatar } from "@/components/PersonAvatar"
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { formatPlace } from "@/lib/format"
import { industryOf } from "@/lib/industries"
import type { Person, Posting } from "@/lib/types"

/** One employer, with everything of yours that touches it: its open jobs, the ones you kept or applied to, and the people you know there. */
export interface Company {
  key: string
  name: string
  open: Posting[]
  /** Jobs you saved or applied to here, closed ones included. */
  yours: Posting[]
  people: Person[]
  industry: string | null
  city: string | null
  sponsor: boolean
  /** A job to read the employer's facts from. Absent for a company known only from your people. */
  sample: Posting | null
}

const PAGE = 40
const norm = (s: string): string => s.trim().toLowerCase()

/** Every company in the job pool and in your own search, linked to its jobs and people. Yours come first, then the most open jobs. */
export function useCompanies(): Company[] {
  const data = useData()

  return useMemo(() => {
    const applied = new Set(data.applications.map((a) => a.posting_id))
    const byKey = new Map<string, Company>()
    const byName = new Map<string, string>()
    const ensure = (key: string, name: string, sample: Posting | null): Company => {
      let c = byKey.get(key)
      if (!c) {
        c = { key, name, open: [], yours: [], people: [], industry: null, city: null, sponsor: false, sample }
        byKey.set(key, c)
        byName.set(norm(name), key)
      }

      return c
    }
    const all = [...data.postings, ...data.keptExtra]
    const inPool = new Set(data.postings.map((p) => p.id))
    const seen = new Set<string>()
    for (const post of all) {
      if (seen.has(post.id)) continue
      seen.add(post.id)
      const c = ensure(post.employer, post.employer_display, post)
      if (!post.closed_at && inPool.has(post.id)) c.open.push(post)
      if (data.saved.has(post.id) || applied.has(post.id)) c.yours.push(post)
      c.sponsor ||= post.ind_sponsor
    }
    const jobEmployer = new Map(all.map((p) => [p.id, p.employer]))
    for (const person of data.people) {
      const key = (person.jobId && jobEmployer.get(person.jobId)) || byName.get(norm(person.company)) || (person.company.trim() ? `person:${norm(person.company)}` : null)
      if (!key) continue
      ;(byKey.get(key) ?? ensure(key, person.company.trim(), null)).people.push(person)
    }
    for (const c of byKey.values()) {
      const sample = c.open[0] ?? c.yours[0] ?? c.sample
      c.sample = sample
      c.industry = sample ? industryOf(sample) : null
      const cities = new Map<string, number>()
      for (const p of c.open) {
        const city = formatPlace(p.region).split(",")[0].trim()
        if (city && city !== "Location not stated") cities.set(city, (cities.get(city) ?? 0) + 1)
      }
      c.city = [...cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    }
    const mine = (c: Company): number => c.yours.length + c.people.length

    return [...byKey.values()].sort((a, b) => Number(mine(b) > 0) - Number(mine(a) > 0) || b.open.length - a.open.length || a.name.localeCompare(b.name))
  }, [data.postings, data.keptExtra, data.saved, data.applications, data.people])
}

/** The list of companies: a search, then one row each, edge to edge on a phone like every other list. Pressing a row opens the company's card. */
export function CompaniesView(): React.JSX.Element {
  const companies = useCompanies()
  const [query, setQuery] = useState<string>("")
  const [onlyMine, setOnlyMine] = useState<boolean>(false)
  const [limit, setLimit] = useState<number>(PAGE)
  const [open, setOpen] = useState<Company | null>(null)
  const q = norm(query)
  const shown = companies.filter((c) => (!onlyMine || c.yours.length + c.people.length > 0) && (!q || norm(c.name).includes(q) || (c.industry ? norm(c.industry).includes(q) : false) || (c.city ? norm(c.city).includes(q) : false)))
  const mineCount = companies.filter((c) => c.yours.length + c.people.length > 0).length
  // The card follows the data: a job saved from inside it shows at once.
  const current = open ? (companies.find((c) => c.key === open.key) ?? open) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE)
          }}
          placeholder="Search companies, industries or cities"
          aria-label="Search companies"
          className="h-12 w-full rounded-xl border-[1.5px] bg-card pr-10 pl-11 text-base placeholder:text-muted-foreground focus:border-ring focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button type="button" aria-label="Clear the search" onClick={() => setQuery("")} className="absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground tabular-nums">
          {shown.length.toLocaleString()} {shown.length === 1 ? "company" : "companies"}
        </span>
        <button
          type="button"
          aria-pressed={onlyMine}
          onClick={() => setOnlyMine(!onlyMine)}
          disabled={mineCount === 0}
          className={`h-9 cursor-pointer rounded-full border-[1.5px] px-4 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${onlyMine ? "border-foreground bg-foreground text-background" : "bg-card"}`}
        >
          Yours{mineCount > 0 ? ` (${mineCount})` : ""}
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No company matches that.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card max-md:-mx-5 max-md:rounded-none max-md:border-x-0">
          {shown.slice(0, limit).map((c) => (
            <li key={c.key} className="relative after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border last:after:hidden md:after:left-4">
              <CompanyRow company={c} onOpen={() => setOpen(c)} />
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit ? (
        <button type="button" onClick={() => setLimit(limit + PAGE)} className="mx-auto h-11 cursor-pointer rounded-full border-[1.5px] bg-card px-6 text-sm font-semibold">
          Show {Math.min(PAGE, shown.length - limit)} more
        </button>
      ) : null}

      {current ? <CompanyCard company={current} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}

/** One company, drawn like a job row: logo, name, then the lines and tags in the same type as every job list. */
function CompanyRow({ company: c, onOpen }: { company: Company; onOpen: () => void }): React.JSX.Element {
  const applied = useAppliedCount(c)
  const saved = c.yours.length - applied

  return (
    <div className="relative flex items-center gap-4 px-3 py-4 transition-colors duration-150 hover:bg-accent/60 max-md:px-4 @2xl:px-5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 pr-10 text-left after:absolute after:inset-0 after:content-['']">
        <span className="flex size-12 shrink-0 items-center justify-center">
          <CompanyLogo employer={c.sample?.employer ?? c.name} name={c.name} size={48} wide={1.3} url={c.sample?.url} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-base leading-snug font-semibold">{c.name}</span>
          {c.industry ? <span className="truncate text-[0.95rem]">{c.industry}</span> : null}
          {c.city ? <span className="truncate text-sm text-muted-foreground">{c.city}</span> : null}
          {c.sponsor || saved > 0 || applied > 0 || c.people.length > 0 ? (
            <span className="flex flex-wrap gap-1.5 py-0.5">
              {c.sponsor ? <Tag brand>Visa sponsor</Tag> : null}
              {saved > 0 ? <Tag>{saved} saved</Tag> : null}
              {applied > 0 ? <Tag>{applied} applied</Tag> : null}
              {c.people.length > 0 ? <Tag>{c.people.length} {c.people.length === 1 ? "person" : "people"}</Tag> : null}
            </span>
          ) : null}
          <span className={c.open.length > 0 ? "text-sm font-medium text-good-foreground" : "text-sm text-muted-foreground"}>{c.open.length === 0 ? "No open jobs" : `${c.open.length} open ${c.open.length === 1 ? "job" : "jobs"}`}</span>
        </span>
      </button>
      <ChevronRightIcon className="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
    </div>
  )
}

/** The small square tag the job rows use ("Dutch needed"): orange for what matters to a visa, plain for counts of yours. */
function Tag({ brand, children }: { brand?: boolean; children: React.ReactNode }): React.JSX.Element {
  return <span className={`w-fit rounded-md border-[1.5px] px-2 py-0.5 text-xs font-medium ${brand ? "border-brand/60 bg-brand/10" : "border-line bg-secondary/60"}`}>{children}</span>
}

function useAppliedCount(c: Company): number {
  const data = useData()
  const applied = new Set(data.applications.map((a) => a.posting_id))

  return c.yours.filter((p) => applied.has(p.id)).length
}

/**
 * Everything about one company on one card, in the order you need it: who the company is, the people you know there, then your jobs there and every open one.
 * Full screen on a phone, a panel from the right on a wider screen, like a job.
 */
function CompanyCard({ company: c, onClose }: { company: Company; onClose: () => void }): React.JSX.Element {
  const data = useData()
  const [job, setJob] = useState<Posting | null>(null)
  const applied = useAppliedCount(c)

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.body.style.overflow = previous
    }
  }, [])
  useEffect(() => {
    // Escape closes the job first when one is open over the card.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !job) onClose()
    }
    window.addEventListener("keydown", onKey)

    return () => window.removeEventListener("keydown", onKey)
  }, [job, onClose])

  const yoursIds = new Set(c.yours.map((p) => p.id))
  const otherOpen = c.open.filter((p) => !yoursIds.has(p.id))
  const stats = [
    { label: "Open jobs", n: c.open.length },
    { label: "Saved", n: c.yours.length - applied },
    { label: "Applied", n: applied },
    { label: "People", n: c.people.length },
  ]

  return createPortal(
    <div className="fixed inset-0 z-40 text-foreground">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[oklch(0.2_0.03_265_/_0.5)] animate-in fade-in duration-200" />
      <aside role="dialog" aria-modal="true" aria-label={c.name} className="absolute inset-y-0 right-0 flex w-full max-w-[46rem] flex-col overflow-y-auto bg-background shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b-[1.5px] bg-background/95 px-2 pt-[calc(env(safe-area-inset-top)+0.375rem)] pb-1.5 backdrop-blur md:px-6 md:py-3">
          <button type="button" onClick={onClose} className="flex h-10 cursor-pointer items-center gap-0.5 rounded-full pr-3 pl-1 text-[0.95rem] font-semibold text-brand-ink md:hidden">
            <ChevronLeftIcon weight="bold" className="size-5" aria-hidden="true" />
            Companies
          </button>
          <span className="hidden text-sm font-medium text-muted-foreground md:inline">Company</span>
          <button type="button" aria-label="Close" onClick={onClose} className="hidden size-9 cursor-pointer items-center justify-center rounded-full border-[1.5px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground md:flex">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-6 px-5 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-8">
          <header className="flex items-center gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-line bg-card">
              <CompanyLogo employer={c.sample?.employer ?? c.name} name={c.name} size={40} wide={1.2} url={c.sample?.url} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-2xl leading-tight font-bold tracking-tight">{c.name}</h2>
              <p className="text-sm text-muted-foreground">{[c.industry, c.city].filter(Boolean).join(" · ") || "Industry not known"}</p>
              {c.sponsor ? <span className="w-fit rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand-ink">Recognised visa sponsor (IND)</span> : null}
            </div>
          </header>

          <dl className="grid grid-cols-4 overflow-hidden rounded-xl border-[1.5px] border-line bg-card max-md:-mx-5 max-md:rounded-none max-md:border-x-0">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-0.5 border-l-[1.5px] border-line px-3 py-3 first:border-l-0">
                <dd className="text-2xl leading-none font-bold tabular-nums">{s.n}</dd>
                <dt className="truncate text-xs font-semibold text-muted-foreground">{s.label}</dt>
              </div>
            ))}
          </dl>

          {c.sample ? <AboutCompany post={c.sample} /> : null}

          <CardSection title="People you know here" count={c.people.length}>
            {c.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one yet. Add someone from People, and link them to {c.name}.</p>
            ) : (
              <ul className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card max-md:-mx-5 max-md:rounded-none max-md:border-x-0">
                {c.people.map((p) => {
                  const linked = p.jobId ? data.byId.get(p.jobId) : undefined

                  return (
                    <li key={p.id} className="flex items-center gap-3 border-b-[1.5px] border-line px-4 py-3 last:border-b-0">
                      <PersonAvatar name={p.name} photo={p.photo} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-semibold">{p.name}</span>
                        <span className="truncate text-sm text-muted-foreground">{[p.role, linked ? `for ${linked.title}` : null].filter(Boolean).join(" · ") || p.contact || " "}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">{p.status}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardSection>

          {c.yours.length > 0 ? (
            <CardSection title="Your jobs here">
              <JobList posts={c.yours} onOpen={setJob} status />
            </CardSection>
          ) : null}

          <CardSection title={c.yours.length > 0 ? "Other open jobs" : "Open jobs"} count={otherOpen.length}>
            {otherOpen.length === 0 ? <p className="text-sm text-muted-foreground">{c.open.length === 0 ? "No open jobs in the list right now." : "You have every open job here in your list."}</p> : <JobList posts={otherOpen} onOpen={setJob} status />}
          </CardSection>

        </div>
      </aside>
      {job ? <JobDrawer key={job.id} post={job} onClose={() => setJob(null)} onSwitch={setJob} /> : null}
    </div>,
    document.body,
  )
}

function CardSection({ title, count, children }: { title: string; count?: number; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-baseline gap-2 text-lg font-bold tracking-tight">
        {title}
        {count !== undefined ? <span className="text-base font-medium text-muted-foreground tabular-nums">{count}</span> : null}
      </h3>
      {children}
    </section>
  )
}

/** Jobs drawn as the same rows as every other list, with each one's status under it when asked. */
function JobList({ posts, onOpen, status }: { posts: ReadonlyArray<Posting>; onOpen: (post: Posting) => void; status?: boolean }): React.JSX.Element {
  const [all, setAll] = useState<boolean>(false)
  const shown = all ? posts : posts.slice(0, 5)

  return (
    <div className="flex flex-col gap-2">
      <ul className="@container overflow-hidden rounded-xl border-[1.5px] border-line bg-card max-md:-mx-5 max-md:rounded-none max-md:border-x-0">
        {shown.map((post) => (
          <li key={post.id} className="relative after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border last:after:hidden md:after:left-4">
            <JobRow post={post} onOpen={() => onOpen(post)} status={status} />
          </li>
        ))}
      </ul>
      {posts.length > 5 && !all ? (
        <button type="button" onClick={() => setAll(true)} className="w-fit cursor-pointer text-sm font-semibold text-brand-ink underline underline-offset-4">
          Show all {posts.length}
        </button>
      ) : null}
    </div>
  )
}
