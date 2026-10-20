import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { JobDocuments } from "@/components/JobDocuments"
import { moveJob } from "@/components/job-steps"
import { clearApplyActivity, dismissDriveRun, driveOf, sentAskOf, useApplyActivityTick } from "@/lib/apply-activity"
import { useData } from "@/lib/data"
import { driveControl, driveSteps, type DriveStep } from "@/lib/drive-runs"
import type { Posting } from "@/lib/types"

const ago = (iso: string, now: number): string => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  return s < 5 ? "now" : s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
}

/**
 * Broods at work on this job, live: what it is doing now and the steps before it (in its own words), or exactly what it waits for,
 * with the person's moves right there. Shown only while the application tab is open; Broods carries on by itself once they handled
 * what it waits for. Never a silent spinner.
 */
/** `questionsOpen`: Broods' questions are shown below; their Save and continue carries Broods on, so no second button here. */
export function DriveLive({ post, questionsOpen = false }: { post: Posting; questionsOpen?: boolean }): React.JSX.Element | null {
  useApplyActivityTick()
  const data = useData()
  const drive = driveOf(post.id)
  const [steps, setSteps] = useState<DriveStep[]>([])
  const [busy, setBusy] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [activityError, setActivityError] = useState("")
  const [now, setNow] = useState(() => Date.now())
  const runId = drive?.runId
  const running = drive?.status === "running"

  useEffect(() => {
    if (!runId || !activityOpen) return
    let gone = false
    const pull = (): void => {
      if (document.hidden) return
      void driveSteps(runId).then((rows) => { if (!gone) { setSteps(rows); setActivityError("") } }).catch(() => { if (!gone) setActivityError("Could not load activity. Close and reopen Activity to try again.") })
      setNow(Date.now())
    }
    pull()
    if (!running) return () => { gone = true }
    const timer = window.setInterval(pull, 2000)
    return () => { gone = true; window.clearInterval(timer) }
  }, [activityOpen, runId, running])

  if (!drive) return <SentAsk post={post} />
  const act = (action: "stop" | "continue" | "sent"): void => {
    setBusy(true)
    void driveControl(drive.runId, action).then((ok) => {
      if (!ok) return void toast.error("That did not go through. Try again.")
      if (action === "continue") toast.message("Continuing in Chrome.")
      if (action === "sent") {
        dismissDriveRun(drive.runId)
        clearApplyActivity(post.id)
        moveJob(data, post, "applied", "").catch(() => undefined)
      }
    }).finally(() => setBusy(false))
  }

  return (
    <div className="flex flex-col gap-3">
      {drive.reason === "letter" ? <JobDocuments post={post} /> : null}
      {runId ? (
        <details open={activityOpen} onToggle={(event) => setActivityOpen(event.currentTarget.open)} className="group text-sm">
          <summary className="cursor-pointer font-medium text-foreground">Activity</summary>
          {activityError ? <p role="alert" className="mt-2 text-muted-foreground">{activityError}</p> : null}
          <ol aria-label="Application activity" className="mt-3 flex flex-col gap-2 border-l border-line pl-3">
            {steps.slice(0,5).map(s=><li key={s.id} className="flex items-start justify-between gap-3"><span className="min-w-0 text-foreground">{s.note}</span><time className="shrink-0 text-xs tabular-nums text-muted-foreground">{ago(s.created_at,now)}</time></li>)}
          </ol>
        </details>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {drive.reason === "letter" && drive.status === "needs_you" && !questionsOpen ? (
          <Button type="button" disabled={busy} onClick={() => act("continue")} className="h-10 cursor-pointer rounded-lg bg-brand-ink px-4 text-white hover:bg-brand-ink/90">I added it — carry on</Button>
        ) : null}
        {drive.status === "stuck" && drive.reason !== "closed" ? (
          <Button type="button" disabled={busy} onClick={() => act("continue")} className="h-10 cursor-pointer rounded-lg bg-brand-ink px-4 text-white hover:bg-brand-ink/90">Try again</Button>
        ) : null}
        {running ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => act("stop")}>Stop</Button> : null}
      </div>
    </div>
  )
}

/** Broods ended at Review & send and the tab closed with no word from the employer: asked once, on the job, then gone. */
function SentAsk({ post }: { post: Posting }): React.JSX.Element | null {
  useApplyActivityTick()
  const data = useData()
  const runId = sentAskOf(post.id)
  const [busy, setBusy] = useState(false)
  if (!runId) return null
  const answer = (sent: boolean): void => {
    setBusy(true)
    void driveControl(runId, sent ? "sent" : "stop").then((ok) => {
      if (!ok) return void toast.error("That did not go through. Try again.")
      dismissDriveRun(runId)
      clearApplyActivity(post.id)
      if (sent) moveJob(data, post, "applied", "").catch(() => undefined)
    }).finally(() => setBusy(false))
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm">Broods filled this in up to Submit. Did you send it?</p>
      <div className="flex gap-2">
        <Button type="button" disabled={busy} onClick={() => answer(true)} className="h-9 cursor-pointer rounded-lg bg-brand-ink px-3 text-white hover:bg-brand-ink/90">Yes, mark Applied</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => answer(false)} className="h-9 cursor-pointer rounded-lg px-3">No</Button>
      </div>
    </div>
  )
}
