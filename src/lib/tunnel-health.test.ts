import { describe, expect, test } from "bun:test"
import { healthGaveUp, HEALTH_FAIL_MS, logNeedsRestart, modelsReachable, networkChanged, WAKE_GAP_MS, wokeFromSleep } from "../../scripts/launchd/tunnel-health"

describe("tunnel health", () => {
  test("Tunnel not found and register errors restart cloudflared", () => {
    expect(logNeedsRestart("cloudflared: Register tunnel error: Unauthorized: Tunnel not found")).toBe(true)
    expect(logNeedsRestart("Register tunnel error")).toBe(true)
    expect(logNeedsRestart("https://abc.trycloudflare.com")).toBe(false)
  })

  test("401 with the remote API key message is reachable", () => {
    expect(modelsReachable(200, "{\"data\":[]}")).toBe(true)
    expect(modelsReachable(401, "API key required for remote API access")).toBe(true)
    expect(modelsReachable(401, "invalid token")).toBe(false)
    expect(modelsReachable(502, "API key required for remote API access")).toBe(false)
  })

  test("health gives up after about 60 seconds", () => {
    expect(healthGaveUp(HEALTH_FAIL_MS - 1)).toBe(false)
    expect(healthGaveUp(HEALTH_FAIL_MS)).toBe(true)
  })

  test("a sleep gap restarts immediately after wake", () => {
    expect(wokeFromSleep(10_000, 10_000 + WAKE_GAP_MS - 1)).toBe(false)
    expect(wokeFromSleep(10_000, 10_000 + WAKE_GAP_MS)).toBe(true)
    expect(wokeFromSleep(0, 100_000)).toBe(false)
  })

  test("a usable network change or return from offline restarts", () => {
    expect(networkChanged("en0:IPv4:192.0.2.1", "en0:IPv4:192.0.2.2")).toBe(true)
    expect(networkChanged("en0:IPv4:192.0.2.1", "en0:IPv4:192.0.2.1")).toBe(false)
    expect(networkChanged("en0:IPv4:192.0.2.1", "")).toBe(false)
    expect(networkChanged("", "en0:IPv4:192.0.2.1")).toBe(true)
  })
})
