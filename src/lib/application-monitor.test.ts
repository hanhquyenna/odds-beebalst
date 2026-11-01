import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { DriveRun } from "./drive-run-state"

process.env.VITE_SUPABASE_URL = "http://supabase.test"
process.env.VITE_SUPABASE_ANON_KEY = "test-key"
// Load after the fallback test environment is present; every read below uses the intercepted fetch.
const {
  applicationMonitorSnapshot,
  applicationHistoryPage,
  loadApplicationMonitor,
  setApplicationMonitorUser,
  syncApplicationMonitor,
} = await import("./application-monitor")

const originalFetch = globalThis.fetch
const USER = "00000000-0000-4000-8000-000000000001"
const OTHER = "00000000-0000-4000-8000-000000000002"
let requests: URL[] = []
let rows: DriveRun[] = []

/** Returns run metadata without personal field values for store and pagination tests. */
function run(id: string, overrides: Partial<DriveRun> = {}): DriveRun {
  return {
    id: id,
    posting_id: `job-${id}`,
    url: `https://jobs.example.com/${id}`,
    status: "stopped",
    reason: null,
    message: "You stopped assistance.",
    last_note: "Contact details filled.",
    steps: 2,
    last_seen_at: "2026-10-18T11:59:59Z",
    created_at: "2026-10-18T11:00:00Z",
    updated_at: "2026-10-18T12:00:00Z",
    ...overrides,
  }
}

/** Fulfils every test read in memory and records the query's owner and page. */
async function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : input.toString())
  requests.push(url)
  const offset = Number(url.searchParams.get("offset") || 0)
  const limit = Number(url.searchParams.get("limit") || 50)
  const result = url.pathname.endsWith("/drive_runs") ? rows.slice(offset, offset + limit) : []

  return Response.json(result)
}

beforeEach(() => {
  requests = []
  rows = []
  setApplicationMonitorUser(null)
  setApplicationMonitorUser(USER)
  globalThis.fetch = fakeFetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  setApplicationMonitorUser(null)
})

describe("shared application monitor", () => {
  test("concurrent viewers coalesce the same history request and scope both tables to the owner", async () => {
    rows = [run("paused"), run("failed", { status: "failed" })]
    await Promise.all([loadApplicationMonitor(USER), loadApplicationMonitor(USER)])
    expect(requests).toHaveLength(2)
    expect(requests.every((url) => url.searchParams.get("user_id") === `eq.${USER}`)).toBe(true)
    expect(applicationMonitorSnapshot().attempts).toHaveLength(2)
    expect(applicationMonitorSnapshot().loaded).toBe(true)
  })

  test("older pages remain reachable beyond the live feed's forty-run limit", async () => {
    rows = Array.from({ length: 57 }, (_, index) => run(`run-${index}`))
    await loadApplicationMonitor(USER)
    expect(applicationMonitorSnapshot().attempts).toHaveLength(50)
    expect(applicationMonitorSnapshot().hasMore).toBe(true)
    await loadApplicationMonitor(USER)
    expect(applicationMonitorSnapshot().attempts).toHaveLength(57)
    expect(applicationMonitorSnapshot().hasMore).toBe(false)
    expect(
      requests
        .filter((url) => url.pathname.endsWith("/drive_runs"))
        .map((url) => url.searchParams.get("offset")),
    ).toEqual(["0", "50"])
  })

  test("an empty live feed preserves old stopped, failed, and submitted attempts", async () => {
    rows = [
      run("paused"),
      run("failed", { status: "failed" }),
      run("sent", { status: "submitted" }),
    ]
    await loadApplicationMonitor(USER)
    syncApplicationMonitor(USER, [])
    expect(applicationMonitorSnapshot().attempts.map((attempt) => attempt.run.id)).toEqual([
      "paused",
      "failed",
      "sent",
    ])
  })

  test("a slower history read cannot replace a newer observed run state", async () => {
    rows = [run("same", { status: "running" })]
    syncApplicationMonitor(USER, [
      run("same", { status: "stopped", updated_at: "2026-10-18T12:01:00Z" }),
    ])
    await loadApplicationMonitor(USER)
    expect(applicationMonitorSnapshot().attempts[0]?.run.status).toBe("stopped")
  })

  test("changing accounts discards an old in-flight response and all cached records", async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      await gate

      return fakeFetch(input)
    }
    rows = [run("private")]
    const pending = loadApplicationMonitor(USER)
    setApplicationMonitorUser(OTHER)
    release?.()
    await pending
    expect(applicationMonitorSnapshot().userId).toBe(OTHER)
    expect(applicationMonitorSnapshot().attempts).toEqual([])
    syncApplicationMonitor(USER, rows)
    expect(applicationMonitorSnapshot().attempts).toEqual([])
  })

  test("a failed read is explicit and can be retried without losing observed data", async () => {
    syncApplicationMonitor(USER, [run("retained")])
    globalThis.fetch = async (): Promise<Response> =>
      Response.json({ message: "Unavailable" }, { status: 400 })
    await loadApplicationMonitor(USER)
    expect(applicationMonitorSnapshot().error).not.toBe("")
    expect(applicationMonitorSnapshot().loaded).toBe(false)
    expect(applicationMonitorSnapshot().attempts).toHaveLength(1)
    globalThis.fetch = fakeFetch
    await loadApplicationMonitor(USER, true)
    expect(applicationMonitorSnapshot().error).toBe("")
    expect(applicationMonitorSnapshot().loaded).toBe(true)
  })

  test("per-job history reads are bounded and never query unscoped application history", async () => {
    await applicationHistoryPage(USER, "job-1")
    expect(requests.every((url) => url.searchParams.get("posting_id") === "eq.job-1")).toBe(true)
    expect(requests.every((url) => url.searchParams.get("limit") === "50")).toBe(true)
    requests = []
    await applicationHistoryPage(USER, null, 0, "https://jobs.example.com/unlinked")
    expect(
      requests.every(
        (url) => url.searchParams.get("url") === "eq.https://jobs.example.com/unlinked",
      ),
    ).toBe(true)
    await expect(applicationHistoryPage(USER, null)).rejects.toThrow("no job or address")
  })
})
