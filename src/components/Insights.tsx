import { useEffect, useMemo, useState } from "react"
import { useData } from "@/lib/data"
import { insightsOf, type Snapshot } from "@/lib/insights"
import { statusColors } from "@/lib/status-colors"
import { supabase } from "@/lib/supabase"

/** The days from applying to a first answer are only kept with the chance recorded at the time: read once, only for a signed-in person. */
function useSnapshots(): Snapshot[] {
  const userId = useData().session?.user.id ?? null
  const [rows, setRows] = useState<Snapshot[]>([])
  useEffect(() => {
    if (!userId) return
    let live = true
    void Promise.resolve(supabase.from("chance_snapshots").select("applied_on,outcome,outcome_on")).then(({ data, error }) => {
      if (live && !error && Array.isArray(data)) setRows(data as Snapshot[])
    })

    return () => {
      live = false
    }
  }, [userId])

  return rows
}

/** How the search is going, in numbers worked out from the stages and dates kept: what was never answered, how long a first answer takes, who has waited longest, how far applications get. */
export function Insights({ framed = false }: { framed?: boolean }): React.JSX.Element | null {
  const data = useData()
  const snapshots = useSnapshots()
  const colors = statusColors(data.profile.statusColors)
  const i = useMemo(() => insightsOf(data.applications, snapshots), [data.applications, snapshots])
  const longest = i.longest ? [...data.postings, ...data.keptExtra].find((p) => p.id === i.longest?.postingId) : undefined
  const stats: Array<{ value: string; label: string }> = [
    { value: String(i.total), label: "applications sent" },
    ...(i.noReplyPct !== null ? [{ value: `${i.noReplyPct}%`, label: "no reply" }] : []),
    ...(i.firstReplyDays !== null ? [{ value: `${i.firstReplyDays} ${i.firstReplyDays === 1 ? "day" : "days"}`, label: "to a first reply" }] : []),
    ...(i.longest ? [{ value: `${i.longest.days} ${i.longest.days === 1 ? "day" : "days"}`, label: longest ? `longest wait, ${longest.employer_display}` : "longest wait" }] : []),
    { value: String(i.thisWeek), label: "sent this week" },
  ]
  const rows = [
    { label: "Applied", n: i.funnel.applied, of: i.funnel.applied, color: colors.applied },
    { label: "Interview", n: i.funnel.interview, of: i.funnel.applied, color: colors.interview },
    { label: "Offer", n: i.funnel.offer, of: i.funnel.interview, color: colors.offer },
  ]

  const top = Math.max(2, ...i.weeks)
  const ticks = [top, Math.round(top / 2), 0]
  const left = 24
  const width = 296
  const height = 104

  const points = i.weeks.map((n, k) => `${left + k * (width / (i.weeks.length - 1))},${height - (n / top) * (height - 10)}`).join(" ")

  return (
    <section aria-label="How it is going" className={framed ? "flex flex-col gap-8 rounded-xl border-[1.5px] bg-card p-4 sm:p-5" : "mt-8 flex flex-col gap-8 border-t-[1.5px] border-line pt-7"}>
      <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold tracking-tight">Your application insights</h2><p className="mt-1 text-xs text-muted-foreground">Your progress, from first application to offer.</p></div><span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">Last 8 weeks</span></div>
      <div className="grid gap-6 lg:grid-cols-2">
        <dl className="grid grid-cols-2 gap-3 self-start">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-2 rounded-xl bg-secondary/50 p-4">
              <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{s.value}</dd>
              <dt className="text-sm text-muted-foreground">{s.label}</dt>
            </div>
          ))}
        </dl>
        <ul className="flex flex-col gap-3 self-start rounded-xl border p-4">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[4.2rem_1fr_4rem] items-center gap-2 text-sm">
              <span className="font-medium">{r.label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
                <span className="block h-full rounded-md" style={{ width: `${i.funnel.applied === 0 ? 0 : Math.max(r.n > 0 ? 2 : 0, Math.round((r.n / i.funnel.applied) * 100))}%`, backgroundColor: r.color }} />
              </span>
              <span className="text-right text-muted-foreground tabular-nums">{r.label === "Applied" ? r.n : `${r.n} · ${r.of === 0 ? 0 : Math.round((r.n / r.of) * 100)}%`}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border p-4">
        <h3 className="mb-3 font-heading text-base font-semibold tracking-tight">Sent each week</h3>
        <svg viewBox={`0 0 ${left + width} ${height + 22}`} role="img" aria-label={`Applications sent in each of the last eight weeks: ${i.weeks.join(", ")}`} className="h-auto w-full">
          {ticks.map((t) => {
            const y = height - (t / top) * height + 2

            return (
              <g key={t}>
                <line x1={left} x2={left + width} y1={y} y2={y} className="stroke-border" strokeWidth="1" />
                <text x={left - 6} y={y + 3.5} textAnchor="end" className="fill-muted-foreground" fontSize="10">{t}</text>
              </g>
            )
          })}
          <polygon points={`${left},${height} ${points} ${left + width},${height}`} className="fill-brand/10" />
          <polyline points={points} fill="none" className="stroke-brand" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {i.weeks.map((n, k) => <circle key={k} cx={left + k * (width / (i.weeks.length - 1))} cy={height - (n / top) * (height - 10)} r="3" className="fill-card stroke-brand" strokeWidth="2"><title>{k === 7 ? "This week" : `${7-k} weeks ago`}: {n} applications</title></circle>)}
          <text x={left} y={height + 17} textAnchor="start" className="fill-muted-foreground" fontSize="10">7 weeks ago</text>
          <text x={left + width} y={height + 17} textAnchor="end" className="fill-muted-foreground" fontSize="10">This week</text>
        </svg>
        {i.total === 0 ? <div className="mt-4 rounded-xl bg-brand/5 px-4 py-3"><p className="text-sm font-medium">Your next chapter starts here</p><p className="mt-1 text-xs text-muted-foreground">Track your first application to bring this chart to life. Only applications you’ve recorded appear here.</p></div> : null}
      </div>
    </section>
  )
}
