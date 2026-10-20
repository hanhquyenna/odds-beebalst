import { describe, expect, test } from "bun:test"
import {
  applicationProgress,
  applicationUpdateLabel,
  latestApplicationAttempts,
  manualApplicationAttempt,
  type MonitoredRun,
} from "./application-progress"
import type { DriveRun } from "./drive-run-state"

const NOW = Date.parse("2026-10-18T12:00:00Z")

/** Builds observed run metadata for deterministic status and ownership cases. */
function drive(overrides: Partial<DriveRun> = {}): MonitoredRun {
  return {
    source: "drive",
    run: {
      id: "run-1",
      posting_id: "job-1",
      url: "https://jobs.example.com/1",
      status: "running",
      reason: null,
      message: null,
      last_note: "Uploading your CV.",
      steps: 3,
      last_seen_at: new Date(NOW - 1000).toISOString(),
      updated_at: new Date(NOW - 1000).toISOString(),
      created_at: new Date(NOW - 60_000).toISOString(),
      ...overrides,
    },
  }
}

describe("application monitoring progress", () => {
  test("manually logged applications retain their real hiring stage without claiming browser work", () => {
    const attempt = manualApplicationAttempt({
      id: 7,
      posting_id: "manual",
      title: "Analyst",
      employer: "Example",
      fit_tier: "",
      stage: "interview",
      logged_at: "2026-10-10T10:00:00Z",
    })
    expect(applicationProgress(attempt, NOW).label).toBe("Interview")
    expect(applicationProgress(attempt, NOW).group).toBe("history")
    expect(applicationProgress(attempt, NOW).tabAvailable).toBe(false)
    expect(applicationProgress(attempt, NOW).canStop).toBe(false)
  })
  test("a live run exposes current work and an acknowledged Stop path", () => {
    const progress = applicationProgress(drive(), NOW)
    expect(progress.group).toBe("working")
    expect(progress.message).toBe("Uploading your CV.")
    expect(progress.canStop).toBe(true)
    expect(progress.tabAvailable).toBe(true)
  })

  test("no new event becomes waiting, and a missing heartbeat becomes recovery", () => {
    const quiet = applicationProgress(
      drive({ updated_at: new Date(NOW - 20_000).toISOString() }),
      NOW,
    )
    expect(quiet.label).toBe("Waiting for an update")
    const missing = applicationProgress(
      drive({ last_seen_at: new Date(NOW - 120_000).toISOString() }),
      NOW,
    )
    expect(missing.label).toBe("Reconnect")
    expect(missing.tabAvailable).toBe(false)
    expect(missing.canContinue).toBe(false)
  })

  test("review never implies submitted; a closed review tab asks for confirmation", () => {
    expect(applicationProgress(drive({ status: "review" }), NOW).group).toBe("review")
    const gone = applicationProgress(
      drive({ status: "review", last_seen_at: new Date(NOW - 120_000).toISOString() }),
      NOW,
    )
    expect(gone.label).toBe("Confirm submission")
    expect(gone.group).toBe("attention")
    expect(applicationProgress(drive({ status: "submitted" }), NOW).label).toBe("Applied")
  })

  test("paused, failed, and closed runs remain meaningful historical records", () => {
    expect(applicationProgress(drive({ status: "stopped" }), NOW).label).toBe("Paused")
    expect(applicationProgress(drive({ status: "stopped" }), NOW).canContinue).toBe(true)
    expect(
      applicationProgress(drive({ status: "failed", message: "Upload failed." }), NOW).message,
    ).toBe("Upload failed.")
    expect(applicationProgress(drive({ status: "stuck", reason: "closed" }), NOW).label).toBe(
      "Closed",
    )
  })

  test("the desktop queue expires honestly and never claims ownership of a browser tab", () => {
    const attempt: MonitoredRun = {
      source: "desktop",
      run: {
        id: "queue-1",
        posting_id: "job-1",
        url: "https://jobs.example.com/1",
        status: "queued",
        message: "Waiting.",
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        expires_at: new Date(NOW + 1000).toISOString(),
      },
    }
    expect(applicationProgress(attempt, NOW).label).toBe("Waiting for Chrome")
    expect(applicationProgress(attempt, NOW).tabAvailable).toBe(false)
    expect(applicationProgress(attempt, NOW + 2000).label).toBe("Expired")
  })

  test("one latest attempt per job wins even if an older attempt received a later update", () => {
    const old = drive({ id: "old", updated_at: new Date(NOW + 5000).toISOString() })
    const current = drive({ id: "new", status: "stopped", created_at: new Date(NOW).toISOString() })
    const other = drive({ id: "other", posting_id: "job-2" })
    expect(latestApplicationAttempts([old, current, other]).map((item) => item.run.id)).toEqual([
      "new",
      "other",
    ])
  })

  test("the browser run supersedes its earlier desktop request, and unlinked jobs remain visible", () => {
    const queue: MonitoredRun = {
      source: "desktop",
      run: {
        id: "queue",
        posting_id: "job-1",
        url: "https://jobs.example.com/1",
        status: "filling",
        message: "Opening.",
        created_at: new Date(NOW - 120_000).toISOString(),
        updated_at: new Date(NOW).toISOString(),
      },
    }
    const unlinked = drive({ id: "unlinked", posting_id: null, url: "https://jobs.example.com/2" })
    expect(
      latestApplicationAttempts([queue, drive(), unlinked]).map((item) => item.run.id),
    ).toEqual(["unlinked", "run-1"])
  })

  test("timestamps reflect the observed event and handle malformed data", () => {
    expect(applicationUpdateLabel(new Date(NOW - 61_000).toISOString(), NOW)).toBe("1m ago")
    expect(applicationUpdateLabel("bad", NOW)).toBe("Time unavailable")
  })
})
