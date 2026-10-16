import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { JobDocuments } from "@/components/JobDocuments"
import { moveJob } from "@/components/job-steps"
import { clearApplyActivity, dismissDriveRun, driveOf, driveWhy, sentAskOf, useApplyActivityTick } from "@/lib/apply-activity"
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
export function DriveLive({ post }: { post: Posting }): React.JSX.Element | null {
  useApplyActivityTick()
  const data = useData()
  const drive = driveOf(post.id)
  const [steps, setSteps] = useState<DriveStep[]>([])
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const runId = drive?.runId
  const running = drive?.status === "running"

  useEffect(() => {
    if (!runId) return
    let gone = false
    const pull = (): void => { void driveSteps(runId).then((s) => { if (!gone) setSteps(s) }); setNow(Date.now()) }
    pull()
    if (!running) return () => { gone = true }
    const timer = window.setInterval(pull, 2000)
    return () => { gone = true; window.clearInterval(timer) }
  }, [runId, running])

  if (!drive) return <SentAsk post={post} />
  const act = (action: "stop" | "continue" | "sent"): void => {
    setBusy(true)
    void driveControl(drive.runId, action).then((ok) => {
      if (!ok) return void toast.error("That did not go through. Try again.")
      if (action === "continue") toast.message("Broods carries on in your Chrome tab.")
      if (action === "sent") {
        dismissDriveRun(drive.runId)
        clearApplyActivity(post.id)
        moveJob(data, post, "applied", "").catch(() => undefined)
      }
    }).finally(() => setBusy(false))
  }
  const waiting = !running

  return (
    <div className="flex flex-col gap-3">
      <p className={`text-sm ${waiting ? "font-medium text-foreground" : "text-muted-foreground"}`}>{driveWhy(drive)}</p>
      {drive.reason === "letter" ? <JobDocuments post={post} /> : null}
      {steps.length ? (
        <ol aria-label="What Broods is doing" className="flex flex-col gap-1.5 rounded-lg bg-secondary/60 p-3 text-sm">
          {steps.map((s, i) => (
            <li key={s.id} className={`flex items-start gap-2 ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
              <span aria-hidden="true" className={`mt-1.5 size-1.5 shrink-0 rounded-full ${i === 0 && running && !drive.filling ? "bg-brand motion-safe:animate-pulse" : "bg-border"}`} />
              <span className="min-w-0 flex-1">{s.note}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{ago(s.created_at, now)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {drive.reason === "letter" && drive.status === "needs_you" ? (
          <Button type="button" disabled={busy} onClick={() => act("continue")} className="h-10 cursor-pointer rounded-lg bg-brand-ink px-4 text-white hover:bg-brand-ink/90">I added it — carry on</Button>
        ) : null}
        {drive.status === "stuck" && drive.reason !== "closed" ? (
          <Button type="button" disabled={busy} onClick={() => act("continue")} className="h-10 cursor-pointer rounded-lg bg-brand-ink px-4 text-white hover:bg-brand-ink/90">Try again</Button>
        ) : null}
        {running ? <Button type="button" variant="outline" disabled={busy} onClick={() => act("stop")} className="h-10 cursor-pointer rounded-lg px-4">Stop Broods</Button> : null}
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
