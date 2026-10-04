import { useMemo, useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import { Caret, OddsPanel } from "@/components/OddsExplain"
import { Section } from "@/components/JobPersonal"
import { stepOf } from "@/components/PipelineBoard"
import { openStatusColors } from "@/components/StatusPicker"
import { useData } from "@/lib/data"
import { NO_WHAT_IF, point, standing, type Standing } from "@/lib/engine"
import { JOB_PER_INTERVIEW } from "@/lib/odds-kind"
import { statusColors, type StatusKey } from "@/lib/status-colors"
import type { Posting } from "@/lib/types"

/** The chance of at least one interview from several applications, each counted on its own terms. */
const together = (rates: number[]): number => 1 - rates.reduce((left, p) => left * (1 - p), 1)

interface Contribution {
  post: Posting
  low: number
  mid: number
  high: number
}

interface Meter {
  low: number
  mid: number
  high: number
  /** One entry per logged application that could be scored. */
  contributions: Contribution[]
}

/**
 * The interview odds. Every job you log as applied adds its own estimated
 * chance; together they read as the chance of at least one interview. A job
 * that cannot be scored (a requirement is missing, or too few similar postings)
 * adds nothing.
 */
export function useMeter(excluding?: string, kind: "interview" | "job" = "interview"): Meter {
  const data = useData()
  const scale = kind === "job" ? JOB_PER_INTERVIEW : 1

  return useMemo(() => {
    const contributions: Contribution[] = []
    if (data.reference && data.shares) {
      for (const app of data.applications) {
        const post = data.byId.get(app.posting_id)
        if (!post || post.id === excluding) {
          continue
        }
        const st = standing(post, data.profile, data.reference, data.shares, NO_WHAT_IF, data.referrals.has(post.id), data.strengthFor(post))
        if (st.rate && !st.rate.thin) {
          contributions.push({ post, low: st.rate.low * scale, mid: st.rate.mid * scale, high: st.rate.high * scale })
        }
      }
    }

    return { low: together(contributions.map((c) => c.low)), mid: together(contributions.map((c) => c.mid)), high: together(contributions.map((c) => c.high)), contributions }
  }, [data.applications, data.byId, data.profile, data.reference, data.shares, data.referrals, data.strengthFor, excluding, scale])
}

const SEGMENTS = 10

/**
 * The odds as ten cells that fill like a charge: the low figure solid, the stretch
 * up to the high figure lighter. Milestones at a quarter, a half and three
 * quarters are marked underneath.
 */
export function OddsBar({ low, high, label, tone = "brand", color }: { low: number; high: number; label: string; tone?: "brand" | "ink"; /** The bar in this colour (the status colour it stands for), instead of the tone. */ color?: string }): React.JSX.Element {
  const solid = tone === "ink" ? "bg-foreground" : "bg-brand"
  const soft = tone === "ink" ? "bg-foreground/25" : "bg-brand/30"

  return (
    <div role="img" aria-label={label} className="flex flex-col">
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const at = (x: number): number => Math.min(1, Math.max(0, (x * 100 - i * (100 / SEGMENTS)) / (100 / SEGMENTS)))

          return (
            <div key={i} className="relative h-3.5 overflow-hidden rounded-[3px] bg-secondary">
              <div className={`absolute inset-y-0 left-0 ${color ? "" : soft} transition-[width] duration-700 ease-out`} style={{ width: `${at(high) * 100}%`, ...(color ? { backgroundColor: color, opacity: 0.3 } : {}) }} />
              <div className={`absolute inset-y-0 left-0 ${color ? "" : solid} transition-[width] duration-700 ease-out`} style={{ width: `${at(low) * 100}%`, ...(color ? { backgroundColor: color } : {}) }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const range = (low: number, high: number): string => {
  const a = Math.round(low * 100)
  const b = Math.max(a, Math.round(high * 100))

  return a === b ? `${a}%` : `${a}–${b}%`
}


/** The logos of the companies behind the number, each one counted. */
function Contributors({ items }: { items: Contribution[] }): React.JSX.Element | null {
  if (items.length === 0) {
    return null
  }

  return (
    <ul aria-label="Jobs counted" className="flex items-center -space-x-1.5">
      {items.slice(0, 5).map((c) => (
        <li key={c.post.id} title={`${c.post.employer_display}: ${point(c.mid)}`} className="flex size-7 items-center justify-center rounded-full border-[1.5px] bg-card">
          <CompanyLogo employer={c.post.employer} name={c.post.employer_display} size={18} wide={1} url={c.post.url} />
        </li>
      ))}
      {items.length > 5 ? <li className="flex size-7 items-center justify-center rounded-full border-[1.5px] bg-secondary text-[0.6875rem] font-medium">+{items.length - 5}</li> : null}
    </ul>
  )
}

/** One kind of odds: its name, the figure, the bar. */
function OddsRow({ title, mid, tone = "brand", aside, note }: { title: string; mid: number; tone?: "brand" | "ink"; aside?: React.ReactNode; note?: React.ReactNode }): React.JSX.Element {
  // The interview odds wear the Interview colour and the job odds the Offer colour, so the bars agree with the counts and the statuses.
  const colors = statusColors(useData().profile.statusColors)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1 text-sm font-medium">
          {title}
          {aside}
        </p>
        <p className="text-lg font-semibold tabular-nums">{mid === 0 ? "0%" : point(mid)}</p>
      </div>
      <OddsBar low={mid} high={mid} tone={tone} color={tone === "ink" ? colors.offer : colors.interview} label={`${title} ${mid === 0 ? "0%" : point(mid)}`} />
      {note ? <p className="text-[0.8125rem] text-muted-foreground tabular-nums">{note}</p> : null}
    </div>
  )
}

/**
 * The top of the dashboard, as one picture. A funnel of the four counts (saved, applied, interviews, offers), each in the colour you gave its status, with what each step
 * came to underneath. Then the two chances as coloured bars (the Interview colour and the Offer colour), and where the numbers come from in three short facts, with the research behind them.
 */
export function SearchSummary(): React.JSX.Element {
  const data = useData()
  const [explain, setExplain] = useState<boolean>(false)
  const [chances, setChances] = useState<boolean>(false)
  const interview = useMeter()
  const job = useMeter(undefined, "job")
  const applied = new Set(data.applications.map((a) => a.posting_id))
  const saved = [...data.postings, ...data.keptExtra].filter((p) => data.saved.has(p.id) && !applied.has(p.id)).length
  const count = (...stages: string[]): number => data.applications.filter((a) => stages.includes(a.stage)).length
  const total = data.applications.length
  const interviews = count("interview")
  const offers = count("offer", "hired")
  // Each count wears the colour you gave its status (Edit colors, in the status menu), so the top of the page and the jobs below agree.
  const colors = statusColors(data.profile.statusColors)
  const stats: Array<{ label: string; n: number; key: StatusKey; under: string }> = [
    { label: "Saved", n: saved, key: "saved", under: "kept, not applied yet" },
    { label: "Applied", n: count("applied"), key: "applied", under: total > 0 ? `${total} sent in all` : "none sent yet" },
    { label: "Interviews", n: interviews, key: "interview", under: total > 0 ? `${interviews} of ${total} ${total === 1 ? "application" : "applications"}` : "after you apply" },
    { label: "Offers", n: offers, key: "offer", under: interviews > 0 ? `${offers} of ${interviews} interviews` : "about 1 in 4 interviews" },
  ]

  return (
    <div className="flex flex-col gap-3">
    <section aria-label="Your search" className="overflow-hidden rounded-2xl border-2 border-line bg-card shadow-sm">
      <dl className="grid grid-cols-2 divide-x-[1.5px] divide-line sm:grid-cols-4">
        {stats.map(({ label, n, key, under }, i) => (
          <div key={label} className={`group relative flex flex-col gap-1 px-4 pt-5 pb-3 sm:px-5 ${i === 2 ? "max-sm:border-t-[1.5px] max-sm:border-line" : i === 3 ? "max-sm:border-t-[1.5px] max-sm:border-line" : ""}`}>
            <span aria-hidden="true" style={{ backgroundColor: colors[key] }} className="absolute inset-x-0 top-0 h-1.5" />
            <dd style={{ color: colors[key] }} className="text-4xl leading-none font-bold tracking-tight tabular-nums">
              {n}
            </dd>
            <dt className="text-sm font-semibold">{label}</dt>
            <p className="text-xs text-muted-foreground">{under}</p>
            <button type="button" onClick={openStatusColors} className="absolute top-3 right-2 hidden cursor-pointer rounded-md bg-card px-1.5 py-0.5 text-xs font-medium underline underline-offset-4 shadow-sm group-hover:block focus:block">
              Edit colors
            </button>
          </div>
        ))}
      </dl>

      <button type="button" aria-expanded={chances} aria-label={chances ? "Hide your chances" : "Show your chances"} onClick={() => setChances(!chances)} className="flex w-full cursor-pointer items-center justify-center border-t-[1.5px] border-line py-1.5 transition-colors duration-150 hover:bg-accent/50">
        <Caret open={chances} />
      </button>
      {chances ? (
      <div className="grid gap-6 border-t-[1.5px] border-line p-5 lg:grid-cols-2">
        <OddsRow title={total > 0 ? `At least one interview from your ${total} ${total === 1 ? "application" : "applications"}` : "At least one interview"} mid={interview.mid} aside={<Contributors items={interview.contributions} />} />
        <OddsRow title={total > 0 ? `At least one job offer from your ${total} ${total === 1 ? "application" : "applications"}` : "At least one job offer"} mid={job.mid} tone="ink" />
      </div>
      ) : null}
    </section>
    <div>
      <button type="button" aria-expanded={explain} aria-controls="odds-explained" onClick={() => setExplain(!explain)} className="cursor-pointer text-sm underline underline-offset-4 hover:text-foreground">
        How does it work
      </button>
      {explain ? (
        <div id="odds-explained" className="mt-3">
          <OddsPanel />
        </div>
      ) : null}
    </div>
    </div>
  )
}

/** On a job: both odds now, and what they would become with this job. Marking it Applied, above, is what counts it. */
export function MeterSection({ post, st }: { post: Posting; st: Standing }): React.JSX.Element {
  const data = useData()
  const [open, setOpen] = useState<boolean>(false)
  const applied = data.applications.some((a) => a.posting_id === post.id) && stepOf(data, post) !== "saved"
  const rate = st.rate && !st.rate.thin ? st.rate : null
  const others = { interview: useMeter(post.id, "interview"), job: useMeter(post.id, "job") }

  const row = (kind: "interview" | "job"): React.JSX.Element => {
    const scale = kind === "job" ? JOB_PER_INTERVIEW : 1
    const before = others[kind]
    const withThis = rate ? together([before.mid, rate.mid * scale]) : null
    const now = applied && withThis !== null ? withThis : before.mid
    const gain = withThis !== null ? 100 * (withThis - before.mid) : null

    return (
      <OddsRow
        key={kind}
        title={kind === "job" ? "Job odds" : "Interview odds"}
        mid={now}
        tone={kind === "job" ? "ink" : "brand"}
        note={applied ? "Counting this job" : withThis !== null && gain !== null ? `With this job ${point(withThis)} (+${gain.toFixed(1)})` : "Too few similar jobs to score this one"}
      />
    )
  }

  return (
    <Section
      title="Your odds"
      aside={
        <button type="button" aria-expanded={open} aria-controls="odds-explained-job" onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          How it works <Caret open={open} />
        </button>
      }
    >
      <div className="flex flex-col gap-6">
        {open ? (
          <div id="odds-explained-job">
            <OddsPanel />
          </div>
        ) : null}
        {row("interview")}
        {row("job")}
      </div>
    </Section>
  )
}
