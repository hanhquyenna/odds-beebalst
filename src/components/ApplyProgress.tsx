import { CheckIcon, ExternalLinkIcon } from "@/components/icons"
import { Spinner } from "@/components/ui/spinner"

export type ApplyPhase = "queued" | "filling" | "needs_input" | "ready" | "failed"

function heading(phase:ApplyPhase,message:string):string {
  if(phase === "queued") return "Connecting to Chrome"
  if(phase === "filling") return "Working on your application"
  if(phase === "ready") return "Ready for your review"
  if(phase === "failed") return "Application paused"
  if(/captcha|verify you are human/i.test(message)) return "A quick check needs you"
  if(/sign in|password|account|inloggen/i.test(message)) return "Sign in to continue"
  if(/cover letter/i.test(message)) return "Add your cover letter"
  return "Your turn"
}

/** Activity is indeterminate. Show the real latest action, never invented progress or rotating tasks. */
export function ApplyProgress({phase,message,title}:{phase:ApplyPhase;message?:string;title?:string}):React.JSX.Element {
  const working=phase === "queued" || phase === "filling"
  const line=(message || "").trim()
  const label=title && !/broods is applying|stuck|needs your answer/i.test(title) ? title : heading(phase,line)
  return <div role="status" aria-live="polite" className="flex items-start gap-3.5">
    <div className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary">
      {working ? <><img src="/icons/icon-192.png" alt="" className="size-7 rounded-full"/><Spinner aria-hidden="true" className="absolute inset-0 size-11 text-brand motion-reduce:animate-none"/></> : phase === "ready" ? <CheckIcon weight="bold" className="size-6 text-good-foreground" aria-hidden="true"/> : <ExternalLinkIcon className="size-5 text-foreground" aria-hidden="true"/>}
    </div>
    <div className="min-w-0 flex-1 py-0.5">
      <p className="font-heading text-lg font-semibold tracking-tight text-foreground">{label}</p>
      {line ? <p className="mt-1 text-sm leading-relaxed text-foreground">{line}</p> : <p className="mt-1 text-sm text-foreground">{working ? "Waiting for the application tab." : "Open the tab to continue."}</p>}
    </div>
  </div>
}
