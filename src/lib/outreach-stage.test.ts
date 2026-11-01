import { describe, expect, test } from "bun:test"
import { CONTACT_STATUSES } from "@/lib/types"
import { NUDGE_AFTER_DAYS, STAGES, nextStep, stamp } from "@/lib/outreach-stage"

const NOW = new Date("2026-10-10T12:00:00Z")
const ago = (days: number): string => new Date(NOW.getTime() - days * 86_400_000).toISOString()

describe("outreach stages", () => {
  test("every stage has a hint and a next step, and the first three old stages are still there in order", () => {
    for (const s of CONTACT_STATUSES) {
      expect(STAGES[s].hint.length).toBeGreaterThan(3)
      expect(STAGES[s].next.length).toBeGreaterThan(10)
    }
    expect(CONTACT_STATUSES.indexOf("To contact")).toBeLessThan(CONTACT_STATUSES.indexOf("Contacted"))
    expect(CONTACT_STATUSES.indexOf("Contacted")).toBeLessThan(CONTACT_STATUSES.indexOf("Replied"))
    expect(CONTACT_STATUSES.indexOf("Replied")).toBeLessThan(CONTACT_STATUSES.indexOf("Met"))
  })
  test("the nudge is due after a week of waiting, never before, never without a date", () => {
    expect(nextStep({ status: "Contacted", statusAt: ago(NUDGE_AFTER_DAYS - 1) }, NOW).due).toBe(false)
    expect(nextStep({ status: "Contacted", statusAt: ago(NUDGE_AFTER_DAYS) }, NOW).due).toBe(true)
    expect(nextStep({ status: "Referral asked", statusAt: ago(9) }, NOW).due).toBe(true)
    expect(nextStep({ status: "Contacted" }, NOW).due).toBe(false)
  })
  test("only waiting stages can be due", () => {
    for (const s of CONTACT_STATUSES) if (!STAGES[s].waiting) expect(nextStep({ status: s, statusAt: ago(30) }, NOW).due).toBe(false)
  })
  test("closed stages end the outreach and say who to try next", () => {
    expect(STAGES["No reply"].closed).toBe(true)
    expect(STAGES["Passed me on"].next).toContain("Add the person")
    expect(STAGES["Said no"].next).toContain("who else")
  })
  test("changing a stage stamps the time", () => {
    expect(stamp("Met", NOW)).toEqual({ status: "Met", statusAt: NOW.toISOString() })
  })
})
