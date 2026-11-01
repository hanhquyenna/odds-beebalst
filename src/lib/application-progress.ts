import type { ApplicationRun } from "@/lib/application-runs"
import { driveLabel, type DriveInfo } from "@/lib/apply-activity"
import { tabGone, type DriveRun } from "@/lib/drive-run-state"
import { STEPS } from "@/components/job-steps"
import type { Application } from "@/lib/types"

export const APPLICATION_ACTIVITY_GROUPS = [
  { value: "attention", label: "Needs attention" },
  { value: "working", label: "Working" },
  { value: "review", label: "Ready to review" },
  { value: "history", label: "Previous activity" },
] as const

export type MonitoredRun =
  | { source: "drive"; run: DriveRun }
  | { source: "desktop"; run: DesktopApplicationRun }
  | { source: "manual"; run: ManualApplicationRun }
export type DesktopApplicationRun = ApplicationRun & {
  url: string
  created_at: string
  updated_at: string
}

interface ManualApplicationRun {
  id: string
  posting_id: string
  url: string
  status: "submitted"
  stage: Application["stage"]
  title: string
  employer: string
  message: string
  created_at: string
  updated_at: string
}

export interface ApplicationProgress {
  group: "attention" | "working" | "review" | "history"
  label: string
  message: string
  updatedAt: string
  tabAvailable: boolean
  canContinue: boolean
  canStop: boolean
}

/** Describes the latest observed state without turning a stale tab or an expired queue into live work. */
export function applicationProgress(attempt: MonitoredRun, now = Date.now()): ApplicationProgress {
  const run = attempt.run
  const base = {
    updatedAt: run.updated_at,
    tabAvailable: false,
    canContinue: false,
    canStop: false,
  }
  if (attempt.source === "manual") {
    const stage = attempt.run.stage === "hired" ? "offer" : attempt.run.stage
    const label = STEPS.find((step) => step.step === stage)?.title || "Applied"

    return { ...base, group: "history", label: label, message: "Application logged by you." }
  }
  if (run.status === "submitted")
    return {
      ...base,
      group: "history",
      label: "Applied",
      message: run.message || "Submission confirmed.",
    }
  if (run.status === "failed")
    return {
      ...base,
      group: "attention",
      label: "Needs attention",
      message: run.message || "Application assistance failed.",
    }
  if (run.status === "stopped" || run.status === "cancelled") {
    const tabAvailable = attempt.source === "drive" && !tabGone(attempt.run, now)

    return {
      ...base,
      group: "history",
      label: "Paused",
      message: run.message || "You stopped assistance.",
      tabAvailable: tabAvailable,
      canContinue: tabAvailable,
    }
  }
  if (attempt.source === "desktop") {
    if (attempt.run.expires_at && Date.parse(attempt.run.expires_at) <= now)
      return {
        ...base,
        group: "attention",
        label: "Expired",
        message: "Preparation expired. Open the job to recover the application.",
      }
    if (run.status === "ready")
      return {
        ...base,
        group: "review",
        label: "Ready to review",
        message: run.message || "Check the application before sending.",
      }
    if (run.status === "needs_input")
      return {
        ...base,
        group: "attention",
        label: "Needs you",
        message: run.message || "Open the job to continue.",
      }

    return {
      ...base,
      group: "working",
      label: run.status === "queued" ? "Waiting for Chrome" : "Filling form",
      message: run.message || "Waiting for your desktop.",
      canStop: true,
    }
  }
  const drive = attempt.run
  if (drive.reason === "closed")
    return {
      ...base,
      group: "history",
      label: "Closed",
      message: drive.message || "This job no longer takes applications.",
    }
  if (tabGone(drive, now)) {
    return {
      ...base,
      group: "attention",
      label: drive.status === "review" ? "Confirm submission" : "Reconnect",
      message:
        drive.status === "review"
          ? "The application reached review, then its tab stopped checking in. Did you send it?"
          : "The application tab is not checking in. Open the job to recover it.",
    }
  }
  const info: DriveInfo = {
    runId: drive.id,
    status: drive.status,
    reason: drive.reason,
    note: drive.last_note || "",
    steps: drive.steps,
    filling: false,
    message: drive.message || "",
    updatedAt: Date.parse(drive.updated_at),
  }
  if (drive.status === "review")
    return {
      ...base,
      group: "review",
      label: "Ready to review",
      message: drive.message || "Check the application and send it yourself.",
      tabAvailable: true,
    }
  if (drive.status !== "running")
    return {
      ...base,
      group: "attention",
      label: driveLabel(info),
      message: drive.message || drive.last_note || "Open the job to continue.",
      tabAvailable: true,
    }
  const quiet = now - Date.parse(drive.updated_at) >= 15_000

  return {
    ...base,
    group: "working",
    label: quiet ? "Waiting for an update" : "Filling form",
    message: quiet
      ? `No new activity. Last update: ${drive.last_note || "Waiting for the form."}`
      : drive.last_note || "Opening the application.",
    tabAvailable: true,
    canStop: true,
  }
}

/** Includes applications recorded without browser assistance in the same Tracker overview. */
export function manualApplicationAttempt(application: Application, url = ""): MonitoredRun {
  return {
    source: "manual",
    run: {
      id: String(application.id),
      posting_id: application.posting_id,
      url: url,
      status: "submitted",
      stage: application.stage,
      title: application.title,
      employer: application.employer,
      message: "Application logged by you.",
      created_at: application.logged_at,
      updated_at: application.logged_at,
    },
  }
}

/** Keeps one overview row per job; a newer attempt always wins over updates to an older attempt. */
export function latestApplicationAttempts(attempts: ReadonlyArray<MonitoredRun>): MonitoredRun[] {
  const jobs = new Map<string, MonitoredRun>()
  const ordered = [...attempts].sort(
    (a, b) =>
      b.run.created_at.localeCompare(a.run.created_at) ||
      (a.source === b.source ? b.run.id.localeCompare(a.run.id) : a.source === "drive" ? -1 : 1),
  )
  for (const attempt of ordered) {
    const key = attempt.run.posting_id || attempt.run.url || `${attempt.source}:${attempt.run.id}`
    if (!jobs.has(key)) jobs.set(key, attempt)
  }

  return [...jobs.values()]
}

/** Formats an observed timestamp, leaving absent or malformed dates explicit. */
export function applicationUpdateLabel(iso: string, now = Date.now()): string {
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return "Time unavailable"
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`

  return new Date(at).toLocaleDateString()
}
