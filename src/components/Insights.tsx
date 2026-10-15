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
export function Insights(): React.JSX.Element | null {
  const data = useData()
  const snapshots = useSnapshots()
  const colors = statusColors(data.profile.statusColors)
  const i = useMemo(() => insightsOf(data.applications, snapshots), [data.applications, snapshots])
  if (i.total === 0) return null
  const longest = i.longest ? [...data.postings, ...data.keptExtra].find((p) => p.id === i.longest?.postingId) : undefined
  const stats: Array<{ value: string; label: string }> = [
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

  return (
    <section aria-label="How it is going" className="mt-8 grid gap-8 border-t-[1.5px] border-line pt-7 lg:grid-cols-2 lg:gap-12">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 self-start">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5">
            <dd className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{s.value}</dd>
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
          </div>
        ))}
      </dl>
      <ul className="flex flex-col gap-3 self-start">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-3 text-sm">
            <span className="font-medium">{r.label}</span>
            <span className="h-6 overflow-hidden rounded-md bg-secondary" aria-hidden="true">
              <span className="block h-full rounded-md" style={{ width: `${i.funnel.applied === 0 ? 0 : Math.max(r.n > 0 ? 2 : 0, Math.round((r.n / i.funnel.applied) * 100))}%`, backgroundColor: r.color }} />
            </span>
            <span className="text-right text-muted-foreground tabular-nums">{r.label === "Applied" ? r.n : `${r.n} · ${r.of === 0 ? 0 : Math.round((r.n / r.of) * 100)}%`}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
