import {
  applyActivityOf,
  applyActivityPhase,
  applyNeedsReveal,
  isLiveApply,
  normalizeApplyStatus,
  type ApplyActivity,
} from "@/lib/apply-activity"
import type { ApplicationState } from "@/lib/embed"
import type { ApplyPhase } from "@/components/ApplyProgress"

/**
 * One view of Apply progress for a job: extension tab state, server run, and
 * local live activity (tracker chip). Drawer + row chips must show the same stage.
 */
export function mergeApplyView(input: {
  postingId: string
  /** Latest report from the Chrome apply tab (may be null if poll missed). */
  tab: ApplicationState | null
  /** Server queue run, when the extension path is not used. */
  runStatus?: string | null
  runMessage?: string | null
}): { view: ApplicationState | null; phase: ApplyPhase | null; activity: ApplyActivity | null } {
  const activity = applyActivityOf(input.postingId)
  const live = isLiveApply(activity) ? activity : null

  let view: ApplicationState | null = null
  if (input.tab && input.tab.status !== "submitted") {
    view = input.tab
    // Prefer a newer local activity message (e.g. marked questions) so the drawer matches the row chip.
    if (live && live.at >= input.tab.at - 500 && live.message) {
      view = {
        status: live.status === "submitted" ? input.tab.status : live.status,
        message: live.message,
        at: Math.max(live.at, input.tab.at),
      }
    }
  } else if (live) {
    view = { status: live.status, message: live.message, at: live.at }
  } else if (input.runStatus && ["queued", "filling", "needs_input", "ready", "failed"].includes(input.runStatus)) {
    const status = (input.runStatus === "queued" ? "filling" : input.runStatus) as ApplicationState["status"]
    view = { status, message: input.runMessage || "", at: Date.now() }
  }

  if (!view) return { view: null, phase: null, activity: live }

  const norm = normalizeApplyStatus(view.status, view.message || "")
  const reveal = applyNeedsReveal(view.status, view.message || "")
  let phase: ApplyPhase | null =
    view.status === "failed" || norm === "failed"
      ? "failed"
      : norm === "ready"
        ? "ready"
        : reveal || norm === "needs_input"
          ? "needs_input"
          : view.status === "needs_input"
            ? "filling"
            : view.status === "filling"
              ? "filling"
              : null

  // If we only have live activity, trust its phase helper.
  if (live && !input.tab) {
    const p = applyActivityPhase(live)
    if (p) phase = p
  }

  return { view, phase, activity: live }
}
