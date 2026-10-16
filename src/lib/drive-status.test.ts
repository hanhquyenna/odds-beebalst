import { beforeEach, describe, expect, test } from "bun:test"
import { applyActivityLabel, applyActivityOf, applyActivityPhase, dismissDriveRun, driveOf, isLiveApply, recordApplyActivity, syncApplyActivities, syncDriveRuns } from "./apply-activity"
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

describe("the tracker follows the Broods run itself", () => {
  test("running: Applying…, live, with Broods' own line", () => {
    syncDriveRuns([run()], NOW)
    expect(label()).toBe("Applying…")
    expect(isLiveApply(applyActivityOf("p1"))).toBe(true)
    expect(applyActivityOf("p1")!.message).toContain("Filling your details")
    expect(driveOf("p1")?.steps).toBe(7)
  })

  test("each reason it stops for gets its own chip", () => {
    const cases: Array<[Partial<DriveRun>, string]> = [
      [{ status: "needs_you", reason: "captcha" }, "Captcha"],
      [{ status: "needs_you", reason: "account" }, "Sign in"],
      [{ status: "needs_you", reason: "questions" }, "Your answers"],
      [{ status: "needs_you", reason: "letter" }, "Cover letter"],
      [{ status: "stuck", reason: "quiet" }, "Stopped"],
      [{ status: "stuck", reason: "other" }, "Stuck"],
      [{ status: "stopped" }, "Stopped"],
      [{ status: "review" }, "Review & send"],
    ]
    for (const [over, want] of cases) {
      store.clear()
      syncDriveRuns([run(over)], NOW)
      expect(label()).toBe(want)
      expect(isLiveApply(applyActivityOf("p1"))).toBe(true)
    }
  })

  test("never silent: a running run whose tab stopped asking says Tab closed and waits for the person", () => {
    syncDriveRuns([run({ last_seen_at: new Date(NOW - 120_000).toISOString() })], NOW)
    expect(label()).toBe("Tab closed")
    expect(applyActivityPhase(applyActivityOf("p1"))).toBe("needs_input")
  })

  test("the tab's last line never overrides the run", () => {
    syncDriveRuns([run({ status: "needs_you", reason: "captcha" })], NOW)
    recordApplyActivity({ postingId: "p1", status: "filling", message: "Broods is applying in this tab…" })
    expect(label()).toBe("Captcha")
  })

  test("the person sets the status: that run's chip is gone for good, a later run shows again", () => {
    syncDriveRuns([run()], NOW)
    dismissDriveRun("r1")
    store.delete("odds:apply-activity-v1")
    syncDriveRuns([run()], NOW)
    expect(applyActivityOf("p1")).toBeNull()
    syncDriveRuns([run({ id: "r2" })], NOW)
    expect(label()).toBe("Applying…")
  })

  test("a dead tab's leftover line for a run the server no longer has is dropped", () => {
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
