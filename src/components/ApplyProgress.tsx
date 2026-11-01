import { CheckIcon, ExternalLinkIcon } from "@/components/icons"
import { NEEDS } from "@/lib/apply-queue-words"
import { plainWords } from "@/lib/plain-words"

export type ApplyPhase = "queued" | "filling" | "needs_input" | "ready" | "failed"

function heading(phase:ApplyPhase,message:string):string {
  // The Applications page's words, so a job reads the same on every page.
  if(phase === "queued") return "Waiting for Chrome"
  if(phase === "filling") return "Filling in"
  if(phase === "ready") return "Ready to send"
  if(phase === "failed") return "Couldn't apply"
  if(/captcha|verify you are human/i.test(message)) return NEEDS.captcha.label
  if(/sign in|password|account|inloggen/i.test(message)) return NEEDS.account.label
  if(/cover letter/i.test(message)) return NEEDS.letter.label
  return NEEDS.other.label
}

/** Activity is indeterminate. Show the real latest action, never invented progress or rotating tasks. */
export function ApplyProgress({phase,message,title,quiet=false}:{phase:ApplyPhase;message?:string;title?:string;/** The status is already shown beside it (the job page's chip): only say what happened. */quiet?:boolean}):React.JSX.Element {
  const working=phase === "queued" || phase === "filling"
  const line=plainWords(message || "").trim()
  const label=title || heading(phase,line)
  return <div role="status" aria-live="polite" className="flex items-start gap-3.5">
    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
      {working ? <img src="/icon.svg" alt="" className="size-7"/> : phase === "ready" ? <CheckIcon weight="bold" className="size-6 text-good-foreground" aria-hidden="true"/> : <ExternalLinkIcon className="size-5 text-foreground" aria-hidden="true"/>}
    </div>
    <div className="min-w-0 flex-1 py-0.5">
      {quiet && line ? null : <p className="font-heading text-lg font-semibold tracking-tight text-foreground">{label}</p>}
      {line ? <p className={quiet ? "text-[0.95rem] leading-relaxed text-foreground" : "mt-1 text-sm leading-relaxed text-foreground"}>{line}</p> : <p className="mt-1 text-sm text-foreground">{working ? "Waiting for the application tab." : "Go to the tab to carry on."}</p>}
    </div>
  </div>
}
