import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const background = readFileSync(new URL("../../extension/background.js", import.meta.url), "utf8")
const linkedInApply = readFileSync(new URL("../../extension/apply.js", import.meta.url), "utf8")
const tunnel = readFileSync(new URL("../../scripts/launchd/run-tunnel.ts", import.meta.url), "utf8")
const drive = readFileSync(new URL("../../supabase/functions/mcp/drive.ts", import.meta.url), "utf8")

describe("Apply recovery wiring", () => {
  test("browser and extension restarts stop stored drive runs before intents are cleared", () => {
    expect(background).toContain("stopAndClearApplyIntents")
    expect(background).toContain('ext("drive-stop"')
    expect(background).toContain('chrome.runtime.onStartup.addListener(() => { void stopAndClearApplyIntents')
    expect(background).toContain('chrome.runtime.onInstalled.addListener(() => { void stopAndClearApplyIntents')
  })

  test("failed navigation, reinjection, and panel fill become visible failures", () => {
    expect(background).toContain("Odds could not open the application page.")
    expect(background).toContain("Odds could not reconnect to the application page.")
    expect(background).toContain("Odds could not run on this page.")
    expect(background).toContain("The employer opened a new tab that did not finish loading.")
    expect(background).toContain("Odds could not use the account form on this page.")
    expect(background).toContain('status: "failed"')
  })

  test("the account flow keeps the existing drive run instead of orphaning it", () => {
    const accountFlow = background.slice(background.indexOf("async function accountInTab"), background.indexOf("/** A new tab's first real address"))
    expect(accountFlow).not.toContain("driveRun: undefined")
    expect(accountFlow).toContain("paused: false")
  })

  test("a quick tunnel is deployed only after its public models endpoint is reachable", () => {
    const beforeSet = tunnel.slice(0, tunnel.indexOf('Bun.spawn([BUN, "./node_modules/.bin/broods", "env", "set"'))
    expect(beforeSet).toContain("if (!reachable")
    expect(beforeSet).toContain("modelsOk(base)")
    expect(tunnel).toContain("wantedBase !== base")
    expect(tunnel).toContain("wokeFromSleep")
    expect(tunnel).toContain("networkChanged")
    expect(tunnel).toContain("broods deploy failed; retrying in 30s")
  })

  test("an expired running row is settled as stuck and open commands are cancelled", () => {
    expect(drive).toContain("driveRunExpired")
    expect(drive).toContain("The application run expired before Broods finished.")
    expect(drive).toContain('cancelOpenCommands(env, run.id, "expired")')
  })

  test("LinkedIn Easy Apply surfaces a healthy but commandless Broods run", () => {
    const driveModal = linkedInApply.slice(linkedInApply.indexOf("async function driveModal"), linkedInApply.indexOf("async function run(modal)"))
    expect(driveModal).toContain("let idleSince = 0")
    expect(driveModal).toContain("Date.now() - idleSince >= 120000")
    expect(driveModal).toContain("Broods' model is unreachable.")
  })
})
