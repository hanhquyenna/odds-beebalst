import { useCalibration } from "@/lib/use-calibration"
import type { CalibrationBucket } from "@/lib/calibration"
import { MIN_ANSWERED } from "@/lib/calibration"

const W = 320
const H = 220
const L = 36
const B = 28
const T = 10
const R = 12
const pct = (v: number): string => `${Math.round(v * 1000) / 10}%`

/** One picture: the chance Odds showed (across) against how often it led to an interview (up). On the diagonal means exactly right. */
function Plot({ everyone, mine }: { everyone: CalibrationBucket[]; mine: CalibrationBucket[] }): React.JSX.Element {
  const dots = [
    ...everyone.filter((b) => b.enough).map((b) => ({ b, who: "everyone" as const })),
    ...mine.filter((b) => b.enough).map((b) => ({ b, who: "you" as const })),
  ]
  const top = Math.max(0.1, ...dots.flatMap(({ b }) => [b.shown ?? 0, b.actual ?? 0]))
  const max = Math.ceil((top * 1.15) / 0.05) * 0.05
  const x = (v: number): number => L + (v / max) * (W - L - R)
  const y = (v: number): number => H - B - (v / max) * (H - B - T)
  const ticks = [0, max / 2, max]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance shown against interviews that happened. ${dots.map(({ b, who }) => `${who === "you" ? "You" : "Everyone"}, shown ${pct(b.shown ?? 0)}, got a call ${pct(b.actual ?? 0)}, from ${b.answered} answers`).join("; ")}`} className="h-auto w-full max-w-md">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth="1" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground" fontSize="11">{pct(t)}</text>
          <text x={x(t)} y={H - B + 16} textAnchor={t === 0 ? "start" : t === max ? "end" : "middle"} className="fill-muted-foreground" fontSize="11">{pct(t)}</text>
        </g>
      ))}
      <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x={x(max) - 4} y={y(max) + 14} textAnchor="end" className="fill-muted-foreground" fontSize="10">exactly right</text>
      <text x={(L + W - R) / 2} y={H - 2} textAnchor="middle" className="fill-muted-foreground" fontSize="10">chance Odds showed</text>
      <text x={10} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 10 ${(T + H - B) / 2})`} className="fill-muted-foreground" fontSize="10">got an interview</text>
      {dots.map(({ b, who }) => {
        const cx = x(b.shown ?? 0)
        const cy = y(b.actual ?? 0)
        const r = 5 + Math.min(5, Math.sqrt(b.answered) / 3)

        return (
          <g key={`${who}-${b.key}`}>
            <circle cx={cx} cy={cy} r={r} className={who === "everyone" ? "fill-brand" : "fill-card stroke-foreground"} strokeWidth={who === "everyone" ? 0 : 2} fillOpacity={who === "everyone" ? 0.9 : 1}>
              <title>{`${who === "you" ? "You" : "Everyone"} · shown ${pct(b.shown ?? 0)} · got a call ${pct(b.actual ?? 0)} · ${b.answered} answers`}</title>
            </circle>
            <text x={cx} y={cy - r - 3} textAnchor="middle" className="fill-foreground" fontSize="10" fontWeight="700">{`n=${b.answered}`}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** The Insights section that answers "can I trust the number?": the picture, then every group with how many answers stand behind it. */
export function CalibrationChart(): React.JSX.Element | null {
  const { mine, everyone, loaded } = useCalibration()
  if (!loaded) return null
  const anyEnough = [...mine, ...everyone].some((b) => b.enough)
  const rows = everyone.map((b, i) => ({ label: b.label, all: b, you: mine[i] }))
  const waiting = rows.every(({ all, you }) => all.answered === 0 && you.answered === 0)

  return (
    <div className="min-w-0 border-t-[1.5px] pt-5" aria-label="Was the chance right">
      <h3 className="mb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Was the chance right?</h3>
      <p className="mb-3 text-sm text-muted-foreground">
        A check, not a guarantee. We group applications by the chance Odds showed when they were sent and look at how many really got a call. Only applications from 21 or more days ago that got an answer count; "no answer yet" is left out.
      </p>
      {anyEnough ? <Plot everyone={everyone} mine={mine} /> : null}
      {anyEnough ? (
        <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span><span aria-hidden="true" className="mr-1 inline-block size-2.5 rounded-full bg-brand align-middle" />Everyone using Odds</span>
          <span><span aria-hidden="true" className="mr-1 inline-block size-2.5 rounded-full border-2 border-foreground align-middle" />You</span>
        </p>
      ) : (
        <p className="rounded-xl bg-accent p-3.5 text-sm">
          Not enough yet. {waiting ? "No application is old enough with an answer." : `Every group has fewer than ${MIN_ANSWERED} answers, too few to say anything.`} Tell us what happened under "Did you hear back?" and this fills in.
        </p>
      )}
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 font-semibold">Chance shown</th>
            <th className="py-1 font-semibold">Everyone</th>
            <th className="py-1 font-semibold">You</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, all, you }) => (
            <tr key={label} className="border-t border-border">
              <td className="py-1.5 font-semibold">{label}</td>
              {[all, you].map((b, k) => (
                <td key={k} className="py-1.5 tabular-nums">
                  {b.enough && b.actual !== null ? `${Math.round(b.actual * 100)} in 100 got a call · ${b.answered} answers` : <span className="text-muted-foreground">not enough yet{b.answered > 0 ? ` · ${b.answered} ${b.answered === 1 ? "answer" : "answers"}` : ""}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
