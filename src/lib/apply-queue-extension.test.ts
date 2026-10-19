import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

// extension/queue.js is a plain script for the worker; its pure part is loaded here the way the worker would (the rest needs Chrome).
const source = readFileSync("extension/queue.js", "utf8")
const pure = source.slice(0, source.indexOf("globalThis.oddsQueueLogic"))
// Test-only: load the extension worker's own pure helpers. The string is this repo's queue.js, not remote code.
// eslint-disable-next-line no-new-func, no-implied-eval
const logic = new Function(`${pure}; return { queueReasonOf, queueOutcomeOf, QUEUE_PARALLEL }`)() as {
  queueReasonOf: (m: string) => string
  queueOutcomeOf: (i: { status: string; message?: string } | null, now?: number, startedAt?: number) => { state: string; reason?: string; message: string } | null
  QUEUE_PARALLEL: number
}

describe("the extension's queue", () => {
  test("works at most two applications at once", () => expect(logic.QUEUE_PARALLEL).toBe(2))
  test("a stop has one reason, read from the tab's words", () => {
    expect(logic.queueReasonOf("Complete the security check (captcha) in the tab")).toBe("captcha")
    expect(logic.queueReasonOf("Sign in on this page — Odds never types passwords")).toBe("account")
    expect(logic.queueReasonOf("Answer the 3 marked questions")).toBe("questions")
    expect(logic.queueReasonOf("This job is closed: it no longer takes applications.")).toBe("closed")
    expect(logic.queueReasonOf("This employer takes applications by email")).toBe("email")
    expect(logic.queueReasonOf("a cover letter is required")).toBe("letter")
    expect(logic.queueReasonOf("something odd")).toBe("other")
  })
  test("tab states become queue states; filling means still working", () => {
    expect(logic.queueOutcomeOf({ status: "filling" })).toBeNull()
    expect(logic.queueOutcomeOf({ status: "ready" })).toMatchObject({ state: "review" })
    expect(logic.queueOutcomeOf({ status: "needs_input", message: "Complete the captcha" })).toMatchObject({ state: "needs_you", reason: "captcha" })
    expect(logic.queueOutcomeOf({ status: "failed", message: "Odds could not open the form." })).toMatchObject({ state: "failed" })
    expect(logic.queueOutcomeOf({ status: "submitted" })).toMatchObject({ state: "sent" })
    expect(logic.queueOutcomeOf(null)).toBeNull()
  })
  test("a form that never finishes is handed over with a reason, not left spinning", () => {
    const now = Date.now()
    expect(logic.queueOutcomeOf({ status: "filling" }, now, now - 5 * 60_000)).toBeNull()
    expect(logic.queueOutcomeOf({ status: "filling" }, now, now - 13 * 60_000)).toMatchObject({ state: "needs_you", reason: "other" })
  })
  test("it never presses Submit: no click on a submit control in the queue code", () => {
    expect(source).not.toMatch(/\.click\(|submit\(\)|requestSubmit/)
  })
})
