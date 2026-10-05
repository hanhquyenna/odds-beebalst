import { Section } from "@/components/Section"
import { ageText } from "@/components/Tag"
import { useEffect, useState } from "react"
import { useData } from "@/lib/data"
import { industryOf } from "@/lib/industries"
import { fieldOf } from "@/lib/filters"
import { CompanyLogo } from "@/components/CompanyMark"
import { fetchEmployerAbout, fetchEmployerFacts, fetchEmployerHiring, fetchEmployerInsights, fetchEmployerNews, type EmployerNewsItem, type EmployerFacts, type EmployerHiring, type EmployerInsights } from "@/lib/jobs"
import { formatPlace } from "@/lib/format"
import type { Posting } from "@/lib/types"

/** Other jobs at the same employer, last on the page. Each opens in the same panel. */
export function MoreAtEmployer({ post, onOpenJob }: { post: Posting; onOpenJob?: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const others = data.postings.filter((p) => p.employer === post.employer && p.id !== post.id)
  if (others.length === 0) {
    return null
  }

  return (
    <Section title={`More jobs at ${post.employer_display}`}>
      <ul className="divide-y-[1.5px] border-y-[1.5px]">
        {others.slice(0, 5).map((p) => (
          <li key={p.id}>
            <button type="button" disabled={!onOpenJob} onClick={() => onOpenJob?.(p)} className="flex w-full cursor-pointer items-baseline justify-between gap-4 py-3 text-left transition-colors duration-150 hover:text-primary disabled:cursor-default">
              <span className="min-w-0 truncate font-medium">{p.title}</span>
              <span className="shrink-0 text-sm text-muted-foreground">
                {formatPlace(p.region)} · {ageText(p).replace("Posted ", "")}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {others.length > 5 ? <p className="mt-2 text-sm text-muted-foreground">and {others.length - 5} more</p> : null}
    </Section>
  )
}

const FIRST_SENTENCES = (text: string, limit = 620): string => {
  const t = text.replace(/\s+/g, " ").trim()
  if (t.length <= limit) {
    return t
  }
  const at = Math.max(t.lastIndexOf(". ", limit), t.lastIndexOf("! ", limit), t.lastIndexOf("? ", limit))

  return at > 200 ? t.slice(0, at + 1) : `${t.slice(0, t.lastIndexOf(" ", limit))}…`
}

const day = (iso: string): string => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const range = (text: string): string => text.replace(/\d+/g, (n) => Number(n).toLocaleString("en-US")).replace("-", "–")

/** "€12.3 billion", "$450 million": a figure as a person would say it. */
function moneyText(amount: number, currency: string): string {
  const sign: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF ", JPY: "¥", CNY: "CN¥", SEK: "SEK ", DKK: "DKK ", NOK: "NOK ", CAD: "C$", AUD: "A$" }
  const unit = Math.abs(amount) >= 1e9 ? [1e9, " billion"] : Math.abs(amount) >= 1e6 ? [1e6, " million"] : [1, ""]
  const n = amount / (unit[0] as number)

  return `${sign[currency] ?? `${currency} `}${n >= 100 || unit[0] === 1 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1).replace(/\.0$/, "")}${unit[1]}`
}

const MONEY_LABEL = { revenue: "Revenue", net_profit: "Net profit", market_value: "Market value", total_assets: "Assets" } as const

const first = (list: Array<{ title: string }> | null | undefined, n: number): string => (list ?? []).slice(0, n).map((x) => x.title).join(", ")

/** A fact table row: a label and a value, set like the box beside a Wikipedia article. */
function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 border-t-[1.5px] px-3 py-2 first:border-t-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/**
 * Who the employer is, for someone about to apply, set like a Wikipedia article: its own description in the text, and a box of facts beside it.
 * The description is the company's own, from its LinkedIn page or its job postings, or a short one written by odds; the box says where each fact comes from.
 * A figure is shown only when it was read from a source. Growth appears only once the headcount has been read twice.
 */
export function AboutCompany({ post }: { post: Posting }): React.JSX.Element {
  const data = useData()
  const [about, setAbout] = useState<{ about: string; source: "posting" | "odds" } | null>(null)
  const [facts, setFacts] = useState<EmployerFacts | null>(null)
  const [insights, setInsights] = useState<EmployerInsights | null>(null)
  const [hiring, setHiring] = useState<EmployerHiring | null>(null)
  const [news, setNews] = useState<EmployerNewsItem[]>([])
  useEffect(() => {
    let live = true
    void Promise.all([fetchEmployerAbout(post.employer), fetchEmployerFacts(post.employer), fetchEmployerInsights(post.employer), fetchEmployerHiring(post.employer), fetchEmployerNews(post.employer)]).then(([a, f, i, h, n]) => {
      if (live) {
        setAbout(a)
        setFacts(f)
        setInsights(i)
        setHiring(h)
        setNews(n)
      }
    })

    return () => {
      live = false
    }
  }, [post.employer])

  const mine = data.postings.filter((p) => p.employer === post.employer)
  const places = [...new Set(mine.map((p) => formatPlace(p.region).split(",")[0].trim()).filter((x) => x && x !== "Location not stated"))].slice(0, 3)
  const industry = industryOf(post)
  const text = facts?.description ? FIRST_SENTENCES(facts.description) : about?.about ?? null
  const mine0 = fieldOf(post)
  // What the open jobs say about hiring here, in plain sentences. A sentence appears only when there is something true to say.
  const hiringLines: string[] = []
  if (hiring && hiring.open_jobs > 0) {
    const n = hiring.open_jobs
    const pct = (a: number): number => Math.round((100 * a) / n)
    const list = (xs: Array<{ name: string }>): string => (xs.length <= 1 ? (xs[0]?.name ?? "") : `${xs.slice(0, -1).map((x) => x.name).join(", ")} and ${xs[xs.length - 1].name}`)
    hiringLines.push(`${n} open ${n === 1 ? "job" : "jobs"}${hiring.first_jobs > 0 ? `, ${hiring.first_jobs} of them internships or entry-level` : ""}.`)
    if (hiring.no_dutch_jobs > 0) hiringLines.push(pct(hiring.no_dutch_jobs) >= 95 ? "Almost all of its jobs can be done without Dutch." : `${pct(hiring.no_dutch_jobs)}% of its jobs can be done without Dutch.`)
    if (hiring.visa_mentions > 0) hiringLines.push(`${hiring.visa_mentions} ${hiring.visa_mentions === 1 ? "posting mentions" : "postings mention"} visas or relocation.`)
    if (hiring.avg_applicants) hiringLines.push(`A job here usually has about ${hiring.avg_applicants.toLocaleString("en-US")} applicants on LinkedIn.`)
    const fields = hiring.fields.filter((f) => f.n >= 2)
    if (fields.length) hiringLines.push(`It hires mostly for ${list(fields)}.`)
    const cities = hiring.cities.filter((c) => c.n >= 2 && c.name.length <= 30 && !c.name.includes(";"))
    if (cities.length) hiringLines.push(`Most of the jobs are in ${list(cities)}.`)
    const skills = hiring.skills.filter((x) => x.n >= 3).slice(0, 3)
    if (skills.length >= 2) hiringLines.push(`Its postings ask most often for ${list(skills)}.`)
  }
  const seenTasks = new Set<string>()
  const teamList = [...(insights?.teams ?? [])]
    .filter((t) => t.about || t.tasks.length >= 2)
    .sort((a, b) => Number(b.family === mine0) - Number(a.family === mine0))
    // Two fields that rest on the same posting would show the same lines twice: the second is left out.
    .filter((t) => {
      const fresh = t.about !== null || t.tasks.some((x) => !seenTasks.has(x))
      for (const x of t.tasks) seenTasks.add(x)

      return fresh
    })
    .slice(0, 4)
  const site = facts?.website?.startsWith("https://") ? facts.website : null
  const [older, latest] = [facts?.headcount[0], facts?.headcount[facts.headcount.length - 1]]
  const growth = older && latest && older.read_on !== latest.read_on && older.employees > 0 ? Math.round(((latest.employees - older.employees) / older.employees) * 1000) / 10 : null

  return (
    <Section title={`About ${post.employer_display}`}>
      <div className="flow-root">
        <aside aria-label={`Facts about ${post.employer_display}`} className={`mb-4 w-full overflow-hidden rounded-lg border-[1.5px] bg-secondary/30 text-sm ${text ? "sm:float-right sm:mb-2 sm:ml-6 sm:w-72" : "sm:max-w-sm"}`}>
          <div className="flex flex-col items-center gap-2 border-b-[1.5px] bg-secondary/60 px-3 py-4">
            <CompanyLogo employer={post.employer} name={post.employer_display} size={56} wide={1.4} url={post.url} />
            <p className="text-center text-base font-semibold">{facts?.name ?? post.employer_display}</p>
          </div>
          <dl>
            {facts?.founded_year ? <Row label="Founded">{facts.founded_year}</Row> : null}
            {industry ? <Row label="Industry">{industry}</Row> : null}
            {facts?.company_type ? <Row label="Type">{facts.company_type}</Row> : null}
            {facts?.headquarters ? <Row label="Headquarters">{facts.headquarters}</Row> : null}
            {facts?.employees ? (
              <Row label="Employees">
                {facts.employees.toLocaleString("en-US")}
                {facts.employee_range ? <span className="text-muted-foreground"> (LinkedIn range {range(facts.employee_range)})</span> : null}
              </Row>
            ) : null}
            {(insights?.money ?? []).map((m) => (
              <Row key={m.kind} label={MONEY_LABEL[m.kind]}>
                {moneyText(m.amount, m.currency)} <span className="text-muted-foreground">({m.year})</span>
              </Row>
            ))}
            {growth !== null && older ? <Row label="Change">{`${growth > 0 ? "+" : ""}${growth}% since ${day(older.read_on)}`}</Row> : null}
            {site ? (
              <Row label="Website">
                <a href={site} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  {site.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </Row>
            ) : null}
            <Row label="Open here">{`${mine.length} ${mine.length === 1 ? "job" : "jobs"}${places.length ? ` in ${places.join(", ")}` : ""}`}</Row>
            {post.ind_sponsor ? <Row label="Visa sponsor">Yes, on the IND list of recognised sponsors</Row> : null}
            {facts?.top_schools?.length ? <Row label="Universities">{first(facts.top_schools, 3)}</Row> : null}
            {facts?.top_functions?.length ? <Row label="Biggest teams">{first(facts.top_functions, 3)}</Row> : null}
          </dl>
        </aside>
        {text ? (
          <>
            <p className="text-[0.95rem] leading-relaxed">{text}</p>
            {about && !facts?.description && about.source === "odds" ? <p className="mt-2 text-xs text-muted-foreground">Written by odds, not by the company.</p> : null}
          </>
        ) : null}
        {hiringLines.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-base font-bold tracking-tight">Hiring here</h3>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[0.95rem] leading-relaxed marker:text-muted-foreground">
              {hiringLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">Worked out from the jobs we hold today.</p>
          </div>
        ) : null}
        {news.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-base font-bold tracking-tight">In the news</h3>
            <ul className="mt-1.5 flex flex-col gap-2 text-[0.95rem] leading-snug">
              {news.map((n) => (
                <li key={n.url}>
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-brand">
                    {n.title}
                  </a>
                  <span className="text-muted-foreground">
                    {" "}
                    · {n.site ?? ""}
                    {n.published ? `, ${day(n.published)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {insights?.culture ? (
          <div className="mt-5">
            <h3 className="text-base font-bold tracking-tight">Culture</h3>
            <p className="mt-1.5 text-[0.95rem] leading-relaxed">{insights.culture.about}</p>
            <p className="mt-1 text-xs text-muted-foreground">From their job postings, “{insights.culture.heading}”</p>
          </div>
        ) : null}
        {teamList.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-base font-bold tracking-tight">What the teams do</h3>
            <div className="mt-2 flex flex-col gap-4">
              {teamList.map((t) => (
                <div key={t.family}>
                  <p className="font-semibold">{t.family}</p>
                  {t.about ? <p className="mt-0.5 text-[0.95rem] leading-relaxed">{t.about}</p> : null}
                  {t.tasks.length > 0 ? (
                    <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[0.95rem] leading-relaxed marker:text-muted-foreground">
                      {t.tasks.slice(0, 3).map((task) => (
                        <li key={task}>{task}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">From their job postings.</p>
          </div>
        ) : null}
      </div>
    </Section>
  )
}
