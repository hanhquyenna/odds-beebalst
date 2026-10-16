// What a Broods run is, and when its tab is gone: pure, so the tracker logic stays testable without the network.

export type DriveStatus = "running" | "review" | "needs_you" | "stuck" | "failed" | "stopped" | "submitted"
export type DriveReason = "captcha" | "account" | "questions" | "letter" | "closed" | "other"

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
  /** The person typed or clicked in the form themselves (Broods waits). */
  person_active_at?: string | null
  updated_at: string
  created_at: string
}

/** The tab stopped checking in this long ago: it is closed, or Chrome is gone or asleep. */
export const TAB_GONE_MS = 90_000
/** The person counts as filling in for this long after their last keystroke or click. */
export const PERSON_MS = 25_000

/** No tab is checking in for this run any more. */
export function tabGone(run: Pick<DriveRun, "last_seen_at" | "created_at">, now = Date.now()): boolean {
  const seen = Date.parse(run.last_seen_at ?? run.created_at)
  return now - seen > TAB_GONE_MS
}

/**
 * The run shows as a live layer over the job's own status only while it is in play AND its tab is open. A closed tab, a stopped or
 * sent run: the job simply shows its own status again (Saved, Applied…).
 */
export function onScreen(run: Pick<DriveRun, "status" | "last_seen_at" | "created_at">, now = Date.now()): boolean {
  return ["running", "needs_you", "stuck", "review"].includes(run.status) && !tabGone(run, now)
}

/** Ended at review with the tab closed and no word from the employer: did the person send it? (asked once on the job) */
export function askIfSent(run: Pick<DriveRun, "status" | "last_seen_at" | "created_at">, now = Date.now()): boolean {
  return run.status === "review" && tabGone(run, now)
}
