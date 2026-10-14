import { ApplicationQuestions } from "@/components/ApplicationQuestions"
import { useEffect, useState } from "react"
import { prepareInExtension, useExtensionPresent } from "@/lib/extension-connect"
import { onApplicationSignal, type ApplicationState } from "@/lib/embed"
import { embedded, extensionParent } from "@/lib/embedded"
import { useData } from "@/lib/data"
import { activeApplication, applicationState, cancelApplication, continueApplication, requestApplication, type ApplicationRun } from "@/lib/application-runs"
import { sourcesOf } from "@/components/SourceChips"
import { ArrowRightIcon, SparkleIcon } from "@/components/icons"
import type { Posting } from "@/lib/types"

/**
 * In the odds extension's panel: the job opened in the person's own tab with its application filled in by odds (LinkedIn's Easy Apply, or the
 * employer's own form; extension/apply.js and apply-any.js). Outside the panel a signed-in person can queue preparation on their connected desktop.
 * The person reviews and submits on that desktop. Its own file, so the landing page does not load it.
 */
export function OddsApply({ post }: { post: Posting }): React.JSX.Element | null {
  const user = useData().session?.user.id
  return <div className="flex w-full flex-col gap-2">
    <OddsApplyForm key={`${user}:${post.id}`} post={post} />
    {user && !post.local ? <ApplicationQuestions key={post.id} postingId={post.id} /> : null}
  </div>
}

function OddsApplyForm({ post }: { post: Posting }): React.JSX.Element | null {
  const extensionPresent = useExtensionPresent()
  const [sent, setSent] = useState(false)
  const userId = useData().session?.user.id
  const [run, setRun] = useState<ApplicationRun | null>(null)
  const [online, setOnline] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  useEffect(() => {
    if (!userId || embedded) return
    let stopped = false
    const refresh = (): void => {
      if (document.hidden) return
      void applicationState(post.id).then(v => {
        if (!stopped) { setRun(v.run); setOnline(v.online); setError("") }
      }).catch(() => { if (!stopped) setOnline(false) })
    }
    refresh()
    const timer = window.setInterval(refresh, 5000)
    document.addEventListener("visibilitychange", refresh)
    return () => { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [post.id, userId])
  useEffect(() => {
    if (!sent || !embedded) {
      return
    }
    const t = window.setTimeout(() => setSent(false), 4000)
    return () => window.clearTimeout(t)
  }, [sent])
  const main = sourcesOf(post).find((s) => s.url)
  const parent = extensionParent()
  const [state, setState] = useState<ApplicationState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const watched = embedded && parent ? main?.url : undefined
  // In the panel: how this job's application is going, from the tab doing it, and whether a press found or opened that tab.
  useEffect(() => {
    if (!watched || !parent) return
    const ask = (): void => window.parent.postMessage({ source: "odds-site", type: "application-status", url: watched }, parent)
    const stop = onApplicationSignal((signal) => {
      if (signal.url !== watched) return
      if (signal.type === "application-status") setState(signal.state ?? null)
      if (signal.type === "application-started") { setSent(false); if (signal.ok === false) setError(signal.message || "Could not start the application."); else ask() }
    })
    ask()
    const timer = window.setInterval(() => { setNow(Date.now()); ask() }, 2000)
    return () => { stop(); window.clearInterval(timer) }
  }, [watched, parent])
  if (!main?.url) return null
  const applicationUrl = main.url
  if (!embedded && extensionPresent !== "yes") {
    if (!userId || post.local) return null
    const active = run && activeApplication(run)
    const unavailable = run?.status === "failed" && /no longer accepting applications|job is closed/i.test(run.message)
    return (
      <div className="flex w-full flex-col gap-2 rounded-xl border border-brand/25 bg-brand/5 p-3">
        <button type="button" disabled={pending || Boolean(active && run.status === "queued") || !online || unavailable} className="h-11 cursor-pointer rounded-lg bg-brand-ink px-4 text-sm font-semibold text-white disabled:bg-brand/15 disabled:text-brand-ink" onClick={() => {
          setPending(true); setError("")
          void (active ? continueApplication(post.id) : requestApplication(post.id)).then(setRun).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not prepare this application.")).finally(() => setPending(false))
        }}>{unavailable ? "Applications closed" : pending ? "Sending request…" : active ? run.status === "ready" ? "Review application" : run.status === "needs_input" ? "Continue application" : run.status === "queued" ? "Waiting for Chrome" : "Open application" : online ? "Apply with Odds" : "No desktop connected"}</button>
        <p className="text-xs text-muted-foreground" role={run?.status === "failed" ? "alert" : "status"}>{(run ? `${["ready", "needs_input"].includes(run.status) ? "On your desktop: " : ""}${run.message}` : "") || (online ? "Your desktop is connected. It fills the form; you review and submit there." : "Open the Odds extension in desktop Chrome and enable phone control. Your computer must be awake.")}</p>
        {active && run.status === "queued" ? <p className="text-xs text-muted-foreground">This browser uses your connected Chrome extension. Open desktop Chrome and the Odds side panel to receive this request now; background checks run about every 30 seconds while Chrome is awake.</p> : null}
        {run && active ? <button type="button" disabled={pending} className="self-start text-xs underline" onClick={() => {
          setPending(true)
          void cancelApplication(run.id).then(() => setRun({ ...run, status: "cancelled", message: "Preparation cancelled." })).catch(() => setError("Could not cancel. Try again.")).finally(() => setPending(false))
        }}>Cancel preparation</button> : null}
        {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
      </div>
    )
  }
  if (embedded && !parent) {
    return null
  }

  const stalled = state?.status === "filling" && now - state.at > 60_000
  const login = state?.status === "needs_input" && /log ?in|sign in|verification|captcha|account/i.test(state.message)
  const label = sent ? "Opening application…"
    : !state ? "Apply with Odds"
    : state.status === "filling" ? "Filling… · open tab"
    : state.status === "needs_input" ? login ? "Complete step in browser" : "Continue application"
    : state.status === "ready" ? "Review application"
    : state.status === "failed" ? "Try again"
    : "Application sent"
  const line = error || (state ? stalled ? "Still working. If nothing changes, open the tab to see where it is." : state.message : "") || "Your profile details and CV, filled in for you. You review and submit."
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-brand/25 bg-brand/5 p-2.5">
      <button
        type="button"
        disabled={sent || state?.status === "submitted"}
        onClick={() => {
          setError("")
          setSent(true)
          if (embedded && parent) window.parent.postMessage({ source: "odds-site", type: "apply", url: main.url }, parent)
          else void (async () => {
            try {
              await prepareInExtension(applicationUrl)
              setSent(false)
            } catch (e) { setError(e instanceof Error ? e.message : "Could not start the application."); setSent(false) }
          })()
        }}
        className="group flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg bg-brand-ink px-3.5 py-3 text-left text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-ink/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 disabled:cursor-wait disabled:opacity-70"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15"><SparkleIcon weight="fill" className="size-4" aria-hidden="true" /></span>
        <span className="flex-1">{label}</span>
        <ArrowRightIcon className="size-4 shrink-0" aria-hidden="true" />
      </button>
      <p className={error || state?.status === "failed" ? "text-center text-xs text-red-700" : "text-center text-xs text-muted-foreground"} role={error || state?.status === "failed" ? "alert" : "status"}>{line}</p>
    </div>
  )
}
