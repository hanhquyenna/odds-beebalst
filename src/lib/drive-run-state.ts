// What a Broods run is, and when its tab is gone: pure, so the tracker logic stays testable without the network.

export type DriveStatus = "running" | "review" | "needs_you" | "stuck" | "failed" | "stopped" | "submitted"
export type DriveReason = "captcha" | "account" | "questions" | "letter" | "closed" | "quiet" | "other"

export interface DriveRun {
  id: string
  posting_id: string | null
  url: string
  status: DriveStatus
  reason: DriveReason | null
  message: string | null
  last_note: string | null
  steps: number
  last_seen_at: string | null
  updated_at: string
  created_at: string
}

/** The tab stopped asking for steps this long ago: Chrome or the tab is gone (or asleep), the run cannot move. */
export const TAB_GONE_MS = 90_000
/** Running on the server, but no tab has asked for a step in a while. */
export function tabGone(run: Pick<DriveRun, "status" | "last_seen_at" | "created_at">, now = Date.now()): boolean {
  if (run.status !== "running") return false
  const seen = Date.parse(run.last_seen_at ?? run.created_at)
  return now - seen > TAB_GONE_MS
}
