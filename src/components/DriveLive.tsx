import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { JobDocuments } from "@/components/JobDocuments"
import { moveJob } from "@/components/job-steps"
import { clearApplyActivity, dismissDriveRun, driveOf, driveWhy, useApplyActivityTick } from "@/lib/apply-activity"
import { useData } from "@/lib/data"
import { driveControl, driveSteps, type DriveStep } from "@/lib/drive-runs"
import type { Posting } from "@/lib/types"

const ago = (iso: string, now: number): string => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000))
  return s < 5 ? "now" : s < 60 ? `${s}s` : `${Math.round(s / 60)}m`
}

/**
 * Broods at work on this job, live: what it is doing now and the steps before it (in its own words), or exactly what it waits for,
 * with the person's moves right there — Continue once they handled it, Stop, or I sent it. Never a silent spinner.
 */
export function DriveLive({ post, onOpenTab }: { post: Posting; onOpenTab: () => void }): React.JSX.Element | null {
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

  if (!drive) return null
  const act = (action: "stop" | "continue" | "sent"): void => {
    setBusy(true)
    void driveControl(drive.runId, action).then((ok) => {
      if (!ok) return void toast.error("That did not go through. Try again.")
      if (action === "continue") {
        toast.message("Broods carries on in your Chrome tab.")
        if (drive.tabGone) onOpenTab()
      }
      if (action === "sent") {
        dismissDriveRun(drive.runId)
        clearApplyActivity(post.id)
        moveJob(data, post, "applied", "").catch(() => undefined)
      }
    }).finally(() => setBusy(false))
  }
  const waiting = !running || drive.tabGone

  return (
    <div className="flex flex-col gap-3">
      <p className={`text-sm ${waiting ? "font-medium text-foreground" : "text-muted-foreground"}`}>{driveWhy(drive)}</p>
      {drive.reason === "letter" ? <JobDocuments post={post} /> : null}
      {steps.length ? (
        <ol aria-label="What Broods is doing" className="flex flex-col gap-1.5 rounded-lg bg-secondary/60 p-3 text-sm">
          {steps.map((s, i) => (
            <li key={s.id} className={`flex items-start gap-2 ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
              <span aria-hidden="true" className={`mt-1.5 size-1.5 shrink-0 rounded-full ${i === 0 && running && !drive.tabGone ? "bg-brand motion-safe:animate-pulse" : "bg-border"}`} />
              <span className="min-w-0 flex-1">{s.note}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{ago(s.created_at, now)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {waiting && drive.reason !== "closed" && drive.status !== "submitted" ? (
          <Button type="button" disabled={busy} onClick={() => act("continue")} className="h-10 cursor-pointer rounded-lg bg-brand-ink px-4 text-white hover:bg-brand-ink/90">Continue with Broods</Button>
        ) : null}
        {running && !drive.tabGone ? <Button type="button" variant="outline" disabled={busy} onClick={() => act("stop")} className="h-10 cursor-pointer rounded-lg px-4">Stop Broods</Button> : null}
        {drive.status !== "submitted" ? <Button type="button" variant="outline" disabled={busy} onClick={() => act("sent")} className="h-10 cursor-pointer rounded-lg px-4">I sent it</Button> : null}
      </div>
    </div>
  )
}
