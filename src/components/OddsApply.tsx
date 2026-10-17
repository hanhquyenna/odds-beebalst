import { ApplicationQuestions } from "@/components/ApplicationQuestions"
import { ApplyProgress, type ApplyPhase } from "@/components/ApplyProgress"
import { ExtensionOnboard } from "@/components/ExtensionOnboard"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { pingExtension, prepareInExtension, useExtensionLink } from "@/lib/extension-connect"
import { rememberConnectFocus } from "@/lib/connect-focus"
import { onApplicationSignal, type ApplicationState } from "@/lib/embed"
import { embedded, extensionParent } from "@/lib/embedded"
import { useData } from "@/lib/data"
import { ensureSaved } from "@/lib/save"
import { DriveLive } from "@/components/DriveLive"
import { driveControl } from "@/lib/drive-runs"
import { applyActivityOf, applyNeedsReveal, driveLabel, driveOf, driveWhy, clearApplyActivity, normalizeApplyStatus, recordApplyActivity, useApplyActivityTick } from "@/lib/apply-activity"
import { mergeApplyView } from "@/lib/apply-view"
import { showLiveApplyInTracker } from "@/lib/apply-nav"
import { isJobClosedMessage, settleClosedJob } from "@/lib/job-closed"
import { activeApplication, applicationState, cancelApplication, continueApplication, requestApplication, type ApplicationRun } from "@/lib/application-runs"
import { sourcesOf } from "@/components/SourceChips"
import { applySourceOf } from "@/lib/apply-source"
import type { Posting } from "@/lib/types"
import { toast } from "sonner"

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
  const { present: extensionPresent, linked: extensionLinked } = useExtensionLink()
  const applyTick = useApplyActivityTick()
  const [sent, setSent] = useState(false)
  const data = useData()
  const userId = data.session?.user.id
  const [run, setRun] = useState<ApplicationRun | null>(null)
  const [online, setOnline] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [connectTour, setConnectTour] = useState(false)
  /** Installed + Connect key in this browser. Looking = still checking (do not hard-gate yet). */
  const extensionReady = extensionPresent === "yes" && extensionLinked
  const needsConnectGate = !embedded && (extensionPresent === "no" || (extensionPresent === "yes" && !extensionLinked))
  useEffect(() => {
    if (!userId || embedded) return
    let stopped = false
    const refresh = (): void => {
      if (document.hidden) return
      void applicationState(post.id).then(v => {
        if (!stopped) {
          setRun(v.run)
          setOnline(v.online)
          setError("")
          if (v.run && ["queued", "filling", "needs_input", "ready", "failed", "submitted"].includes(v.run.status)) {
            recordApplyActivity({ postingId: post.id, status: v.run.status === "queued" ? "filling" : v.run.status as "filling" | "needs_input" | "ready" | "failed" | "submitted", message: v.run.message })
          }
        }
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
  const main = applySourceOf(sourcesOf(post))
  const parent = extensionParent()
  const [tabState, setTabState] = useState<ApplicationState | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // Old builds wrote handshake timeouts into the Stuck chip — drop that poison so Open tab works again.
  useEffect(() => {
    const a = applyActivityOf(post.id)
    if (a && /extension did not respond|reload it in chrome, then reload this page/i.test(a.message || "")) {
      clearApplyActivity(post.id)
      setError("")
      setTabState(null)
    }
  }, [post.id])
  // Closed listing: toast once, keep Saved, drop Filling UI, sink to bottom of tracker.
  useEffect(() => {
    const a = applyActivityOf(post.id)
    const fromApply = isJobClosedMessage(a?.message) || isJobClosedMessage(tabState?.message) || isJobClosedMessage(run?.message)
    if (!post.closed_at && !fromApply) return
    settleClosedJob(data, post, { fromApply, message: a?.message || tabState?.message || run?.message })
    setTabState(null)
    setError("")
    if (fromApply && !post.closed_at) void data.refreshPostings().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settle once per closed signal; data methods are stable enough
  }, [post.id, post.closed_at, post.title, tabState?.message, run?.message])
  const watched = embedded && parent ? main?.url : undefined
  useEffect(() => {
    if (!watched || !parent) return
    const ask = (): void => window.parent.postMessage({ source: "odds-site", type: "application-status", url: watched, postingId: post.id }, parent)
    const stop = onApplicationSignal((signal) => {
      if (signal.url !== watched) return
      if (signal.type === "application-status") {
        setTabState(signal.state ?? null)
        if (signal.state) recordApplyActivity({ postingId: post.id, url: watched, status: signal.state.status, message: signal.state.message })
      }
      if (signal.type === "application-started") {
        setSent(false)
        if (signal.ok === false) setError(signal.message || "Could not start the application.")
        else {
          recordApplyActivity({ postingId: post.id, url: watched, status: "filling", message: "Opening the application…" })
          ask()
        }
      }
    })
    ask()
    const timer = window.setInterval(() => { setNow(Date.now()); ask() }, 2000)
    return () => { stop(); window.clearInterval(timer) }
  }, [watched, parent, post.id])
  const onSite = !embedded && extensionReady ? main?.url : undefined
  useEffect(() => {
    if (!onSite) return
    const ask = (): void => window.postMessage({ source: "odds-site", type: "application-status", url: onSite, postingId: post.id }, window.location.origin)
    const on = (event: MessageEvent): void => {
      const data = event.data as { source?: string; type?: string; url?: string; state?: ApplicationState | null } | null
      if (event.source !== window || event.origin !== window.location.origin || data?.source !== "odds-extension" || data.type !== "application-status" || data.url !== onSite) return
      setTabState(data.state ?? null)
      if (data.state) recordApplyActivity({ postingId: post.id, url: onSite, status: data.state.status, message: data.state.message })
    }
    window.addEventListener("message", on)
    ask()
    const timer = window.setInterval(() => { setNow(Date.now()); ask() }, 2000)
    return () => { window.removeEventListener("message", on); window.clearInterval(timer) }
  }, [onSite, post.id])

  // Re-read activity whenever the tracker chip updates (applyTick).
  void applyTick
  if (!main?.url) return null
  const applicationUrl = main.url
  const boardNote = /glassdoor|indeed/i.test(main.ats || main.name || "")
    ? " This listing is only on Glassdoor/Indeed — sign in there if the tab asks."
    : ""

  const { view, phase: mergedPhase } = mergeApplyView({
    postingId: post.id,
    tab: tabState,
    runStatus: run?.status,
    runMessage: run?.message,
  })

  if (post.closed_at || isJobClosedMessage(view?.message) || isJobClosedMessage(run?.message)) {
    return (
      <div className="flex w-full flex-col gap-2 rounded-xl border-2 border-line bg-card p-4">
        <p className="font-heading text-xl font-semibold tracking-tight">Job closed</p>
        <p className="text-sm text-muted-foreground">
          Sorry — this job is no longer accepting applications. It’s kept in Saved at the bottom of your tracker.
        </p>
      </div>
    )
  }

  const beginApply = async (opts: { reveal?: boolean; continueRun?: boolean } = {}): Promise<void> => {
    // Hard gate: never start Apply until Odds for Chrome is linked in this browser.
    if (needsConnectGate) {
      rememberConnectFocus("extension")
      setConnectTour(true)
      setError("")
      return
    }
    // Apply with Odds → background tab (no focus steal). Open application tab → reveal=true focuses that tab.
    const reveal = opts.reveal === true
    ensureSaved(data, post)
    setError("")
    const prev = applyActivityOf(post.id)
    if (reveal && prev?.message && !/^opening the application/i.test(prev.message)) {
      // Keep Filling / Account / Ready when they just want the tab again.
      recordApplyActivity({
        postingId: post.id,
        url: applicationUrl,
        status: prev.status === "filling" || prev.status === "ready" || prev.status === "needs_input" ? prev.status : "needs_input",
        message: prev.message,
      })
    } else if (!reveal) {
      // First Apply only — never wipe Broods mid-fill / Account / outlined status on a repeat background start.
      const keepProgress = Boolean(
        prev
        && ["filling", "needs_input", "ready"].includes(prev.status)
        && prev.message
        && !/^opening the application/i.test(prev.message),
      )
      if (!keepProgress) {
        recordApplyActivity({ postingId: post.id, url: applicationUrl, status: "filling", message: "Opening the application…" + boardNote, local: true })
        setTabState({ status: "filling", message: "Opening the application…" + boardNote, at: Date.now() })
      }
    }
    if (!embedded) showLiveApplyInTracker(post.id)
    if (reveal) {
      toast.message("Opening application tab…", {
        description: "Jumping to the Chrome tab Odds is filling.",
        id: `apply-${post.id}`,
        duration: 1800,
      })
    } else {
      toast.message("Applying in Chrome…", {
        description: "Odds fills a background tab. Press Open application tab when you want to watch.",
        id: `apply-${post.id}`,
        duration: 2500,
      })
    }

    let opened = false
    if (extensionReady || embedded) {
      try {
        if (embedded && parent) {
          // Fire and forget — never block the Odds button on SW work.
          window.parent.postMessage({ source: "odds-site", type: "apply", url: applicationUrl, reveal, postingId: post.id }, parent)
          opened = true
        } else {
          void prepareInExtension(applicationUrl, { reveal, postingId: post.id }).catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : "Could not start the application."
            recordApplyActivity({
              postingId: post.id,
              url: applicationUrl,
              status: "needs_input",
              message: `Could not open an application here. ${msg} Reconnect Odds on Connect, then try again.`,
            })
            setError(msg)
          })
          opened = true
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not start the application."
        recordApplyActivity({
          postingId: post.id,
          url: applicationUrl,
          status: "needs_input",
          message: `Could not open an application here. ${msg} Reconnect the extension on Connect, then try again.`,
        })
        setError(msg)
        setTabState({ status: "needs_input", message: msg, at: Date.now() })
      }
    }

    if (!opened && userId && !post.local && extensionPresent === "looking") {
      // Still detecting Chrome — fall through to desktop queue only while looking.
      try {
        const r = opts.continueRun && run && activeApplication(run)
          ? await continueApplication(post.id)
          : await requestApplication(post.id)
        setRun(r)
        recordApplyActivity({
          postingId: post.id,
          url: applicationUrl,
          status: r.status === "queued" ? "filling" : r.status as "filling" | "needs_input" | "ready" | "failed" | "submitted",
          message: (r.message || "Queued for your desktop…") + boardNote,
        })
        if (r.status === "failed") setError(r.message || "Could not prepare this application.")
        else setError("")
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not prepare this application."
        recordApplyActivity({
          postingId: post.id,
          url: applicationUrl,
          status: "needs_input",
          message: `${msg} Open Chrome with Odds connected, then try again.`,
        })
        setError(msg)
      }
    } else if (!opened && !userId) {
      rememberConnectFocus("extension")
      setConnectTour(true)
      setError("Connect Odds in Chrome, then try again.")
    }
  }

  // A Broods run behind this Apply: its own title and line (what it does now), and its live panel under the progress.
  const drive = driveOf(post.id)
  const driveTitles: Record<string, string> = {
    "Applying…": "Working on your application",
    "You're filling in": "You're filling in",
    "Review & send": "Ready to review",
    Captcha: "Captcha on the page",
    "Sign in": "Sign in on the tab",
    "Your answers": "Needs your answer",
    "Your consent": "Your consent is required",
    "Cover letter": "Add a cover letter",
    "Wrong job": "The link opens a different job",
    Stuck: "Your turn",
    "Needs you": "Needs you",
    Closed: "Applications closed",
    Reconnect: "Reconnect Odds",
  }
  const progressTitle = drive ? driveTitles[driveLabel(drive)] : undefined
  const progressLine = drive ? driveWhy(drive) : view?.message
  const driveLive = <DriveLive post={post} questionsOpen={questionsOpen} />
  // Broods asked these questions: answering them here carries it on by itself, with the answers.
  const answered = (): void => {
    const d = driveOf(post.id)
    // Any stop that waits on the person (questions, a letter, a detail): one Save and continue carries Broods on with everything they added.
    if (d && (d.status === "needs_you" || (d.status === "stuck" && d.reason !== "closed"))) void driveControl(d.runId, "continue").then((ok) => { if (ok) toast.message("Broods carries on with your answers.") })
  }
  const revealGate = view ? applyNeedsReveal(view.status, view.message || "") : false
  const stuck = revealGate && /after (odds )?assist|odds assist could not|broods could not|agent gave up|reconnect/i.test(view?.message || "")
  const msg = view?.message || ""
  // Captcha vs Account must not share the same button/copy (old stuck text said both and looked broken).
  const captcha = revealGate && !stuck && /captcha|verify you are human|security verification/i.test(msg) && !/captcha or account/i.test(msg)
  const login = revealGate && !stuck && !captcha && /password|create (an )?account|account (or login|required)|sign in or make|account or login required|register|sign up|choose your password|email from your odds profile|sign in to (linkedin|indeed|glassdoor)|still not signed in to/i.test(msg)
  const phase: ApplyPhase | null = questionsOpen && mergedPhase !== "ready" && mergedPhase !== "failed"
    ? "needs_input"
    : mergedPhase
  const needsPerson = Boolean(revealGate || view?.status === "ready" || view?.status === "needs_input" || questionsOpen || phase === "needs_input" || phase === "ready")
  const driveQuiet = Boolean(drive && drive.status === "running" && !drive.filling && now - drive.updatedAt >= 15_000)
  const stalled = (view?.status === "filling" && now - view.at > 15_000) || driveQuiet
  const activeRun = run && activeApplication(run)
  const unavailable = run?.status === "failed" && /no longer accepting applications|not currently accepting applications|job is closed|applications are closed|no longer available/i.test(run.message || "")

  // Hard Connect gate (or still looking / phone queue): never start Apply until linked here.
  if (!embedded && !extensionReady) {
    if (!userId || post.local) return null
    const openConnect = (): void => {
      rememberConnectFocus("extension")
      setConnectTour(true)
    }
    const press = (): void => {
      if (needsConnectGate && !view && !activeRun) {
        openConnect()
        return
      }
      setPending(true)
      const reveal = Boolean(view || activeRun)
      void beginApply({ reveal, continueRun: Boolean(activeRun) }).finally(() => setPending(false))
    }
    const gateOnly = needsConnectGate && !view && !activeRun
    const tabClosedGate = /application tab was closed|reopen application/i.test(view?.message || "")
    const label = unavailable ? "Applications closed"
      : pending ? "Opening tab…"
      : gateOnly ? "Connect Odds in Chrome"
      : tabClosedGate ? "Reopen application tab"
      : phase === "ready" ? "Open tab: review and send"
      : phase === "filling" || activeRun ? (run?.status === "queued" ? "Waiting for Chrome…" : "Open application tab")
      : needsPerson ? (questionsOpen ? "Open tab: answer left" : "Open application tab")
      : run?.status === "failed" ? "Try again"
      : extensionPresent === "looking" ? "Apply with Odds"
      : "Connect Odds in Chrome"
    const canPress = !pending && !unavailable && (gateOnly || Boolean(view || activeRun) || extensionPresent === "looking")
    const primary = canPress ? (
      <Button type="button" disabled={Boolean(activeRun && run.status === "queued") && !view && !gateOnly} onClick={press} className="h-11 min-h-11 w-full flex-1 cursor-pointer rounded-lg bg-brand-ink text-base text-white hover:bg-brand-ink/90">
        {label}
      </Button>
    ) : null
    const cancel = activeRun ? (
      <Button type="button" variant="outline" disabled={pending} onClick={() => {
        setPending(true)
        void cancelApplication(run.id).then(() => {
          clearApplyActivity(post.id)
          setRun({ ...run, status: "cancelled", message: "Cancelled." })
          setTabState(null)
        }).catch(() => setError("Could not cancel. Try again.")).finally(() => setPending(false))
      }} className="h-11 cursor-pointer rounded-lg px-5 text-base">Cancel</Button>
    ) : null

    return (
      <div className={`flex w-full flex-col gap-4 transition-colors duration-150 ${phase ? (phase === "needs_input" ? "rounded-xl border border-brand/40 bg-card p-4" : "rounded-xl border border-line bg-card p-4") : ""}`}>
        {phase && (view || activeRun) ? (
          <button type="button" disabled={pending || unavailable} onClick={press} className="w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-default disabled:opacity-70">
            <ApplyProgress phase={phase} message={progressLine} title={progressTitle} />
          </button>
        ) : phase ? <ApplyProgress phase={phase} message={progressLine} title={progressTitle} /> : null}
        {driveLive}
        {phase === "ready" ? <div className="flex flex-col gap-2 sm:flex-row">{primary}{cancel}</div> : <ApplicationQuestions inline postingId={post.id} onHasQuestions={setQuestionsOpen} onSaved={answered} aside={primary} empty={<div className="flex flex-col gap-2 sm:flex-row">{primary}{phase === "needs_input" ? null : cancel}</div>} />}
        {phase === "needs_input" && cancel ? <div className="flex">{cancel}</div> : null}
        {phase === "failed" && view?.message ? <p role="alert" className="text-sm text-destructive">{view.message}</p> : null}
        {gateOnly ? <p className="text-sm text-muted-foreground">Install and Connect Odds for Chrome once — then Apply fills forms in this browser.</p> : null}
        {!gateOnly && !online && !activeRun && !view && extensionPresent === "no" ? <p className="text-sm text-muted-foreground">Open Chrome on your computer to start, or reload the Odds extension.</p> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <ExtensionOnboard
          open={connectTour}
          onClose={() => setConnectTour(false)}
          onConnected={() => {
            setConnectTour(false)
            pingExtension()
          }}
        />
      </div>
    )
  }
  if (embedded && !parent) {
    return null
  }

  const liveApply = Boolean(view && ["filling", "needs_input", "ready"].includes(phase || ""))
  const tabClosed = /application tab was closed|reopen application/i.test(view?.message || "")
  const label = sent
    ? "Opening tab…"
    : !view ? "Apply with Odds"
    : view.status === "submitted" ? "Application sent"
    : view.status === "failed" ? "Try again"
    : tabClosed ? "Reopen application tab"
    : captcha ? "Open tab: captcha"
    : login ? "Open tab: account or login"
    : phase === "ready" || normalizeApplyStatus(view.status, view.message || "") === "ready" ? "Open tab: review and send"
    : stuck ? "Open stuck tab"
    : questionsOpen ? "Open tab: answer left"
    : phase === "filling" ? "Open application tab"
    : "Open application tab"
  const press = (): void => {
    if (view?.status === "submitted") return
    setSent(true)
    // Never leave the button stuck — focus is async in Chrome; UI resets in under a second.
    window.setTimeout(() => setSent(false), 700)
    // First press = Apply with Odds (background). Any later press = Open application tab (focus).
    void beginApply({ reveal: Boolean(view) }).finally(() => setSent(false))
  }
  // Only show a control when it does something — never a dead “working in the background” button.
  const primary = view?.status === "submitted" ? null : (
    <Button type="button" onClick={press} className="h-11 min-h-11 w-full flex-1 cursor-pointer rounded-lg bg-brand-ink text-base text-white hover:bg-brand-ink/90">
      {label}
    </Button>
  )

  return (
    <div className={`flex w-full flex-col gap-4 transition-colors duration-150 ${phase ? (phase === "needs_input" ? "rounded-xl border border-brand/40 bg-card p-4" : "rounded-xl border border-line bg-card p-4") : ""}`}>
      {phase && liveApply ? (
        <button type="button" onClick={press} className="w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <ApplyProgress phase={phase} message={progressLine} title={progressTitle} />
        </button>
      ) : phase ? <ApplyProgress phase={phase} message={progressLine} title={progressTitle} /> : null}
      {driveLive}
      {primary && (captcha || login || phase === "ready") ? <div className="flex gap-2">{primary}</div> : primary ? <ApplicationQuestions inline postingId={post.id} onHasQuestions={setQuestionsOpen} onSaved={answered} aside={primary} empty={<div className="flex gap-2">{primary}</div>} /> : null}
      {stalled && !stuck ? (
        <p className="text-sm text-muted-foreground">
          {driveQuiet
            ? "Waiting for the form or Broods — no new step yet. Open the tab if you want to check, or Stop if you want Odds to pause."
            : "Still filling in the open tab. Odds retries if it stalls, then reports here if it cannot move on."}
        </p>
      ) : null}
      {captcha && !stuck && !drive ? <p className="text-sm text-muted-foreground">Complete the captcha in the tab. Odds continues after you solve it — it never solves captchas for you.</p> : null}
      {login && !stuck && !drive ? <p className="text-sm text-muted-foreground">Sign in to the job board in that Chrome tab — Odds continues when the wall clears. Odds never types passwords. Chrome keeps the session for the next Apply.</p> : null}
      {boardNote && !view ? <p className="text-sm text-muted-foreground">This job’s only link is Glassdoor/Indeed — Apply opens that page (not LinkedIn).</p> : null}
      {view?.status === "failed" && view.message ? <p role="alert" className="text-sm text-destructive">{view.message}</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <ExtensionOnboard open={connectTour} onClose={() => setConnectTour(false)} onConnected={() => { setConnectTour(false); pingExtension() }} />
    </div>
  )
}
