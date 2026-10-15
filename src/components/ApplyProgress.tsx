import { useEffect, useState } from "react"
import { CheckIcon } from "@/components/icons"

export type ApplyPhase = "queued" | "filling" | "needs_input" | "ready" | "failed"

const STEPS = ["Opening", "Filling", "Your answers", "Review"] as const
const AT: Record<ApplyPhase, number> = { queued: 0, filling: 1, needs_input: 2, ready: 3, failed: 1 }
const TITLE: Record<ApplyPhase, string> = { queued: "Waiting for your laptop", filling: "Working on your laptop", needs_input: "Needs your answer", ready: "Ready to review", failed: "Stopped" }
/** What is going on, a line at a time, while it works: the text moves so the card never looks stuck. */
const LINES: Record<ApplyPhase, ReadonlyArray<string>> = {
  queued: ["Waiting for Chrome to pick it up", "Opening the application"],
  filling: ["Opening the application", "Filling in your details", "Uploading your CV", "Answering the usual questions", "Checking what the site kept"],
  needs_input: ["Waiting for your answer"],
  ready: ["Everything it could fill is in"],
  failed: ["It stopped here"],
}

/**
 * Where an application is: a bar that sweeps while it works, a line that changes every couple of seconds saying what is being done, and four steps (the one
 * in progress pulses, the ones behind it are ticked). Nothing here asks for anything: the questions and buttons sit under it.
 */
export function ApplyProgress({ phase }: { phase: ApplyPhase }): React.JSX.Element {
  const at = AT[phase]
  const stopped = phase === "failed"
  const working = phase === "queued" || phase === "filling"
  const lines = LINES[phase]
  const [tick, setTick] = useState<{ phase: ApplyPhase; n: number }>({ phase, n: 0 })
  const n = tick.phase === phase ? tick.n : 0
  useEffect(() => {
    if (lines.length < 2) return
    const timer = window.setInterval(() => setTick((t) => ({ phase, n: (t.phase === phase ? t.n : 0) + 1 })), 2400)

    return () => window.clearInterval(timer)
  }, [phase, lines.length])

  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="flex flex-col gap-1">
        <p className="font-heading text-xl font-semibold tracking-tight">{TITLE[phase]}</p>
        <p key={`${phase}:${n}`} className="apply-line min-h-5 text-sm text-muted-foreground">{lines[n % lines.length]}</p>
      </div>
      <div className={`relative h-2.5 w-full overflow-hidden rounded-full bg-secondary ${working ? "apply-sweep" : ""}`} aria-hidden="true">
        <div className={`h-full rounded-full transition-all duration-700 ${stopped ? "bg-destructive" : phase === "ready" ? "bg-good-foreground" : "bg-brand"} ${phase === "needs_input" ? "motion-safe:animate-pulse" : ""}`} style={{ width: `${stopped ? 35 : ((at + (working ? 0.5 : 1)) / STEPS.length) * 100}%` }} />
      </div>
      <ol className="flex items-center" aria-label="Steps">
        {STEPS.map((label, i) => {
          const done = i < at || (phase === "ready" && i === at)
          const live = i === at && !done && !stopped

          return (
            <li key={label} className="flex min-w-0 flex-1 items-center last:flex-none">
              <span className="flex flex-col items-center gap-1.5">
                <span
                  className={`flex size-8 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-300 ${
                    done ? "bg-good text-good-foreground" : live ? "bg-brand text-white ring-4 ring-brand/25 motion-safe:animate-pulse" : stopped && i === at ? "bg-bad text-bad-foreground" : "border-[1.5px] text-muted-foreground"
                  }`}
                >
                  {done ? <CheckIcon weight="bold" className="size-4" aria-hidden="true" /> : i + 1}
                </span>
                <span className={`text-xs ${i === at ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
              </span>
              {i < STEPS.length - 1 ? <span aria-hidden="true" className={`mx-1 mb-5 h-[2px] flex-1 rounded-full transition-colors duration-500 ${i < at ? "bg-good-foreground/40" : "bg-secondary"}`} /> : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
