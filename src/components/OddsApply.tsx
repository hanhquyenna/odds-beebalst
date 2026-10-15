import { ApplicationQuestions } from "@/components/ApplicationQuestions"
import { ApplyProgress, type ApplyPhase } from "@/components/ApplyProgress"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { prepareInExtension, useExtensionPresent } from "@/lib/extension-connect"
import { onApplicationSignal, type ApplicationState } from "@/lib/embed"
import { embedded, extensionParent } from "@/lib/embedded"
import { useData } from "@/lib/data"
import { activeApplication, applicationState, cancelApplication, continueApplication, requestApplication, type ApplicationRun } from "@/lib/application-runs"
import { sourcesOf } from "@/components/SourceChips"
import type { Posting } from "@/lib/types"

/**
 * In the odds extension's panel: the job opened in the person's own tab with its application filled in by odds (LinkedIn's Easy Apply, or the
 * employer's own form; extension/apply.js and apply-any.js). Outside the panel a signed-in person can queue preparation on their connected desktop.
 * The person reviews and submits on that desktop. Its own file, so the landing page does not load it.
 */
export function OddsApply({ post }: { post: Posting }): React.JSX.Element | null {
  const user = useData().session?.user.id

  return <OddsApplyForm key={`${user}:${post.id}`} post={post} />
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
  // On the site itself: the same state, asked of the installed extension through the page.
  const onSite = !embedded && extensionPresent === "yes" ? main?.url : undefined
  useEffect(() => {
    if (!onSite) return
    const ask = (): void => window.postMessage({ source: "odds-site", type: "application-status", url: onSite }, window.location.origin)
    const on = (event: MessageEvent): void => {
      const data = event.data as { source?: string; type?: string; url?: string; state?: ApplicationState | null } | null
      if (event.source !== window || event.origin !== window.location.origin || data?.source !== "odds-extension" || data.type !== "application-status" || data.url !== onSite) return
      setState(data.state ?? null)
    }
    window.addEventListener("message", on)
    ask()
    const timer = window.setInterval(() => { setNow(Date.now()); ask() }, 2000)
    return () => { window.removeEventListener("message", on); window.clearInterval(timer) }
  }, [onSite])
  if (!main?.url) return null
  const applicationUrl = main.url
  if (!embedded && extensionPresent !== "yes") {
    if (!userId || post.local) return null
    const active = run && activeApplication(run)
    const unavailable = run?.status === "failed" && /no longer accepting applications|job is closed/i.test(run.message)
    const phase: ApplyPhase | null = run && (active || run.status === "failed") ? (run.status as ApplyPhase) : null
    const press = (): void => {
      setPending(true); setError("")
      void (active ? continueApplication(post.id) : requestApplication(post.id)).then(setRun).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not prepare this application.")).finally(() => setPending(false))
    }
    const label = unavailable ? "Applications closed" : pending ? "Sending…" : active ? run.status === "ready" ? "Review application" : run.status === "needs_input" ? "Continue application" : run.status === "queued" ? "Waiting for Chrome" : "Open application" : run?.status === "failed" ? "Try again" : online ? "Apply with Odds" : "No desktop connected"
    const primary = (
      <Button type="button" disabled={pending || Boolean(active && run.status === "queued") || (!online && !active) || unavailable} onClick={press} className="h-11 min-h-11 w-full flex-1 cursor-pointer rounded-lg bg-brand-ink text-base text-white hover:bg-brand-ink/90">
        {label}
      </Button>
    )
    const cancel = run && active ? (
      <Button type="button" variant="outline" disabled={pending} onClick={() => {
        setPending(true)
        void cancelApplication(run.id).then(() => setRun({ ...run, status: "cancelled", message: "Cancelled." })).catch(() => setError("Could not cancel. Try again.")).finally(() => setPending(false))
      }} className="h-11 cursor-pointer rounded-lg px-5 text-base">Cancel</Button>
    ) : null

    return (
      <div className={`flex w-full flex-col gap-4 transition-shadow duration-300 ${phase ? (phase === "needs_input" ? "rounded-xl border-2 border-brand bg-card p-4 ring-4 ring-brand/30 shadow-lg" : "rounded-xl border-2 border-brand/70 bg-card p-4 ring-4 ring-brand/10 shadow-md") : ""}`}>
        {phase ? <ApplyProgress phase={phase} /> : null}
        <ApplicationQuestions inline postingId={post.id} aside={primary} empty={<div className="flex flex-col gap-2 sm:flex-row">{primary}{run?.status === "needs_input" ? null : cancel}</div>} />
        {run?.status === "needs_input" && cancel ? <div className="flex">{cancel}</div> : null}
        {run?.status === "failed" ? <p role="alert" className="text-sm text-destructive">{run.message}</p> : null}
        {!online && !active ? <p className="text-sm text-muted-foreground">Open Chrome on your computer to start.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    )
  }
  if (embedded && !parent) {
    return null
  }

  const stalled = state?.status === "filling" && now - state.at > 60_000
  const login = state?.status === "needs_input" && /log ?in|sign in|verification|captcha|account/i.test(state.message)
  const phase: ApplyPhase | null = state && state.status !== "submitted" ? state.status : null
  const label = sent ? "Opening application…"
    : !state ? "Apply with Odds"
    : state.status === "filling" ? "Open tab"
    : state.status === "needs_input" ? login ? "Complete step in browser" : "Continue application"
    : state.status === "ready" ? "Review application"
    : state.status === "failed" ? "Try again"
    : "Application sent"
  const press = (): void => {
    setError("")
    setSent(true)
    if (embedded && parent) window.parent.postMessage({ source: "odds-site", type: "apply", url: main.url }, parent)
    else void (async () => {
      try {
        await prepareInExtension(applicationUrl)
        setSent(false)
      } catch (e) { setError(e instanceof Error ? e.message : "Could not start the application."); setSent(false) }
    })()
  }
  const primary = (
    <Button type="button" disabled={sent || state?.status === "submitted"} onClick={press} className="h-11 min-h-11 w-full flex-1 cursor-pointer rounded-lg bg-brand-ink text-base text-white hover:bg-brand-ink/90">
      {label}
    </Button>
  )

  return (
    <div className={`flex w-full flex-col gap-4 transition-shadow duration-300 ${phase ? (phase === "needs_input" ? "rounded-xl border-2 border-brand bg-card p-4 ring-4 ring-brand/30 shadow-lg" : "rounded-xl border-2 border-brand/70 bg-card p-4 ring-4 ring-brand/10 shadow-md") : ""}`}>
      {phase ? <ApplyProgress phase={phase} /> : null}
      {login ? <div className="flex gap-2">{primary}</div> : <ApplicationQuestions inline postingId={post.id} aside={primary} empty={<div className="flex gap-2">{primary}</div>} />}
      {stalled ? <p className="text-sm text-muted-foreground">Still working. Open the tab to see where it is.</p> : null}
      {state?.status === "failed" && state.message ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
