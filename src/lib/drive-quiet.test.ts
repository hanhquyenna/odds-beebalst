import { readFileSync } from "node:fs"
import { describe, expect, test } from "bun:test"
import { broodsStartFailed, broodsStartOutcome, broodsTurnState, driveRunExpired, HUNG_MS, MODEL_UNREACHABLE, quietAction, quietGiveUp } from "../../supabase/functions/_shared/drive-quiet"
import { driveIdleGiveUp, DRIVE_IDLE_MS } from "@/lib/drive-idle"
import { panelFillExpired, PANEL_FILL_MS } from "@/lib/panel-fill"

describe("broods start", () => {
  test("a failed or unreachable model is a start failure", () => {
    expect(broodsStartFailed({ status: "failed", error: "model.invocation.failed: getaddrinfo ENOTFOUND" })).toBe(true)
    expect(broodsStartFailed({ status: "expired" })).toBe(true)
    expect(broodsStartFailed({ status: "not_found" })).toBe(true)
    expect(broodsStartFailed({ status: "processing" })).toBe(false)
    expect(broodsStartFailed({ status: "accepted" })).toBe(false)
    expect(MODEL_UNREACHABLE).not.toContain("—")
  })

  test("a turn that completes before sending a tool is checked for zero commands", () => {
    expect(broodsStartOutcome({ status: "accepted" })).toBe("wait")
    expect(broodsStartOutcome({ status: "processing" })).toBe("live")
    expect(broodsStartOutcome({ status: "failed", error: "getaddrinfo ENOTFOUND" })).toBe("unreachable")
    expect(broodsStartOutcome({ status: "completed" })).toBe("ended")
  })
})

describe("quiet give-up", () => {
  test("retries while the run is quiet, then stuck with zero commands is unreachable", () => {
    expect(quietGiveUp({ retries: 0, commandCount: 0, quiet: false })).toBe("wait")
    expect(quietGiveUp({ retries: 2, commandCount: 0, quiet: true })).toBe("retry")
    expect(quietGiveUp({ retries: 3, commandCount: 0, quiet: true })).toBe("stuck_unreachable")
    expect(quietGiveUp({ retries: 3, commandCount: 4, quiet: true })).toBe("stuck_generic")
  })

  test("an expired running lease is terminal even when the row still says running", () => {
    const now = Date.parse("2026-10-19T19:00:00Z")
    expect(driveRunExpired("running", "2026-10-19T18:59:59Z", now)).toBe(true)
    expect(driveRunExpired("running", "2026-10-19T19:00:01Z", now)).toBe(false)
    expect(driveRunExpired("review", "2026-10-19T18:59:59Z", now)).toBe(false)
    expect(driveRunExpired("running", null, now)).toBe(false)
  })
})

describe("quiet pick-up never starts a second agent", () => {
  test("a turn still working is left alone until it is hung", () => {
    expect(broodsTurnState({ status: "processing" })).toBe("live")
    expect(broodsTurnState({ status: "queued" })).toBe("live")
    expect(broodsTurnState({ status: "completed" })).toBe("over")
    expect(broodsTurnState({ status: "failed" })).toBe("over")
    expect(broodsTurnState(null)).toBe("unknown")
    expect(quietAction({ turn: "live", quietMs: 45_000, retries: 0, commandCount: 3 })).toBe("wait")
    expect(quietAction({ turn: "live", quietMs: HUNG_MS, retries: 0, commandCount: 3 })).toBe("stuck_hung")
  })

  test("a turn that ended without a tool call is picked up, then given up as before", () => {
    expect(quietAction({ turn: "over", quietMs: 31_000, retries: 0, commandCount: 3 })).toBe("retry")
    expect(quietAction({ turn: "unknown", quietMs: 31_000, retries: 3, commandCount: 0 })).toBe("stuck_unreachable")
    expect(quietAction({ turn: "over", quietMs: 31_000, retries: 3, commandCount: 4 })).toBe("stuck_generic")
  })

  test("every Broods turn of a run uses the run's one conversation", () => {
    const drive = readFileSync("supabase/functions/mcp/drive.ts", "utf8")
    const keys = [...drive.matchAll(/conversationKey: ([^,]+),/g)].map((m) => m[1].trim())
    expect(keys).toEqual(["`odds-drive-${run.id}`"])
  })
})

describe("extension idle and panel press", () => {
  test("three minutes of idle with no command gives up", () => {
    expect(driveIdleGiveUp(DRIVE_IDLE_MS - 1)).toBe(false)
    expect(driveIdleGiveUp(DRIVE_IDLE_MS)).toBe(true)
  })

  test("panel-fill press expires after 30s when the state never changes", () => {
    expect(panelFillExpired(1_000, 1_000 + PANEL_FILL_MS - 1, null, null)).toBe(false)
    expect(panelFillExpired(1_000, 1_000 + PANEL_FILL_MS, null, null)).toBe(true)
    expect(panelFillExpired(1_000, 1_000 + PANEL_FILL_MS, null, "filling")).toBe(false)
    expect(panelFillExpired(0, 99_000, null, null)).toBe(false)
  })
})
