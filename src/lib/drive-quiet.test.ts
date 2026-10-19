import { describe, expect, test } from "bun:test"
import { broodsStartFailed, MODEL_UNREACHABLE, quietGiveUp } from "../../supabase/functions/_shared/drive-quiet"
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
})

describe("quiet give-up", () => {
  test("retries while the run is quiet, then stuck with zero commands is unreachable", () => {
    expect(quietGiveUp({ retries: 0, commandCount: 0, quiet: false })).toBe("wait")
    expect(quietGiveUp({ retries: 2, commandCount: 0, quiet: true })).toBe("retry")
    expect(quietGiveUp({ retries: 3, commandCount: 0, quiet: true })).toBe("stuck_unreachable")
    expect(quietGiveUp({ retries: 3, commandCount: 4, quiet: true })).toBe("stuck_generic")
  })
})

describe("extension idle and panel press", () => {
  test("two minutes of idle with no command gives up", () => {
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
