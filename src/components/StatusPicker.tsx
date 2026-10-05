import { useState } from "react"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ChevronDownIcon } from "@/components/icons"
import { STEPS, moveJob, stepOf, type Step } from "@/components/job-steps"
import { useFit } from "@/components/FitCells"
import { useData } from "@/lib/data"
import { removeFromList } from "@/lib/save"
import { lookOf, statusColors } from "@/lib/status-colors"
import type { Posting } from "@/lib/types"

/**
 * Where this job stands in your search, set from the job itself: not saved,
 * saved, applied, interview, offer or closed. Marking it Applied is what counts
 * it in your odds; there is no separate button for that.
 */
export function StatusPicker({ post, fit, onLocked }: { post: Posting; fit: string; onLocked?: () => void }): React.JSX.Element {
  const data = useData()
  const app = data.applications.find((a) => a.posting_id === post.id)
  const tracked = data.saved.has(post.id) || Boolean(app)
  const value: Step | "none" = tracked ? stepOf(data, post) : "none"
  const look = useStatusLook(value)
  const [asking, setAsking] = useState<boolean>(false)

  function change(next: Step | "none" | typeof EDIT_COLORS): void {
    // "Edit colors" is not a status: it opens the colour editor and the menu stays on the current status.
    if (next === EDIT_COLORS) {
      openStatusColors()

      return
    }
    if (onLocked) {
      onLocked()

      return
    }
    if (next === "none") {
      // Taking a job off your list asks first.
      setAsking(true)

      return
    }
    moveJob(data, post, next, fit).catch(() => undefined)
  }

  return (
    // The button is as wide as its name, with the arrow right after it, like the other buttons on the page (List, Sort).
    <label className="relative inline-flex items-center">
      <select
        aria-label="Status"
        value={value}
        onChange={(e) => change(e.target.value as Step | "none" | typeof EDIT_COLORS)}
        style={look.style}
        className={`h-8 field-sizing-content cursor-pointer appearance-none rounded-lg border-[1.5px] pr-8 pl-3 text-sm font-medium transition-colors duration-150 hover:brightness-95 ${look.style ? "" : "bg-card text-foreground"}`}
      >
        <option value="none" className="bg-card text-foreground">Not saved</option>
        {STEPS.map((c) => (
          <option key={c.step} value={c.step} className="bg-card text-foreground">
            {c.title}
          </option>
        ))}
        <option value={EDIT_COLORS} className="bg-card text-foreground">
          Edit colors
        </option>
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 opacity-80" style={{ color: look.ink }} aria-hidden="true" />
      {asking ? <ConfirmDialog title="Remove this job from your list?" confirm="Remove" onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); removeFromList(data, post) }} /> : null}
    </label>
  )
}


/** The same status, small enough for a row of your list, so you change it without opening the job. A pill showing the step; the real select sits invisibly on top so it stays a native, keyboard-friendly control. */
export function RowStatus({ post }: { post: Posting }): React.JSX.Element {
  const st = useFit(post)
  const fit = st ? (st.failing === 0 ? "met every requirement" : st.failing === 1 ? "missing one requirement" : "missing several requirements") : ""
  const data = useData()
  const app = data.applications.find((a) => a.posting_id === post.id)
  const tracked = data.saved.has(post.id) || Boolean(app)
  const value: Step | "none" = tracked ? stepOf(data, post) : "none"
  const label = value === "none" ? "Not saved" : (STEPS.find((c) => c.step === value)?.title ?? "Saved")
  const look = useStatusLook(value)
  const [asking, setAsking] = useState<boolean>(false)

  return (
    <span style={look.style} className={`relative z-10 inline-flex h-8 w-32 items-center gap-2 rounded-lg border-[1.5px] pr-7 pl-3 text-sm font-medium transition-colors duration-150 focus-within:ring-3 focus-within:ring-ring/50 hover:brightness-95 ${look.style ? "" : "bg-card text-foreground"}`}>
      <span aria-hidden="true" style={{ backgroundColor: look.ink ?? "var(--border)" }} className="size-2 shrink-0 rounded-full" />
      <span className="truncate">{label}</span>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 opacity-80" aria-hidden="true" />
      <select
        aria-label={`Status of ${post.title}`}
        value={value}
        onChange={(e) => {
          const next = e.target.value as Step | "none" | typeof EDIT_COLORS
          if (next === EDIT_COLORS) {
            openStatusColors()
          } else if (next === "none") {
            setAsking(true)
          } else {
            moveJob(data, post, next, fit).catch(() => undefined)
          }
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        <option value="none">Not saved</option>
        {STEPS.map((c) => (
          <option key={c.step} value={c.step}>
            {c.title}
          </option>
        ))}
        <option value={EDIT_COLORS}>Edit colors</option>
      </select>
      {asking ? <ConfirmDialog title="Remove this job from your list?" confirm="Remove" onCancel={() => setAsking(false)} onConfirm={() => { setAsking(false); removeFromList(data, post) }} /> : null}
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
