import { useState } from "react"
import { ChevronDownIcon, StarIcon } from "@/components/icons"
import { PersonAvatar } from "@/components/PersonAvatar"
import { PersonPanel } from "@/components/PersonPanel"
import { Section } from "@/components/Section"
import { useCompanyProfile } from "@/lib/company-profile"
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

/** "2026-09-15" -> "15 Sep 2026"; anything else is shown as it came. */
const dayText = (d: string | null | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? "")

  return m ? `${Number(m[3])} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m[2]) - 1]} ${m[1]}` : (d ?? null)
}

/** A site's own logo in place of its name ("on LinkedIn"), a link when we have the page. */
function BrandMark({ src, name, href }: { src: string; name: string; href?: string }): React.JSX.Element {
  const img = <img src={src} alt={name} title={`on ${name}`} className="size-4 rounded-[3px]" />

  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Open on ${name}`} className="ml-2 inline-flex cursor-pointer align-middle max-md:min-h-8 max-md:min-w-8 max-md:items-center max-md:justify-center">
      {img}
    </a>
  ) : (
    <span className="ml-2 inline-flex align-middle">{img}</span>
  )
}

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
        <p className="text-sm text-muted-foreground">Sign in to see who got this role before.</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-muted-foreground">We have not found anyone who held this role yet.</p>
      ) : (
        <>
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

/** One person's whole path, in the same panel as anyone else's profile: every job and school, newest first. */
function HireDialog({ person, post, onClose }: { person: PastHire; post: Posting; onClose: () => void }): React.JSX.Element {
  const range = (r: PastHire["experience"][number]): string => [monthYear(r.start), r.current ? "now" : monthYear(r.end)].filter(Boolean).join(" – ")
  const here = person.experience.find((r) => atEmployer(r, post.employer, post.employer_display))

  return (
    <PersonPanel
      onClose={onClose}
      person={{
        name: person.name ?? "Name not public",
        headline: person.headline ?? person.currentPosition ?? undefined,
        place: person.location ?? undefined,
        photo: person.avatar ?? undefined,
        url: person.linkedin ?? "",
        positions: byNewest(person.experience).map((r) => ({ title: r.title ?? "Role not stated", company: [r.employer, kindOf(r.type)].filter(Boolean).join(" · "), dates: range(r) })),
        education: person.education.map((e) => ({ school: e.school ?? "School not stated", detail: [[e.degree, e.field].filter(Boolean).join(", "), e.start || e.end ? [monthYear(e.start), monthYear(e.end)].filter(Boolean).join(" – ") : ""].filter(Boolean).join(" · ") })),
        facts: [
          { label: "Job", value: post.title },
          { label: "Company", value: post.employer_display },
          { label: "Role there", value: here ? `${here.title ?? "Role not stated"}${range(here) ? `, ${range(here)}` : ""}` : "" },
          { label: "Match", value: person.status === "exact" ? "Same role" : "Similar role here" },
        ],
        footnote: (
          <>
            From this person's public LinkedIn profile. Is this you and want it removed?{" "}
            <a href={`mailto:hello@odds.nl?subject=${encodeURIComponent("Remove my profile")}&body=${encodeURIComponent(`Please remove my profile (${person.linkedin ?? person.id}) from odds.`)}`} className="underline underline-offset-4">
              Ask us to remove it
            </a>
            .
          </>
        ),
      }}
    />
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
  const linkedinMark = f?.linkedin ? <BrandMark src="/sources/linkedin.com.svg" name="LinkedIn" href={f.linkedin} /> : <BrandMark src="/sources/linkedin.com.svg" name="LinkedIn" />
  type Tile = { label: string; value: string; note: React.ReactNode }
  const rows: Array<Tile | null> = [
    money.revenue ? { label: "Revenue", value: moneyText(money.revenue), note: [money.revenue.year, money.revenue.source].filter(Boolean).join(" · ") } : null,
    money.profit ? { label: "Profit", value: moneyText(money.profit), note: [money.profit.year, money.profit.source].filter(Boolean).join(" · ") } : null,
    money.marketValue ? { label: "Market value", value: moneyText(money.marketValue), note: [money.marketValue.year, money.marketValue.source].filter(Boolean).join(" · ") } : null,
    employees ? { label: "Employees", value: Math.round(employees).toLocaleString("en-US"), note: f?.employees ? linkedinMark : null } : f?.employeeRange ? { label: "Employees", value: f.employeeRange, note: "stated" } : null,
    f?.founded ?? file?.founded ?? extra?.founded ? { label: "Founded", value: String(f?.founded ?? file?.founded ?? extra?.founded), note: null } : null,
  ]
  const tiles = rows.filter((t): t is Tile => t !== null)

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

      <dl className={`${card} mt-4 px-4 py-1 text-sm`}>
        {tiles.map((t) => (
          <Fact key={t.label} label={t.label}>
            {t.value}
            {typeof t.note === "string" ? <span className="ml-2 text-xs font-normal text-muted-foreground">{t.note}</span> : (t.note ?? null)}
          </Fact>
        ))}
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
        <h3 className="mb-2 text-base font-semibold tracking-tight">Open jobs here</h3>
        <ul className="flex flex-col gap-1.5 text-sm">
          <li>
            {open.length} open {open.length === 1 ? "job" : "jobs"} on odds{recent > 0 ? `, ${recent} posted in the last 30 days` : ""}.
          </li>
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
                  {[n.site, dayText(n.date)].filter(Boolean).join(" · ")}
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
  const who = [r.role, reviewerStatus(r.status), r.place].filter(Boolean).join(" · ")

  return (
    <li className={`${card} flex flex-col gap-2 px-4 py-3.5`}>
      <div className="flex items-center justify-between gap-3">
        {r.overall !== null ? <Stars value={r.overall} /> : <span />}
        <span className="text-xs text-muted-foreground">{dayText(r.date)}</span>
      </div>
      {r.title ? <p className="font-semibold leading-snug">{r.title}</p> : null}
      {who ? <p className="-mt-1 text-xs text-muted-foreground">{who}</p> : null}
      {r.pros || r.cons ? (
        <dl className="mt-1 grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          {r.pros ? (
            <>
              <dt className="text-muted-foreground">Pros</dt>
              <dd className={clamp}>{r.pros}</dd>
            </>
          ) : null}
          {r.cons ? (
            <>
              <dt className="text-muted-foreground">Cons</dt>
              <dd className={clamp}>{r.cons}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {long || r.recommend === "yes" || r.recommend === "no" ? (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{r.recommend === "yes" ? "Would recommend" : r.recommend === "no" ? "Would not recommend" : ""}</span>
          {long ? (
            <button type="button" onClick={() => setOpen(!open)} className="cursor-pointer underline underline-offset-4 hover:text-foreground max-md:min-h-8">
              {open ? "Less" : "Read all"}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/** What people who work or worked there say: Glassdoor's overall numbers, the averages of the reviews we have, and the reviews. */
export function ReviewsSection({ post }: { post: Posting }): React.JSX.Element | null {
  const company = useJobCompany(post.employer, post.employer_display)
  const [shown, setShown] = useState<number>(3)
  const [listOpen, setListOpen] = useState<boolean>(false)
  if (company === undefined) return null
  const g = company?.glassdoor
  const s = company?.reviewStats
  // Newest first, but the ones in English before the ones in Dutch: the people reading are mostly from abroad.
  const reviews = englishFirst(company?.reviews ?? [])
  if (!g && !s && reviews.length === 0) {
    return (
      <Section title="Glassdoor reviews">
        <p className="text-sm text-muted-foreground">No reviews of {post.employer_display} yet.</p>
      </Section>
    )
  }
  const rating = g?.rating ?? s?.overall ?? null

  return (
    <Section title="Glassdoor reviews">
      <div className={`${card} grid gap-5 px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)]`}>
        <div className="flex flex-col items-start gap-1 sm:pr-5">
          {rating !== null ? <span className="text-4xl font-semibold tabular-nums tracking-tight">{rating.toFixed(1)}</span> : null}
          {rating !== null ? <Stars value={rating} /> : null}
          {g?.url ? (
            <a href={g.url} target="_blank" rel="noopener noreferrer" className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline max-md:min-h-10">
              <img src="/sources/glassdoor.com.svg" alt="Glassdoor" className="size-4 rounded-[3px]" />
              {g.reviews ? `${g.reviews.toLocaleString("en-US")} reviews` : "Read on Glassdoor"}
            </a>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <img src="/sources/glassdoor.com.svg" alt="Glassdoor" className="size-4 rounded-[3px]" />
              {g?.reviews ? `${g.reviews.toLocaleString("en-US")} reviews` : s ? `${s.count} reviews` : ""}
            </span>
          )}
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
          </div>
        ) : null}
      </div>

      {reviews.length > 0 ? (
        <>
          <button type="button" onClick={() => setListOpen(!listOpen)} aria-expanded={listOpen} className="mt-5 flex w-full cursor-pointer items-center justify-between gap-3 text-left max-md:min-h-10">
            <span className="text-base font-semibold tracking-tight">Latest reviews</span>
            <ChevronDownIcon className={`size-5 text-muted-foreground transition-transform ${listOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {listOpen ? (
            <>
              <ul className="mt-2 flex flex-col gap-2.5">
                {reviews.slice(0, shown).map((r, i) => (
                  <ReviewCard key={i} r={r} />
                ))}
              </ul>
              {reviews.length > shown ? (
                <button type="button" onClick={() => setShown(shown + 5)} className="mt-3 cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground max-md:min-h-10">
                  Show more reviews
                </button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

    </Section>
  )
}
