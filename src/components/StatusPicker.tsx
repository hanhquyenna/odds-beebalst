import { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ChevronDownIcon } from "@/components/icons"
import { STEPS, moveJob, stepOf, type Step } from "@/components/job-steps"
import { useFit } from "@/components/FitCells"
import { toast } from "sonner"
import { applyActivityLabel, applyActivityOf, clearApplyActivity, dismissDriveRun, driveOf, isLiveApply, useApplyActivityTick, type DriveInfo } from "@/lib/apply-activity"
import { driveControl } from "@/lib/drive-runs"
import { prepareInExtension } from "@/lib/extension-connect"
import { useData } from "@/lib/data"
import { removeFromList } from "@/lib/save"
import { lookOf, statusColors } from "@/lib/status-colors"
import type { Posting } from "@/lib/types"

const LIVE = "__live__"
const ACT = { open: "__open__", cont: "__continue__", stop: "__stop__", sent: "__sent__", answer: "__answer__" } as const
type Pick = Step | "none" | typeof EDIT_COLORS | typeof LIVE | (typeof ACT)[keyof typeof ACT]

/** What the person can do with a live application, at the top of the status menu. */
function liveActions(drive: DriveInfo | null): Array<[string, string]> {
  const out: Array<[string, string]> = [[ACT.open, "Open the application tab"]]
  if (!drive) return out
  if (drive.status === "running") out.push([ACT.stop, "Stop Broods"])
  // Stuck (not waiting on the person): one more go, on request. Waiting on the person carries on by itself once they handled it.
  if (drive.status === "stuck" && drive.reason !== "closed") out.push([ACT.cont, "Try again"])
  if (drive.reason === "questions") out.push([ACT.answer, "Answer the questions"])
  if (drive.reason === "letter") out.push([ACT.answer, "Add a cover letter"])
  return out
}

/**
 * One status control for a job, live or not: the live chip (Applying… / You're filling in / Captcha / Sign in / Your answers / Cover letter / Stuck / Review & send), only while its tab is open,
 * while Broods works, and always the person's own statuses underneath. Picking a status yourself always wins: it stops Broods on that job
 * and clears the live chip — a status is never locked behind a run.
 */
function useStatusControl(post: Posting, fit: string, onOpen?: (post: Posting) => void): {
  value: string
  label: string
  title: string
  liveApply: boolean
  actions: Array<[string, string]>
  look: { style: React.CSSProperties | undefined; ink: string | undefined }
  pick: (next: Pick) => void
  asking: boolean
  setAsking: (v: boolean) => void
} {
  useApplyActivityTick()
  const data = useData()
  const app = data.applications.find((a) => a.posting_id === post.id)
  const tracked = data.saved.has(post.id) || Boolean(app)
  const step: Step | "none" = tracked ? stepOf(data, post) : "none"
  // Closed server-wide: drop a stale Captcha/Applying chip so the row stops thrashing.
  useEffect(() => {
    if (post.closed_at && applyActivityOf(post.id)) clearApplyActivity(post.id)
  }, [post.closed_at, post.id])
  const live = applyActivityOf(post.id)
  const liveApply = Boolean(!post.closed_at && isLiveApply(live))
  const drive = liveApply ? driveOf(post.id) : null
  const label = liveApply && live ? applyActivityLabel(live) : step === "none" ? "Not saved" : (STEPS.find((c) => c.step === step)?.title ?? "Saved")
  const title = liveApply && live ? (drive ? `${live.message}${drive.steps ? ` (step ${drive.steps})` : ""}` : live.message) : label
  const look = useStatusLook(step)
  const [asking, setAsking] = useState<boolean>(false)

  /** The person took over: Broods stops on this job and its chip goes (a later Apply shows again). */
  const letGo = (): void => {
    if (drive) {
      if (drive.status === "running") void driveControl(drive.runId, "stop")
      dismissDriveRun(drive.runId)
    }
    clearApplyActivity(post.id)
  }
  const openTab = (): void => {
    const url = live?.url
    if (url) void prepareInExtension(url, { reveal: true, postingId: post.id }).catch(() => toast.error("Odds in Chrome did not answer. Open Chrome, then try again."))
    else onOpen?.(post)
  }

  function pick(next: Pick): void {
    if (next === LIVE) return
    if (next === EDIT_COLORS) {
      openStatusColors()
      return
    }
    if (next === ACT.open) return openTab()
    if (next === ACT.answer) {
      onOpen?.(post)
      return
    }
    if (next === ACT.stop && drive) {
      void driveControl(drive.runId, "stop").then((ok) => { if (!ok) toast.error("Could not stop Broods. Try again.") })
      return
    }
    if (next === ACT.cont && drive) {
      void driveControl(drive.runId, "continue").then((ok) => {
        if (!ok) toast.error("That did not go through. Try again.")
        else toast.message("Broods tries again in your Chrome tab.")
      })
      return
    }
    if (next === ACT.sent) {
      if (drive) void driveControl(drive.runId, "sent")
      letGo()
      moveJob(data, post, "applied", fit).catch(() => undefined)
      return
    }
    if (next === "none") {
      // Taking a job off your list asks first.
      setAsking(true)
      return
    }
    // Applied while Broods is on it: the run is done (sent), not stopped.
    if (liveApply && next === "applied" && drive) { void driveControl(drive.runId, "sent"); dismissDriveRun(drive.runId); clearApplyActivity(post.id) }
    else if (liveApply) letGo()
    if (next !== step) moveJob(data, post, next as Step, fit).catch(() => undefined)
  }

  return { value: liveApply ? LIVE : step, label, title, liveApply, actions: liveApply ? liveActions(drive) : [], look, pick, asking, setAsking }
}

/** The menu itself: live actions first, then every status, then Edit colors. */
function StatusOptions({ c }: { c: ReturnType<typeof useStatusControl> }): React.JSX.Element {
  return (
    <>
      {c.liveApply ? <option value={LIVE} disabled hidden>{c.label}</option> : null}
      {c.actions.length ? (
        <optgroup label="Broods">
          {c.actions.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </optgroup>
      ) : null}
      <optgroup label={c.liveApply ? "Set the status yourself" : "Status"}>
        <option value="none">Not saved</option>
        {STEPS.map((s) => (
          <option key={s.step} value={s.step}>
            {s.title}
          </option>
        ))}
      </optgroup>
      <option value={EDIT_COLORS}>Edit colors</option>
    </>
  )
}

/**
 * Where this job stands in your search, set from the job itself: not saved,
 * saved, applied, interview, offer or closed. Marking it Applied is what counts
 * it in your odds; there is no separate button for that.
 */
export function StatusPicker({ post, fit, onLocked }: { post: Posting; fit: string; onLocked?: () => void }): React.JSX.Element | null {
  const data = useData()
  const c = useStatusControl(post, fit)

  // Same pattern as RowStatus: visible label + invisible select on top (no Saved text bleeding through).
  return (
    <span
      title={c.title}
      style={c.liveApply ? undefined : c.look.style}
      className={`relative inline-flex h-8 min-w-[7.5rem] items-center gap-2 rounded-lg border-[1.5px] pr-7 pl-3 text-sm font-medium transition-colors duration-150 hover:brightness-95 ${c.liveApply ? "border-brand bg-brand/10 text-brand" : c.look.style ? "" : "bg-card text-foreground"}`}
    >
      {c.liveApply ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand motion-safe:animate-pulse" /> : null}
      <span className="truncate">{c.label}</span>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 opacity-80" style={{ color: c.liveApply ? "var(--brand)" : c.look.ink }} aria-hidden="true" />
      <select
        aria-label="Status"
        value={c.value}
        onChange={(e) => {
          const next = e.target.value as Pick
          if (onLocked && next !== EDIT_COLORS && !String(next).startsWith("__")) return onLocked()
          c.pick(next)
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        <StatusOptions c={c} />
      </select>
      {c.asking ? <ConfirmDialog title="Remove this job from your list?" confirm="Remove" onCancel={() => c.setAsking(false)} onConfirm={() => { c.setAsking(false); clearApplyActivity(post.id); removeFromList(data, post) }} /> : null}
    </span>
  )
}

/** The same status, small enough for a row of your list, so you change it without opening the job. A pill showing the step; the real select sits invisibly on top so it stays a native, keyboard-friendly control. */
export function RowStatus({ post, onOpen }: { post: Posting; onOpen?: (post: Posting) => void }): React.JSX.Element {
  const st = useFit(post)
  const fit = st ? (st.failing === 0 ? "met every requirement" : st.failing === 1 ? "missing one requirement" : "missing several requirements") : ""
  const data = useData()
  const c = useStatusControl(post, fit, onOpen)

  return (
    <span title={c.title} style={c.liveApply ? undefined : c.look.style} className={`relative z-10 inline-flex h-8 w-32 items-center gap-2 rounded-lg border-[1.5px] pr-7 pl-3 text-sm font-medium transition-colors duration-150 focus-within:ring-3 focus-within:ring-ring/50 hover:brightness-95 ${c.liveApply ? "border-brand bg-brand/10 text-brand" : c.look.style ? "" : "bg-card text-foreground"}`}>
      <span aria-hidden="true" style={{ backgroundColor: c.liveApply ? "var(--brand)" : (c.look.ink ?? "var(--border)") }} className={`size-2 shrink-0 rounded-full ${c.liveApply && c.label === "Applying…" ? "motion-safe:animate-pulse" : ""}`} />
      <span className="truncate">{c.label}</span>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 opacity-80" aria-hidden="true" />
      <select aria-label={`Status of ${post.title}`} value={c.value} onChange={(e) => c.pick(e.target.value as Pick)} className="absolute inset-0 size-full cursor-pointer opacity-0">
        <StatusOptions c={c} />
      </select>
      {c.asking ? <ConfirmDialog title="Remove this job from your list?" confirm="Remove" onCancel={() => c.setAsking(false)} onConfirm={() => { c.setAsking(false); clearApplyActivity(post.id); removeFromList(data, post) }} /> : null}
    </span>
  )
}

/** Asks the colour editor (mounted once, in StatusColorsDialog) to open. The status menus call this from their last choice, "Edit colors". */
export const EDIT_COLORS = "__edit_colors__"
export const openStatusColors = (): void => {
  window.dispatchEvent(new CustomEvent("odds:edit-status-colors"))
}

/** The look of a status for this person: their colour and the ink on it, or none for a job that is not saved. */
function useStatusLook(value: string): { style: React.CSSProperties | undefined; ink: string | undefined } {
  const data = useData()
  const look = lookOf(value, statusColors(data.profile.statusColors))

  return look ? { style: { backgroundColor: look.background, color: look.ink, borderColor: "transparent" }, ink: look.ink } : { style: undefined, ink: undefined }
}
