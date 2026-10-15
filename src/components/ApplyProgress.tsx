import { useEffect, useState } from "react"
import { CheckIcon } from "@/components/icons"

export type ApplyPhase = "queued" | "filling" | "needs_input" | "ready" | "failed"

const STEPS = ["Opening", "Filling", "Your answers", "Review"] as const
const AT: Record<ApplyPhase, number> = { queued: 0, filling: 1, needs_input: 2, ready: 3, failed: 1 }
const TITLE: Record<ApplyPhase, string> = { queued: "Waiting for your laptop", filling: "Working on your laptop", needs_input: "Needs your answer", ready: "Ready to review", failed: "Stopped" }
/** What is going on, a line at a time, while it works: the text moves so the card never looks stuck. */
const LINES: Record<ApplyPhase, ReadonlyArray<string>> = {
  queued: ["Waiting for Chrome to pick it up", "Opening the application"],
  filling: ["Opening the application", "Filling what we know", "Filling in your details", "Uploading your CV", "Answering the usual questions", "Checking what the site kept"],
  needs_input: ["Waiting for your answer"],
  ready: ["Everything it could fill is in"],
  failed: ["It stopped here"],
}

/** needs_input is also Stuck / Captcha / Account — never claim “your answer” when there is no Odds question. */
function titleFor(phase: ApplyPhase, message?: string): string {
  if (phase !== "needs_input") return TITLE[phase]
  const m = message || ""
  // Outlined / marked form questions are not Account — even if the site chrome elsewhere says "Sign in".
  if (/outlined question|marked question|answer the \d* ?(marked|outlined) questions?/i.test(m)) return "Needs your answer"
  // Handshake timeout — product copy, never chrome://extensions / version nags.
  if (/extension did not respond|odds in chrome did not answer|extension context invalidated|reconnect odds on connect/i.test(m)) return "Reconnect Odds"
  // Real captcha only — not the old "Captcha or account may be blocking" stuck line.
  if (/captcha|verify you are human|security verification/i.test(m) && !/captcha or account/i.test(m)) return "Captcha on the page"
  if (/could not open an application here|could not open the application form|agent gave up|could not move this application forward|click apply yourself|click the site'?s apply|captcha or account/i.test(m)) return "Stuck — open the tab"
  if (/password|create (an )?account|account (or login|required)|register|sign up|sign in or make|account or login required|choose your password|inloggen|account aanmaken|email from your odds profile|sign in to (linkedin|indeed|glassdoor)|still not signed in to/i.test(m)) return "Sign in on the tab"
  if (m.trim()) return "Open the application tab"
  return TITLE.needs_input
}

/**
 * Where an application is: a bar that sweeps while it works, the extension's own line when it has one (so the person sees what is happening), otherwise a
 * rotating line, and four steps (the one in progress pulses, the ones behind it are ticked). Nothing here asks for anything: the questions and buttons sit under it.
 */
export function ApplyProgress({ phase, message }: { phase: ApplyPhase; message?: string }): React.JSX.Element {
  const at = AT[phase]
  const stopped = phase === "failed"
  const working = phase === "queued" || phase === "filling"
  const lines = LINES[phase]
  const live = (message || "").trim()
  const [tick, setTick] = useState<{ phase: ApplyPhase; n: number }>({ phase, n: 0 })
  const n = tick.phase === phase ? tick.n : 0
  useEffect(() => {
    if (live || lines.length < 2) return
    const timer = window.setInterval(() => setTick((t) => ({ phase, n: (t.phase === phase ? t.n : 0) + 1 })), 2400)

    return () => window.clearInterval(timer)
  }, [phase, lines.length, live])

  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="flex flex-col gap-1">
        <p className="font-heading text-xl font-semibold tracking-tight">{titleFor(phase, message)}</p>
        <p key={live || `${phase}:${n}`} className="apply-line min-h-5 text-sm text-muted-foreground">{live || lines[n % lines.length]}</p>
      </div>
      <div className={`relative h-2.5 w-full overflow-hidden rounded-full bg-secondary ${working ? "apply-sweep" : ""}`} aria-hidden="true">
        <div className={`h-full rounded-full transition-all duration-700 ${stopped ? "bg-destructive" : phase === "ready" ? "bg-good-foreground" : "bg-brand"} ${phase === "needs_input" ? "motion-safe:animate-pulse" : ""}`} style={{ width: `${stopped ? 35 : ((at + (working ? 0.5 : 1)) / STEPS.length) * 100}%` }} />
      </div>
      <ol className="grid grid-cols-4" aria-label="Steps">
        {STEPS.map((label, i) => {
          const done = i < at || (phase === "ready" && i === at)
          const current = i === at && !done && !stopped

          return (
            <li key={label} className="relative flex flex-col items-center gap-1.5 px-0.5">
              {i < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute top-4 left-[calc(50%+1rem)] h-[2px] w-[calc(100%-2rem)] rounded-full ${i < at ? "bg-good-foreground/40" : "bg-secondary"}`}
                />
              ) : null}
              <span
                className={`relative z-10 flex size-8 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-300 ${
                  done ? "bg-good text-good-foreground" : current ? "bg-brand text-white ring-4 ring-brand/25 motion-safe:animate-pulse" : stopped && i === at ? "bg-bad text-bad-foreground" : "border-[1.5px] bg-background text-muted-foreground"
                }`}
              >
                {done ? <CheckIcon weight="bold" className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={`w-full text-center text-xs leading-tight ${i === at ? "font-semibold" : "text-muted-foreground"}`}>{label}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
