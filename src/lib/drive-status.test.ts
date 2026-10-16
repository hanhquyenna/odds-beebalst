import { beforeEach, describe, expect, test } from "bun:test"
import { applyActivityLabel, applyActivityOf, dismissDriveRun, driveOf, isLiveApply, recordApplyActivity, sentAskOf, syncApplyActivities, syncDriveRuns } from "./apply-activity"
import type { DriveRun } from "./drive-run-state"

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
      clear: () => store.clear(),
    },
  })
})

const NOW = Date.parse("2026-10-16T12:00:00Z")
const run = (over: Partial<DriveRun> = {}): DriveRun => ({
  id: "r1", posting_id: "p1", url: "https://jobs.example.com/apply", status: "running", reason: null, message: null,
  last_note: "Filling your details from Autofill", steps: 7, last_seen_at: new Date(NOW - 5_000).toISOString(),
  updated_at: new Date(NOW - 5_000).toISOString(), created_at: new Date(NOW - 60_000).toISOString(), ...over,
})
const label = (): string => applyActivityLabel(applyActivityOf("p1")!)

describe("a Broods run is a temporary layer over the job's own status", () => {
  test("running with its tab open: Applying…, with Broods' own line", () => {
    syncDriveRuns([run()], NOW)
    expect(label()).toBe("Applying…")
    expect(isLiveApply(applyActivityOf("p1"))).toBe(true)
    expect(applyActivityOf("p1")!.message).toContain("Filling your details")
    expect(driveOf("p1")?.steps).toBe(7)
  })

  test("the person typing in the form: You're filling in", () => {
    syncDriveRuns([run({ person_active_at: new Date(NOW - 3_000).toISOString() })], NOW)
    expect(label()).toBe("You're filling in")
  })

  test("each thing it waits for gets its own chip while the tab is open", () => {
    const cases: Array<[Partial<DriveRun>, string]> = [
      [{ status: "needs_you", reason: "captcha" }, "Captcha"],
      [{ status: "needs_you", reason: "account" }, "Sign in"],
      [{ status: "needs_you", reason: "questions" }, "Your answers"],
      [{ status: "needs_you", reason: "letter" }, "Cover letter"],
      [{ status: "stuck", reason: "other" }, "Stuck"],
      [{ status: "review" }, "Review & send"],
    ]
    for (const [over, want] of cases) {
      store.clear()
      syncDriveRuns([run(over)], NOW)
      expect(label()).toBe(want)
      expect(isLiveApply(applyActivityOf("p1"))).toBe(true)
    }
  })

  test("the tab closes: the layer goes at once and the job shows its own status again", () => {
    syncDriveRuns([run({ status: "needs_you", reason: "captcha" })], NOW)
    expect(label()).toBe("Captcha")
    syncDriveRuns([run({ status: "stopped", last_seen_at: new Date(0).toISOString() })], NOW)
    expect(applyActivityOf("p1")).toBeNull()
  })

  test("Chrome gone or asleep (no check-in for 90 s): no layer, never a dead Applying…", () => {
    syncDriveRuns([run({ last_seen_at: new Date(NOW - 120_000).toISOString() })], NOW)
    expect(applyActivityOf("p1")).toBeNull()
  })

  test("ended at Review & send and the tab closed: no layer, but the job asks once whether it was sent", () => {
    syncDriveRuns([run({ status: "review", last_seen_at: new Date(0).toISOString() })], NOW)
    expect(applyActivityOf("p1")).toBeNull()
    expect(sentAskOf("p1")).toBe("r1")
    dismissDriveRun("r1")
    syncDriveRuns([run({ status: "review", last_seen_at: new Date(0).toISOString() })], NOW)
    expect(sentAskOf("p1")).toBeNull()
  })

  test("the tab's last line never overrides the run", () => {
    syncDriveRuns([run({ status: "needs_you", reason: "captcha" })], NOW)
    recordApplyActivity({ postingId: "p1", status: "filling", message: "Broods is applying in this tab…" })
    expect(label()).toBe("Captcha")
  })

  test("the person sets the status: that run's layer is gone for good, a later run shows again", () => {
    syncDriveRuns([run()], NOW)
    dismissDriveRun("r1")
    store.delete("odds:apply-activity-v1")
    syncDriveRuns([run()], NOW)
    expect(applyActivityOf("p1")).toBeNull()
    syncDriveRuns([run({ id: "r2" })], NOW)
    expect(label()).toBe("Applying…")
  })

  test("a dead tab's leftover line for a run that is not on screen is dropped", () => {
    syncDriveRuns([], NOW)
    syncApplyActivities([{ postingId: "p1", status: "filling", message: "Broods is applying in this tab…", runId: "old-run" }])
    expect(applyActivityOf("p1")).toBeNull()
  })

  test("Applying… with no run behind it and no new line for 10 minutes is not live", () => {
    recordApplyActivity({ postingId: "p1", status: "filling", message: "Filling…" })
    const a = applyActivityOf("p1")!
    a.at = Date.now() - 11 * 60_000
    expect(isLiveApply(a)).toBe(false)
  })
})
