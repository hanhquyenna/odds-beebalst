import { toast } from "sonner"
import { applyActivityOf, clearApplyActivity, closedApplyHandled, isLiveApply, markClosedApplyHandled } from "@/lib/apply-activity"
import type { Posting } from "@/lib/types"

/** Same meaning as apply-activity CLOSED_MSG — LinkedIn / employer “not accepting”. */
export const JOB_CLOSED_MSG =
  /no longer accepting applications|not currently accepting applications|applications are closed|no longer available|vacature gesloten|this job is no longer available|this job is no longer accepting/i

const toasted = new Set<string>()

export function isJobClosedMessage(message: string | null | undefined): boolean {
  return JOB_CLOSED_MSG.test(message || "")
}

type Saver = { saved: Set<string>; setSaved: (id: string, on: boolean) => void; setPassed: (id: string, on: boolean) => void }

/**
 * Job is closed on the board and/or Apply just reported it.
 * Keep Saved, drop the live Apply chip, toast once; Closed badge comes from closed_at.
 */
export function settleClosedJob(
  data: Saver,
  post: Pick<Posting, "id" | "title"> & { closed_at?: string | null },
  opts?: { message?: string; fromApply?: boolean },
): void {
  if (!post.id) return
  const fromApply = opts?.fromApply === true || isJobClosedMessage(opts?.message)
  if (!post.closed_at && !fromApply) return

  if (!data.saved.has(post.id)) {
    data.setSaved(post.id, true)
    data.setPassed(post.id, false)
  }
  const activity = applyActivityOf(post.id)
  const alreadyHandled = closedApplyHandled(post.id)
  // Restoring an old run is background synchronization, not a new user alert.
  const recentAttempt = Boolean(activity && Date.now() - activity.pinnedAt < 5 * 60_000)
  markClosedApplyHandled(post.id)
  // Don't keep a live pin — Closed badge + Saved at bottom of tracker.
  if (isLiveApply(applyActivityOf(post.id)) || applyActivityOf(post.id)) {
    clearApplyActivity(post.id)
  }

  if (opts?.fromApply !== true || alreadyHandled || !recentAttempt || toasted.has(post.id)) return
  toasted.add(post.id)
  toast.message("Sorry — this job is closed", {
    description: `${post.title} is no longer accepting applications. Kept in Saved at the bottom of your tracker.`,
    id: `job-closed-${post.id}`,
    duration: 6500,
  })
}

/** Test helper — reset once-per-job toast gate. */
export function resetClosedJobToasts(): void {
  toasted.clear()
}
