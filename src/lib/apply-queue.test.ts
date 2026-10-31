import { describe, expect, test } from "bun:test"
import { QUEUE_PARALLEL, queueDone, queueNext } from "../../supabase/functions/_shared/apply-queue"
import { groupOf, groupQueue, queueActions, queueCounts, queueReport, queueWords, reportHeadline, type QueueItem } from "./apply-queue-words"

const item = (state: QueueItem["state"], reason: QueueItem["reason"] = null, message: string | null = null, updated = "2026-10-18T09:00:00Z"): QueueItem =>
  ({ posting_id: `${state}-${reason}-${updated}`, state, reason, message, added_at: "2026-10-18T08:00:00Z", started_at: null, updated_at: updated })

describe("the words on a queue card", () => {
  test("each state has its group and a plain label", () => {
    expect(queueWords(item("waiting")).label).toBe("Waiting")
    expect(queueWords(item("working")).label).toBe("Filling it in")
    expect(queueWords(item("review")).label).toBe("Ready to review")
    expect(queueWords(item("sent")).group).toBe("sent")
    expect(groupOf(item("needs_you"))).toBe("needs")
  })
  test("a stop that needs the person gives exactly one reason, in the panel's words", () => {
    expect(queueWords(item("needs_you", "captcha"))).toMatchObject({ label: "Security check", group: "needs" })
    expect(queueWords(item("needs_you", "account")).why).toMatch(/never types passwords/)
    expect(queueWords(item("needs_you", "questions")).label).toBe("Your answers")
    expect(queueWords(item("needs_you", "letter")).why).toMatch(/cover letter/i)
    expect(queueWords(item("needs_you", "email")).label).toBe("Apply by email")
  })
  test("an unknown stop keeps the site's own sentence; a failure says why, a closed job says closed", () => {
    expect(queueWords(item("needs_you", "other", "Pick your start date.")).why).toBe("Pick your start date.")
    expect(queueWords(item("failed", "other", "The form would not load.")).why).toBe("The form would not load.")
    expect(queueWords(item("failed", "closed"))).toMatchObject({ label: "Closed", why: "This job is closed: it no longer takes applications." })
  })
  test("no wording promises a send: Odds never submits", () => {
    for (const state of ["waiting", "working", "review", "needs_you", "failed", "sent"] as const) expect(queueWords(item(state, state === "needs_you" ? "captcha" : null)).why).not.toMatch(/odds (will )?(submit|send)s? (it|for you)/i)
    expect(queueWords(item("review")).why).toMatch(/Odds never sends it/)
  })
  test("cards group needs-you first, newest first inside a group", () => {
    const groups = groupQueue([item("review", null, null, "2026-10-18T09:00:00Z"), item("needs_you", "captcha"), item("review", null, null, "2026-10-18T10:00:00Z"), item("working")])
    expect(groups.map((g) => g.group)).toEqual(["needs", "ready", "working"])
    expect(groups[1].items.map((i) => i.updated_at)).toEqual(["2026-10-18T10:00:00Z", "2026-10-18T09:00:00Z"])
    expect(queueCounts([item("review"), item("review"), item("failed")])).toMatchObject({ ready: 2, failed: 1, needs: 0 })
  })
  test("Mark as sent is only for a form at Review; Open the form is for any live one", () => {
    expect(queueActions(item("review"))).toMatchObject({ open: true, markSent: true })
    for (const state of ["waiting", "working", "needs_you", "failed", "sent"] as const) expect(queueActions(item(state)).markSent).toBe(false)
    expect(queueActions(item("waiting")).open).toBe(false)
    expect(queueActions(item("failed")).retry).toBe(true)
  })
})

/** A fake of the database: just enough PostgREST to run the two server routes. */
function fakeDb(queue: Array<{ posting_id: string; state: string; added_at: string; reason?: string | null; message?: string | null }>, postings: Record<string, { url: string | null; closed_at: string | null }>, runs: Array<Record<string, unknown>> = []) {
  const patches: Array<{ path: string; body: Record<string, unknown> }> = []
  const svc = async (path: string, init?: { method?: string; body?: string }): Promise<unknown> => {
    const [table, query = ""] = path.split("?")
    const q = new URLSearchParams(query)
    if (table === "drive_runs") return runs
    if (table === "postings") return [postings[q.get("id")!.replace("eq.", "")]].filter(Boolean)
    if (table !== "apply_queue") throw new Error(`unexpected ${path}`)
    const wantState = q.get("state")
    const inList = (v: string | null): string[] | null => (v?.startsWith("in.(") ? v.slice(4, -1).split(",") : null)
    const matches = queue.filter((r) => {
      const state = wantState?.startsWith("eq.") ? wantState.slice(3) : null
      const states = inList(wantState)
      const posting = q.get("posting_id")
      const ids = inList(posting)
      return (!state || r.state === state) && (!states || states.includes(r.state)) && (!posting?.startsWith("eq.") || r.posting_id === decodeURIComponent(posting.slice(3))) && (!ids || ids.map(decodeURIComponent).includes(r.posting_id))
    })
    if (init?.method === "PATCH") {
      const body = JSON.parse(init.body!) as Record<string, unknown>
      patches.push({ path, body })
      for (const r of matches) Object.assign(r, body)
      return matches.map((r) => ({ posting_id: r.posting_id }))
    }
    const sorted = [...matches].sort((a, b) => a.added_at.localeCompare(b.added_at))
    const limit = Number(q.get("limit") ?? 1000)
    return sorted.slice(0, limit).map((r) => ({ posting_id: r.posting_id }))
  }
  return { svc, patches }
}
const open = { url: "https://jobs.example.com/a", closed_at: null }

describe("the server hands out queued jobs", () => {
  test("never more than two at a time, oldest first", async () => {
    const queue = ["a", "b", "c", "d"].map((id, i) => ({ posting_id: id, state: "waiting", added_at: `2026-10-18T08:0${i}:00Z` }))
    const db = fakeDb(queue, { a: open, b: open, c: open, d: open })
    const first = await queueNext(db.svc, "u1", [])
    expect(first.start.map((s) => s.posting_id)).toEqual(["a", "b"])
    expect(QUEUE_PARALLEL).toBe(2)
    // One is working on the extension: only one place is free.
    const second = await queueNext(db.svc, "u1", ["a", "b"])
    expect(second.start).toEqual([])
    queue.find((r) => r.posting_id === "a")!.state = "review"
    const third = await queueNext(db.svc, "u1", ["b"])
    expect(third.start.map((s) => s.posting_id)).toEqual(["c"])
  })
  test("a job the person removed is dropped from the extension; a job the extension lost goes back to waiting", async () => {
    const queue = [{ posting_id: "gone", state: "waiting", added_at: "1" }, { posting_id: "lost", state: "working", added_at: "2" }]
    const db = fakeDb(queue, { gone: open, lost: open })
    const answer = await queueNext(db.svc, "u1", ["removed"])
    expect(answer.drop).toEqual(["removed"])
    expect(queue.find((r) => r.posting_id === "lost")!.state).toBe("working") // taken again below
    expect(answer.start.map((s) => s.posting_id).sort()).toEqual(["gone", "lost"])
  })
  test("a closed job is never opened: it fails with the closed reason", async () => {
    const queue = [{ posting_id: "x", state: "waiting", added_at: "1" }]
    const db = fakeDb(queue, { x: { url: "https://jobs.example.com/x", closed_at: "2026-10-01T00:00:00Z" } })
    const answer = await queueNext(db.svc, "u1", [])
    expect(answer.start).toEqual([])
    expect(queue[0]).toMatchObject({ state: "failed", reason: "closed" })
  })
})

describe("how a job ended", () => {
  test("review and sent carry no reason; needs_you always has one", async () => {
    const queue = [{ posting_id: "a", state: "working", added_at: "1" }]
    const db = fakeDb(queue, {})
    await queueDone(db.svc, "u1", { posting_id: "a", state: "needs_you", message: "Check the box" })
    expect(queue[0]).toMatchObject({ state: "needs_you", reason: "other" })
    await queueDone(db.svc, "u1", { posting_id: "a", state: "review", reason: "captcha", message: "Filled" })
    expect(queue[0]).toMatchObject({ state: "review", reason: null })
  })
  test("the Broods run's own reason wins over the tab's last line, and a closed job is a failure", async () => {
    const queue = [{ posting_id: "a", state: "working", added_at: "1" }]
    const db = fakeDb(queue, {}, [{ status: "needs_you", reason: "captcha", message: "A security check blocks the form." }])
    await queueDone(db.svc, "u1", { posting_id: "a", state: "needs_you", reason: "other", message: "stopped" })
    expect(queue[0]).toMatchObject({ state: "needs_you", reason: "captcha", message: "A security check blocks the form." })
    const closed = fakeDb([{ posting_id: "b", state: "working", added_at: "1" }], {}, [{ status: "needs_you", reason: "closed", message: "Closed." }])
    await queueDone(closed.svc, "u1", { posting_id: "b", state: "needs_you" })
    expect(closed.patches[0].body).toMatchObject({ state: "failed", reason: "closed" })
  })
  test("a state the extension cannot know is refused", async () => {
    const db = fakeDb([{ posting_id: "a", state: "waiting", added_at: "1" }], {})
    expect(await queueDone(db.svc, "u1", { posting_id: "a", state: "waiting" })).toBe(false)
    expect(await queueDone(db.svc, "u1", { posting_id: "a", state: "working" })).toBe(false)
    expect(db.patches).toEqual([])
  })
})

describe("the report after a queue run", () => {
  const now = Date.parse("2026-10-18T12:00:00Z")
  const at = (state: QueueItem["state"], started: string | null, updated: string, reason: QueueItem["reason"] = null): QueueItem =>
    ({ ...item(state, reason, null, updated), posting_id: `${state}-${updated}`, started_at: started })

  test("no report while Odds is still filling or has some waiting: the agent bar shows progress instead", () => {
    expect(queueReport([at("review", "2026-10-18T10:00:00Z", "2026-10-18T10:20:00Z"), at("working", "2026-10-18T10:05:00Z", "2026-10-18T10:30:00Z")], now)).toBeNull()
    expect(queueReport([at("waiting", null, "2026-10-18T10:30:00Z")], now)).toBeNull()
  })
  test("once nothing is left: ready, needs you, sent and skipped are counted, with how long it took", () => {
    const r = queueReport([
      at("review", "2026-10-18T10:00:00Z", "2026-10-18T10:20:00Z"),
      at("review", "2026-10-18T10:05:00Z", "2026-10-18T10:42:00Z"),
      at("needs_you", "2026-10-18T10:10:00Z", "2026-10-18T10:15:00Z", "captcha"),
      at("failed", "2026-10-18T10:12:00Z", "2026-10-18T10:13:00Z", "closed"),
      at("sent", "2026-10-18T10:01:00Z", "2026-10-18T10:30:00Z"),
    ], now)!
    expect(r).toEqual({ total: 5, ready: 2, needs: 1, sent: 1, skipped: 1, minutes: 42 })
    expect(reportHeadline(r)).toBe("2 of 5 ready to send")
  })
  test("only the last day counts, and an old queue gives no report", () => {
    expect(queueReport([at("review", "2026-10-16T10:00:00Z", "2026-10-16T10:20:00Z")], now)).toBeNull()
    expect(queueReport([at("review", "2026-10-16T10:00:00Z", "2026-10-16T10:20:00Z"), at("review", "2026-10-18T11:00:00Z", "2026-10-18T11:10:00Z")], now)?.total).toBe(1)
  })
  test("the headline puts what the person has to do first", () => {
    expect(reportHeadline({ total: 3, ready: 0, needs: 1, sent: 2, skipped: 0, minutes: 5 })).toBe("1 of 3 needs you")
    expect(reportHeadline({ total: 2, ready: 0, needs: 0, sent: 2, skipped: 0, minutes: 5 })).toBe("All 2 sent")
    expect(reportHeadline({ total: 2, ready: 0, needs: 0, sent: 0, skipped: 2, minutes: 5 })).toBe("Queue done: 2 applications")
  })
})
