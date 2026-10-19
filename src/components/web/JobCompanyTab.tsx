import { useState } from "react"
import { SourceCircle, SourceLine, type SourceName } from "@/components/web/SourceCircle"
import { StarIcon } from "@/components/icons"
import { CompanyResearch } from "@/components/CompanyResearch"
import { useCompanyProfile } from "@/lib/company-profile"
import { companyMoney, companyNews, moneyText } from "@/lib/company-numbers"
import { useCompanyMore, useJobCompany, type Review } from "@/lib/job-company"
import { englishFirst } from "@/lib/past-roles"
import type { Posting } from "@/lib/types"

const card = "rounded-[18px] border-[1.5px] border-line bg-card p-5"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const day = (d: string | null | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d ?? "")

  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : (d ?? null)
}

/** A source as a person reads it: a web address becomes the site's name ("Wikipedia"), never the raw link. */
function sourceLabel(source: string | null | undefined): string {
  const text = (source ?? "").trim()
  if (!/^https?:\/\//i.test(text)) return text
  try {
    const host = new URL(text).hostname.replace(/^(www|en)\./, "")
    const name = host.split(".").slice(-2, -1)[0] ?? host

    return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    return text
  }
}

function Tile({ label, value, note }: { label: string; value: string; note?: string | null }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-secondary px-4 py-3">
      <span className="text-xs font-bold text-muted-foreground">{label}</span>
      <span className="text-xl font-extrabold tracking-tight">{value}</span>
      {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
    </div>
  )
}

function Head({ title, sources, aside }: { title: string; sources: React.ReactNode; aside?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        {sources}
      </div>
      {aside}
    </div>
  )
}

/** The Company tab: what the company is and how big it is, what people who work there say on Glassdoor, and the news. Facts as found, with their source. */
export function JobCompanyTab({ post }: { post: Posting }): React.JSX.Element {
  const company = useJobCompany(post.employer, post.employer_display)
  const file = useCompanyProfile(post.employer)
  const extra = useCompanyMore(post.employer)
  const [moreText, setMoreText] = useState<boolean>(false)
  const [allNews, setAllNews] = useState<boolean>(false)
  const [allReviews, setAllReviews] = useState<boolean>(false)
  if (company === undefined) return <p className="text-sm text-muted-foreground" role="status">Loading the company…</p>
  const f = company?.facts ?? null
  const money = companyMoney(company?.money ?? [], file, extra?.money)
  const news = companyNews(company?.news ?? [], extra?.news)
  const description = f?.description?.trim() ?? ""
  const employees = f?.employees ?? file?.employees ?? extra?.employees?.count ?? null
  const founded = f?.founded ?? file?.founded ?? extra?.founded ?? null
  const hq = f?.headquarters ?? file?.hq ?? null
  const website = f?.website ?? file?.website ?? null
  const tiles: Array<{ label: string; value: string; note: string | null }> = [
    money.revenue ? { label: "Revenue", value: moneyText(money.revenue), note: [money.revenue.year, sourceLabel(money.revenue.source)].filter(Boolean).join(" · ") } : null,
    money.profit ? { label: "Profit", value: moneyText(money.profit), note: [money.profit.year, sourceLabel(money.profit.source)].filter(Boolean).join(" · ") } : null,
    money.marketValue ? { label: "Market value", value: moneyText(money.marketValue), note: [money.marketValue.year, sourceLabel(money.marketValue.source)].filter(Boolean).join(" · ") } : null,
    employees ? { label: "Employees", value: Math.round(employees).toLocaleString("en-US"), note: f?.employees ? "LinkedIn" : null } : f?.employeeRange ? { label: "Employees", value: f.employeeRange, note: "stated" } : null,
    founded ? { label: "Founded", value: String(founded), note: null } : null,
    hq ? { label: "Based in", value: hq, note: null } : null,
  ].filter((t): t is { label: string; value: string; note: string | null } => t !== null)
  const sources: SourceName[] = [
    ...(f?.linkedin || f?.employees ? (["LinkedIn"] as const) : []),
    ...(Object.values(money).some((m) => m.source === "Wikidata") || file ? (["Wikidata"] as const) : []),
    ...(website ? (["Company site"] as const) : []),
  ]
  const g = company?.glassdoor
  const s = company?.reviewStats
  const reviews = englishFirst(company?.reviews ?? [])
  const rating = g?.rating ?? s?.overall ?? null
  const long = description.length > 360
  const known = (f?.specialities ?? []).slice(0, 4)
  const nothing = !f && tiles.length === 0 && news.length === 0 && rating === null && reviews.length === 0

  return (
    <div className="flex flex-col gap-4">
      {nothing ? (
        <div className={`${card} text-sm text-muted-foreground`}>We have no facts on {post.employer_display} yet.{post.ind_sponsor ? " It is on the IND register of recognised visa sponsors." : ""}</div>
      ) : null}

      {f || tiles.length > 0 ? (
        <section aria-label={`About ${post.employer_display}`} className={card}>
          <Head title={`About ${f?.name ?? post.employer_display}`} sources={<SourceLine names={sources} />} />
          {f?.tagline ? <p className="mb-1.5 font-bold">{f.tagline}</p> : null}
          {description ? (
            <p className="leading-relaxed whitespace-pre-line">
              {long && !moreText ? `${description.slice(0, 360).trim()}…` : description}
              {long ? (
                <button type="button" onClick={() => setMoreText(!moreText)} className="ml-1 cursor-pointer text-sm font-bold text-brand-ink underline underline-offset-4">
                  {moreText ? "Less" : "More"}
                </button>
              ) : null}
            </p>
          ) : null}
          {tiles.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {tiles.map((t) => (
                <Tile key={t.label} {...t} />
              ))}
            </div>
          ) : null}
          {known.length > 0 ? (
            <div className="mt-5">
              <p className="mb-1.5 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Known for</p>
              <ul className="flex flex-col gap-1">
                {known.map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
                    {k}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${post.ind_sponsor ? "bg-good text-good-foreground" : "bg-secondary text-muted-foreground"}`}>
            {post.ind_sponsor ? "On the IND register of recognised visa sponsors" : "Not on the IND register of recognised visa sponsors"}
          </p>
          {/* What is known about the whole group it belongs to, in the same card: one company, one place to read it. */}
          <div className="mt-6 border-t-[1.5px] border-line pt-5 empty:hidden [&_section]:border-t-0 [&_section]:pt-0 [&_h2]:text-lg [&_h2]:font-extrabold [&_h2]:tracking-tight">
            <CompanyResearch post={post} />
          </div>
        </section>
      ) : (
        <div className={`${card} empty:hidden [&_section]:border-t-0 [&_section]:pt-0 [&_h2]:text-lg [&_h2]:font-extrabold`}>
          <CompanyResearch post={post} />
        </div>
      )}

      {rating !== null || reviews.length > 0 ? (
        <section aria-label="Glassdoor reviews" className={card}>
          <Head title="Glassdoor reviews" sources={<SourceLine names={["Glassdoor"]} />} aside={reviews.length > 2 ? <button type="button" onClick={() => setAllReviews(!allReviews)} className="cursor-pointer text-sm font-extrabold text-brand-ink">{allReviews ? "Fewer" : "See all ›"}</button> : null} />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {rating !== null ? <span className="text-5xl font-extrabold tracking-tight tabular-nums">{rating.toFixed(1)}</span> : null}
            <span className="text-sm text-muted-foreground">
              {g?.reviews ? `from ${g.reviews.toLocaleString("en-US")} reviews` : s ? `from ${s.count} reviews` : ""}
              {g?.recommendPct ?? s?.recommendPct ? ` · ${g?.recommendPct ?? s?.recommendPct}% would recommend it to a friend` : ""}
            </span>
          </div>
          {reviews.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3">
              {reviews.slice(0, allReviews ? 8 : 2).map((r, i) => (
                <ReviewCard key={i} r={r} />
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {g?.url ? (
              <a href={g.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-ink underline underline-offset-4">
                <SourceCircle name="Glassdoor" /> Read on Glassdoor
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {news.length > 0 ? (
        <section aria-label="Latest news" className={card}>
          <Head title="Latest news" sources={null} aside={news.length > 3 ? <button type="button" onClick={() => setAllNews(!allNews)} className="cursor-pointer text-sm font-extrabold text-brand-ink">{allNews ? "Fewer" : "See all ›"}</button> : null} />
          <ul className="flex flex-col">
            {news.slice(0, allNews ? 15 : 3).map((n) => (
              <li key={n.url ?? n.title} className="border-t-[1.5px] border-line/60 py-3 first:border-t-0 first:pt-0">
                <p className="text-xs text-muted-foreground">{[n.site, day(n.date)].filter(Boolean).join(" · ")}</p>
                {n.url ? (
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">
                    {n.title}
                  </a>
                ) : (
                  <p className="font-bold">{n.title}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function ReviewCard({ r }: { r: Review }): React.JSX.Element {
  return (
    <li className="flex flex-col gap-2 rounded-xl border-[1.5px] border-line px-4 py-3">
      {r.overall !== null ? (
        <span className="inline-flex items-center gap-1 text-sm font-extrabold">
          <StarIcon weight="fill" className="size-4 text-brand" aria-hidden="true" />
          {r.overall.toFixed(1)}
          {r.title ? <span className="ml-1 font-bold text-[#4E4842]">{r.title}</span> : null}
        </span>
      ) : null}
      {r.pros ? (
        <p className="text-sm">
          <span className="font-extrabold">Pro · </span>
          {r.pros}
        </p>
      ) : null}
      {r.cons ? (
        <p className="text-sm">
          <span className="font-extrabold">Con · </span>
          {r.cons}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{[r.role, day(r.date)].filter(Boolean).join(" · ")}</p>
    </li>
  )
}
