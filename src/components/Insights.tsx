import { useEffect, useState } from "react"
import { useData } from "@/lib/data"
import { insightsOf, type Snapshot } from "@/lib/insights"
import { INSIGHTS_PERIODS, insightsPeriod, type InsightsPeriod } from "@/lib/insights-period"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import { CalibrationChart } from "@/components/CalibrationChart"

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

/** Whole-number Y ticks from 0 to top, at most three, no duplicates. */
function chartTicks(top: number): number[] {
  if (top <= 1) return [1, 0]
  if (top === 2) return [2, 1, 0]
  const mid = Math.round(top / 2)
  return mid === 0 || mid === top ? [top, 0] : [top, mid, 0]
}

/** How the search is going, in numbers worked out from the stages and dates kept: what was never answered, how long a first answer takes, who has waited longest, how far applications get. */
export function Insights({ framed = false }: { framed?: boolean }): React.JSX.Element | null {
  const data = useData()
  const snapshots = useSnapshots()
  const [period, setPeriod] = useState<InsightsPeriod>("two_weeks")
  const range = insightsPeriod(period)
  const applications = data.applications.filter((a) => range.includes(a.logged_at))
  const i = insightsOf(applications, snapshots.filter((s) => range.includes(s.applied_on)))
  const counts = range.dates.map((day) => applications.filter((a) => a.logged_at.slice(0, 10) === day).length)
  const dateLabel = (date: string): string => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
  const longest = i.longest ? [...data.postings, ...data.keptExtra].find((p) => p.id === i.longest?.postingId) : undefined
  const stats: Array<{ value: string; label: string }> = [
    ...(i.noReplyPct !== null ? [{ value: `${i.noReplyPct}%`, label: "no reply" }] : []),
    ...(i.firstReplyDays !== null ? [{ value: `${i.firstReplyDays} ${i.firstReplyDays === 1 ? "day" : "days"}`, label: "to a first reply" }] : []),
    ...(i.longest
      ? [
          {
            value: `${i.longest.days} ${i.longest.days === 1 ? "day" : "days"}`,
            label: longest ? `longest wait · ${longest.employer_display}` : "longest wait",
          },
        ]
      : []),
  ]

  const peak = Math.max(0, ...counts)
  const top = Math.max(1, peak)
  const ticks = chartTicks(top)
  const left = 28
  const bottom = 20
  const width = 300
  const height = 120
  const slot = width / Math.max(counts.length, 1)

  return (
    <section aria-label="How it is going" className={framed ? "flex flex-col gap-5 rounded-2xl border-[1.5px] bg-card p-4 sm:p-5" : "mt-8 flex flex-col gap-6 border-t-[1.5px] border-line pt-7"}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight">Applications</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dateLabel(range.dates[0])} – {dateLabel(range.dates.at(-1) ?? range.dates[0])}
            {i.total > 0 ? ` · ${i.total} ${i.total === 1 ? "application" : "applications"}` : null}
          </p>
        </div>
        <Select
          value={period}
          onValueChange={(value) => {
            if (value) setPeriod(value as InsightsPeriod)
          }}
          items={INSIGHTS_PERIODS.map((option) => ({ value: option.key, label: option.label }))}
        >
          <SelectTrigger aria-label="Insights time frame" className="w-auto shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end" alignItemWithTrigger={false}>
            <SelectGroup>
              {INSIGHTS_PERIODS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </header>

      {stats.length > 0 ? (
        <dl className="grid grid-cols-1 gap-4 border-b-[1.5px] pb-5 sm:grid-cols-2">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0">
              <dd className="text-2xl font-bold tabular-nums tracking-tight">{stat.value}</dd>
              <dt className="mt-0.5 truncate text-sm text-muted-foreground" title={stat.label}>
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      ) : null}

      {i.total > 0 ? (
        <div className="min-w-0">
          <h3 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Activity</h3>
          <svg viewBox={`0 0 ${left + width} ${height + bottom}`} role="img" aria-label={`Applications sent by day: ${counts.join(", ")}`} className="h-auto w-full max-w-full">
            {ticks.map((t) => {
              const y = height - (t / top) * height

              return (
                <g key={t}>
                  <line x1={left} x2={left + width} y1={y} y2={y} className="stroke-border" strokeWidth="1" />
                  <text x={left - 8} y={y + 4} textAnchor="end" className="fill-muted-foreground" fontSize="11">
                    {t}
                  </text>
                </g>
              )
            })}
            {counts.map((n, k) => {
              if (n <= 0) return null
              const h = Math.max((n / top) * (height - 4), 6)
              const barW = Math.min(Math.max(slot * 0.55, 4), 28)
              const x = left + k * slot + (slot - barW) / 2

              return (
                <rect key={range.dates[k]} x={x} y={height - h} width={barW} height={h} rx="3" className="fill-brand">
                  <title>
                    {dateLabel(range.dates[k])}: {n} {n === 1 ? "application" : "applications"}
                  </title>
                </rect>
              )
            })}
            <text x={left} y={height + 16} textAnchor="start" className="fill-muted-foreground" fontSize="11">
              {dateLabel(range.dates[0])}
            </text>
            <text x={left + width} y={height + 16} textAnchor="end" className="fill-muted-foreground" fontSize="11">
              {dateLabel(range.dates.at(-1) ?? range.dates[0])}
            </text>
          </svg>
        </div>
      ) : (
        <p className="border-t-[1.5px] pt-4 text-sm text-muted-foreground">No applications recorded for these dates.</p>
      )}

      <CalibrationChart />
    </section>
  )
}
