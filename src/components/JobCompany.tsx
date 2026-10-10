import { useState } from "react"
import { ExternalLinkIcon, StarIcon, XIcon } from "@/components/icons"
import { PersonAvatar } from "@/components/PersonAvatar"
import { Section } from "@/components/Section"
import { NEWS_LABEL, useCompanyProfile, type NewsLabel } from "@/lib/company-profile"
import { companyMoney, companyNews, moneyText } from "@/lib/company-numbers"
import { useData } from "@/lib/data"
import { useCompanyMore, useJobCompany, usePastHires, type PastHire, type Review } from "@/lib/job-company"
import { atEmployer, byNewest, englishFirst, monthYear, reviewerStatus } from "@/lib/past-roles"
import type { Posting } from "@/lib/types"

/**
 * The three parts of a job's page about who you would join: the people who got this role before, the company as its own page
 * describes it, and what people who work there say. All of it is shown as scraped (src/lib/job-company.ts), nothing rewritten.
 */

/** "NIKE, INC." and "Nike", "Adyen N.V." and "adyen": the same name once legal forms and punctuation are dropped. */
const bareName = (n: string): string => n.toLowerCase().replace(/\b(n\.?v\.?|b\.?v\.?|inc|ltd|plc|llc|gmbh|ag|s\.?a|se|corp(oration)?|holdings?|group|company|co)\b\.?/g, "").replace(/[^a-z0-9]+/g, "")
const sameName = (a: string, b: string): boolean => {
  const x = bareName(a)
  const y = bareName(b)

  return x !== "" && y !== "" && (x === y || x.startsWith(y) || y.startsWith(x))
}

const host = (url: string): string => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")

const card = "rounded-xl border-[1.5px] bg-card"

/** "part_time" -> "Part-time"; "other" and unknown kinds are left out. */
const KINDS: Record<string, string> = { full_time: "Full-time", part_time: "Part-time", internship: "Internship", traineeship: "Traineeship", freelance: "Freelance", self_employed: "Self-employed", contract: "Contract", apprenticeship: "Apprenticeship", seasonal: "Seasonal", volunteer: "Volunteer", permanent: "Permanent", permanent_full_time: "Full-time", co_op: "Co-op", working_student: "Working student" }
const kindOf = (t: string | null): string | null => (t ? (KINDS[t.toLowerCase().replace(/[\s-]+/g, "_")] ?? null) : null)

// --- People who got this role ---------------------------------------------------------------------------------------

/** Avatars of the people whose public history shows this role, or one very like it, at this employer. Each opens their whole path. */
export function PastHires({ post }: { post: Posting }): React.JSX.Element | null {
  const { session } = useData()
  const people = usePastHires(post.id, session !== null)
  const [open, setOpen] = useState<PastHire | null>(null)
  if (people === undefined) return null

  return (
    <Section title="People who got this role">
      {session === null ? (
        <p className="text-sm text-muted-foreground">Sign in to see who got this role before and the path that got them here.</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-muted-foreground">We have not found anyone who held this role yet.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted-foreground">From their public LinkedIn profiles. Tap someone to see the path that got them here.</p>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {people.map((p) => {
              const here = p.experience.find((r) => atEmployer(r, post.employer, post.employer_display))

              return (
                <li key={p.id} className="shrink-0">
                  <button type="button" onClick={() => setOpen(p)} className={`${card} flex w-40 cursor-pointer flex-col items-center gap-2 px-3 py-4 text-center transition-colors duration-150 hover:bg-accent`}>
                    <PersonAvatar name={p.name ?? "?"} photo={p.avatar ?? undefined} size="lg" />
                    <span className="line-clamp-1 text-sm font-semibold">{p.name ?? "Name not public"}</span>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{here?.title ?? p.currentPosition ?? p.headline ?? ""}</span>
                    {here ? <span className="text-xs text-muted-foreground">{[monthYear(here.start), here.current ? "now" : monthYear(here.end)].filter(Boolean).join(" – ")}</span> : null}
                    <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-medium ${p.status === "exact" ? "bg-brand/10 text-brand" : "bg-secondary text-muted-foreground"}`}>{p.status === "exact" ? "Same role" : "Similar role here"}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {open ? <HireDialog person={open} post={post} onClose={() => setOpen(null)} /> : null}
    </Section>
  )
}

/** One person's whole path: every job and school, newest first, with the roles at this employer marked. */
function HireDialog({ person, post, onClose }: { person: PastHire; post: Posting; onClose: () => void }): React.JSX.Element {
  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={person.name ?? "Profile"} onKeyDown={(e) => e.key === "Escape" && onClose()} className={`${card} flex max-h-[90vh] w-full max-w-lg flex-col shadow-lg`}>
        <div className="flex items-start gap-4 border-b-[1.5px] px-5 py-4">
          <PersonAvatar name={person.name ?? "?"} photo={person.avatar ?? undefined} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-tight">{person.name ?? "Name not public"}</h2>
            {person.headline ? <p className="text-sm">{person.headline}</p> : null}
            {person.location ? <p className="text-sm text-muted-foreground">{person.location}</p> : null}
            {person.linkedin ? (
              <a href={person.linkedin} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm underline underline-offset-4">
                LinkedIn profile <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <h3 className="mb-2 text-sm font-semibold">Experience</h3>
          {person.experience.length === 0 ? <p className="text-sm text-muted-foreground">Not public.</p> : null}
          <ol className="relative flex flex-col gap-3 border-l-[1.5px] pl-4">
            {byNewest(person.experience).map((r, i) => {
              const here = atEmployer(r, post.employer, post.employer_display)

              return (
                <li key={i} className="relative">
                  <span className={`absolute -left-[1.3rem] top-1.5 size-2.5 rounded-full ${here ? "bg-brand" : "bg-border"}`} aria-hidden="true" />
                  <p className={`text-sm font-medium ${here ? "text-brand" : ""}`}>{r.title ?? "Role not stated"}</p>
                  <p className="text-sm">{r.employer}{kindOf(r.type) ? <span className="text-muted-foreground"> · {kindOf(r.type)}</span> : null}</p>
                  <p className="text-xs text-muted-foreground">{[monthYear(r.start), r.current ? "now" : monthYear(r.end)].filter(Boolean).join(" – ")}</p>
                  {here ? <p className="mt-0.5 text-xs font-medium text-brand">At {post.employer_display}</p> : null}
                </li>
              )
            })}
          </ol>
          {person.education.length > 0 ? (
            <>
              <h3 className="mb-2 mt-5 text-sm font-semibold">Education</h3>
              <ul className="flex flex-col gap-2">
                {person.education.map((e, i) => (
                  <li key={i}>
                    <p className="text-sm font-medium">{e.school}</p>
                    <p className="text-sm text-muted-foreground">{[e.degree, e.field].filter(Boolean).join(", ")}{e.start || e.end ? ` · ${[monthYear(e.start), monthYear(e.end)].filter(Boolean).join(" – ")}` : ""}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="mt-6 text-xs text-muted-foreground">
            From this person's public LinkedIn profile. Is this you and want it removed?{" "}
            <a href={`mailto:hello@odds.nl?subject=${encodeURIComponent("Remove my profile")}&body=${encodeURIComponent(`Please remove my profile (${person.linkedin ?? person.id}) from odds.`)}`} className="underline underline-offset-4">
              Ask us to remove it
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

// --- The company --------------------------------------------------------------------------------------------------

function Fact({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 border-t py-2 first:border-t-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  )
}

/** One number with what it is, the way a finance page shows a company: big value, small label, year and source under it. */
function Tile({ label, value, note }: { label: string; value: string; note?: string | null }): React.JSX.Element {
  return (
    <div className={`${card} min-w-0 px-4 py-3`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}

/**
 * The company for someone deciding whether to apply: what it is in its own words, how big and how valuable it is, whether it is growing,
 * and what has happened to it lately. Facts as scraped: its LinkedIn page, Wikidata, GLEIF, the IND register, news, and our own count of its jobs.
 */
export function CompanySection({ post }: { post: Posting }): React.JSX.Element | null {
  const company = useJobCompany(post.employer, post.employer_display)
  const file = useCompanyProfile(post.employer)
  const extra = useCompanyMore(post.employer)
  const data = useData()
  const [more, setMore] = useState<boolean>(false)
  const [allNews, setAllNews] = useState<boolean>(false)
  if (company === undefined) return null
  const f = company?.facts ?? null
  const money = companyMoney(company?.money ?? [], file, extra?.money)
  const news = companyNews(company?.news ?? [], extra?.news)
  const description = f?.description?.trim() ?? ""
  const long = description.length > 420
  const places = (f?.locations ?? []).map((l) => [l.city, l.country].filter(Boolean).join(", ")).filter(Boolean)
  const employees = f?.employees ?? file?.employees ?? extra?.employees?.count ?? null
  // The group it belongs to, unless that is the company itself ("NIKE, INC." for Nike).
  const owner = [file?.ownerGroup, file?.parent, extra?.parent].find((o): o is string => Boolean(o) && !sameName(o as string, f?.name ?? post.employer_display) && !sameName(o as string, post.employer_display)) ?? null
  const open = data.postings.filter((p) => p.employer === post.employer)
  const recent = open.filter((p) => p.days_open !== null && p.days_open !== undefined && p.days_open <= 30).length
  const counts = file?.newsCounts ?? {}
  const signals = (Object.entries(counts) as Array<[NewsLabel, number]>).filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1])
  const tiles = [
    money.revenue ? { label: "Revenue", value: moneyText(money.revenue), note: [money.revenue.year, money.revenue.source].filter(Boolean).join(" · ") } : null,
    money.profit ? { label: "Profit", value: moneyText(money.profit), note: [money.profit.year, money.profit.source].filter(Boolean).join(" · ") } : null,
    money.marketValue ? { label: "Market value", value: moneyText(money.marketValue), note: [money.marketValue.year, money.marketValue.source].filter(Boolean).join(" · ") } : null,
    employees ? { label: "Employees", value: Math.round(employees).toLocaleString("en-US"), note: f?.employees ? "on LinkedIn" : null } : f?.employeeRange ? { label: "Employees", value: f.employeeRange, note: "stated" } : null,
    f?.founded ?? file?.founded ?? extra?.founded ? { label: "Founded", value: String(f?.founded ?? file?.founded ?? extra?.founded), note: null } : null,
  ].filter((t): t is { label: string; value: string; note: string | null } => t !== null)

  if (!f && tiles.length === 0 && news.length === 0) {
    return (
      <Section title={`About ${post.employer_display}`}>
        <p className="text-sm text-muted-foreground">We have no company page for {post.employer_display} yet.</p>
        <p className="mt-2 text-sm">{post.ind_sponsor ? "Recognised visa sponsor (IND register)." : "Not on the IND register of recognised sponsors."}</p>
      </Section>
    )
  }

  return (
    <Section title={`About ${f?.name ?? post.employer_display}`}>
      {f?.tagline ? <p className="mb-2 font-medium">{f.tagline}</p> : null}
      {description ? (
        <p className="whitespace-pre-line leading-relaxed">
          {long && !more ? `${description.slice(0, 420).trim()}…` : description}
          {long ? (
            <button type="button" onClick={() => setMore(!more)} className="ml-1 cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              {more ? "Less" : "More"}
            </button>
          ) : null}
        </p>
      ) : null}

      {tiles.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((t) => (
            <Tile key={t.label} label={t.label} value={t.value} note={t.note} />
          ))}
        </div>
      ) : null}

      <dl className={`${card} mt-4 px-4 py-1 text-sm`}>
        {f?.industry ?? file?.industry?.[0] ? <Fact label="Industry">{f?.industry ?? file?.industry?.[0]}</Fact> : null}
        {f?.type ? <Fact label="Company type">{f.type}</Fact> : null}
        {(file?.listedOn ?? extra?.listedOn ?? []).length > 0 ? <Fact label="Listed on">{[...new Set(file?.listedOn ?? extra?.listedOn ?? [])].join(", ")}</Fact> : null}
        {owner ? <Fact label="Part of">{owner}{file?.ownerCountry ? ` (${file.ownerCountry})` : ""}</Fact> : null}
        {f?.headquarters ?? file?.hq ? <Fact label="Headquarters">{f?.headquarters ?? file?.hq}</Fact> : null}
        {places.length > 0 ? <Fact label="Offices">{places.slice(0, 6).join(" · ")}{places.length > 6 ? ` and ${places.length - 6} more` : ""}</Fact> : null}
        <Fact label="Visa sponsor">{post.ind_sponsor ? "Yes, on the IND register of recognised sponsors" : "Not on the IND register"}</Fact>
        {f?.website ?? file?.website ? (
          <Fact label="Website">
            <a href={(f?.website ?? file?.website) as string} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              {host((f?.website ?? file?.website) as string)}
            </a>
          </Fact>
        ) : null}
      </dl>

      <div className="mt-5">
        <h3 className="mb-2 text-base font-semibold tracking-tight">Growth</h3>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>
            {open.length} open {open.length === 1 ? "job" : "jobs"} here on odds{recent > 0 ? `, ${recent} posted in the last 30 days` : ""}.
          </li>
          {signals.length > 0 ? <li>In the news lately: {signals.map(([k, n]) => `${NEWS_LABEL[k].toLowerCase()} (${n})`).join(", ")}.</li> : null}
          {file?.gptw2026 ? <li>On the Great Place to Work list, Netherlands 2026.</li> : null}
        </ul>
      </div>

      {news.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-2 text-base font-semibold tracking-tight">Latest news</h3>
          <ul className="flex flex-col divide-y-[1.5px] border-y-[1.5px]">
            {news.slice(0, allNews ? 15 : 4).map((n) => (
              <li key={n.url ?? n.title} className="py-2.5">
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline hover:underline-offset-4">
                    {n.title}
                  </a>
                ) : (
                  <span className="font-medium">{n.title}</span>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[n.site, n.date].filter(Boolean).join(" · ")}
                  {n.labels.length > 0 ? ` · ${n.labels.map((l) => NEWS_LABEL[l as NewsLabel] ?? l).join(", ")}` : ""}
                </p>
              </li>
            ))}
          </ul>
          {news.length > 4 ? (
            <button type="button" onClick={() => setAllNews(!allNews)} className="mt-2 cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              {allNews ? "Fewer" : `All ${Math.min(15, news.length)} headlines`}
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        From the company's LinkedIn page{f?.readOn ? ` (read ${f.readOn})` : ""}, Wikidata, GLEIF, the IND register and the news.
        {f?.linkedin ? (
          <>
            {" "}
            <a href={f.linkedin} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              LinkedIn page
            </a>
          </>
        ) : null}
      </p>
    </Section>
  )
}

// --- Reviews ---------------------------------------------------------------------------------------------------------

function Stars({ value }: { value: number }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} weight={value >= i - 0.25 ? "fill" : "regular"} className={`size-3.5 ${value >= i - 0.25 ? "text-brand" : "text-muted-foreground/50"}`} aria-hidden="true" />
      ))}
    </span>
  )
}

function Score({ label, value }: { label: string; value: number | null }): React.JSX.Element | null {
  if (value === null) return null

  return (
    <li className="grid grid-cols-[8rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="h-1.5 rounded-full bg-secondary">
        <span className="block h-full rounded-full bg-brand/70" style={{ width: `${(value / 5) * 100}%` }} />
      </span>
      <span className="text-right tabular-nums">{value.toFixed(1)}</span>
    </li>
  )
}

function ReviewCard({ r }: { r: Review }): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const long = (r.pros ?? "").length + (r.cons ?? "").length > 360
  const clamp = long && !open ? "line-clamp-3" : ""

  return (
    <li className={`${card} px-4 py-3`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {r.overall !== null ? <Stars value={r.overall} /> : null}
        {r.title ? <p className="font-semibold">“{r.title}”</p> : null}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{[r.role, reviewerStatus(r.status), r.place, r.date].filter(Boolean).join(" · ")}</p>
      {r.pros ? (
        <p className={`mt-2 text-sm ${clamp}`}>
          <span className="font-semibold">Pros </span>
          {r.pros}
        </p>
      ) : null}
      {r.cons ? (
        <p className={`mt-1 text-sm ${clamp}`}>
          <span className="font-semibold">Cons </span>
          {r.cons}
        </p>
      ) : null}
      {long ? (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 cursor-pointer text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {open ? "Less" : "Read all"}
        </button>
      ) : null}
      {r.recommend === "yes" || r.recommend === "no" ? <p className="mt-1 text-xs text-muted-foreground">{r.recommend === "yes" ? "Would recommend" : "Would not recommend"}</p> : null}
    </li>
  )
}

/** What people who work or worked there say: Glassdoor's overall numbers, the averages of the reviews we have, and the reviews. */
export function ReviewsSection({ post }: { post: Posting }): React.JSX.Element | null {
  const company = useJobCompany(post.employer, post.employer_display)
  const [shown, setShown] = useState<number>(3)
  if (company === undefined) return null
  const g = company?.glassdoor
  const s = company?.reviewStats
  // Newest first, but the ones in English before the ones in Dutch: the people reading are mostly from abroad.
  const reviews = englishFirst(company?.reviews ?? [])
  if (!g && !s && reviews.length === 0) {
    return (
      <Section title="Reviews">
        <p className="text-sm text-muted-foreground">No reviews of {post.employer_display} yet.</p>
      </Section>
    )
  }
  const rating = g?.rating ?? s?.overall ?? null

  return (
    <Section title="Reviews">
      <div className={`${card} grid gap-5 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)]`}>
        <div className="flex flex-col items-start gap-1 sm:pr-5">
          {rating !== null ? <span className="text-4xl font-semibold tabular-nums tracking-tight">{rating.toFixed(1)}</span> : null}
          {rating !== null ? <Stars value={rating} /> : null}
          <span className="text-xs text-muted-foreground">{g?.reviews ? `${g.reviews.toLocaleString("en-US")} reviews on Glassdoor` : s ? `${s.count} reviews` : ""}</span>
          {g?.recommendPct ?? s?.recommendPct ? <span className="mt-1 text-sm">{g?.recommendPct ?? s?.recommendPct}% would recommend it to a friend</span> : null}
          {g?.ceo && g.ceoApprovalPct ? <span className="text-sm">{g.ceoApprovalPct}% approve of {g.ceo}</span> : null}
        </div>
        {s ? (
          <div>
            <ul className="flex flex-col gap-2">
              <Score label="Culture" value={s.culture} />
              <Score label="Work-life balance" value={s.balance} />
              <Score label="Career growth" value={s.career} />
              <Score label="Pay & benefits" value={s.pay} />
              <Score label="Management" value={s.management} />
              <Score label="Diversity" value={s.diversity} />
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Average of {s.count} reviews{s.oldest && s.newest ? (s.oldest.slice(0, 4) === s.newest.slice(0, 4) ? ` from ${s.newest.slice(0, 4)}` : ` from ${s.oldest.slice(0, 4)} to ${s.newest.slice(0, 4)}`) : ""}.</p>
          </div>
        ) : null}
      </div>

      {reviews.length > 0 ? (
        <>
          <h4 className="mb-2 mt-5 text-sm font-semibold">Latest reviews</h4>
          <ul className="flex flex-col gap-2">
            {reviews.slice(0, shown).map((r, i) => (
              <ReviewCard key={i} r={r} />
            ))}
          </ul>
          {reviews.length > shown ? (
            <button type="button" onClick={() => setShown(shown + 5)} className="mt-3 cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Show more reviews
            </button>
          ) : null}
        </>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        From Glassdoor{g?.readOn ? `, read ${g.readOn}` : ""}.
        {g?.url ? (
          <>
            {" "}
            <a href={g.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              All reviews
            </a>
          </>
        ) : null}
      </p>
    </Section>
  )
}
