import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { applyActivityLabel, driveLabel } from "./apply-activity"
import { NEEDS, queueWords } from "./apply-queue-words"
import { plainWords } from "./plain-words"

describe("what a person reads never names how Odds is built", () => {
  test("old engine lines are said the way a person would", () => {
    expect(plainWords("Broods' model is unreachable. The fill stopped. Press Apply with Odds to try again.")).toBe("Odds lost its connection. It stopped partway. Press Try again.")
    expect(plainWords("Broods is reading this step…")).toBe("Odds is reading this step…")
    expect(plainWords("Odds assist could not move this application forward after assist: no button")).toBe("Odds could not get further on its own: no button")
    expect(plainWords("The application run expired before Broods finished.")).toBe("The application expired before Odds finished.")
    expect(plainWords(null)).toBeUndefined()
  })
  test("the Tracker chip, the job page and Applications use the same words for the same stop", () => {
    const at = Date.now()
    expect(driveLabel({ status: "needs_you", reason: "captcha", message: "", updatedAt: at } as never)).toBe(NEEDS.captcha.label)
    expect(queueWords({ state: "needs_you", reason: "captcha", message: null }).label).toBe(NEEDS.captcha.label)
    expect(driveLabel({ status: "review", reason: null, message: "", updatedAt: at } as never)).toBe(queueWords({ state: "review", reason: null, message: null }).label)
    expect(driveLabel({ status: "running", reason: null, message: "", updatedAt: at } as never)).toBe(queueWords({ state: "working", reason: null, message: null }).label)
    expect(applyActivityLabel({ postingId: "x", status: "ready", message: "Filled in.", at })).toBe("Ready to send")
  })
  test("no screen in the app writes the engine's name or engineer words", () => {
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [join(dir, e.name)] : []))
    const shown: string[] = []
    for (const file of files("src/components")) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue
        // Text between tags, and quoted strings that read as sentences or labels.
        for (const m of line.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) shown.push(`${file}: ${m[1]}`)
        for (const m of line.matchAll(/"([A-Z][^"]{3,})"/g)) shown.push(`${file}: ${m[1]}`)
      }
    }
    expect(shown.filter((s) => /\bBroods\b|\bagent\b|Odds assist|\bStuck\b|\bReconnect\b|\bLLM\b/.test(s.split(": ").slice(1).join(": ")))).toEqual([])
  })
})
