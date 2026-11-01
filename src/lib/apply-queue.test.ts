import { describe, expect, test } from "bun:test"
import { QUEUE_PARALLEL, QUEUE_TRIES, brokeMidway, queueDone, queueNext } from "../../supabase/functions/_shared/apply-queue"
import { groupOf, groupQueue, linePlaces, ordinal, queueActions, queueCounts, queueWords, type QueueItem } from "./apply-queue-words"

const item = (state: QueueItem["state"], reason: QueueItem["reason"] = null, message: string | null = null, updated = "2026-10-18T09:00:00Z", added = "2026-10-18T08:00:00Z", id?: string): QueueItem =>
  ({ posting_id: id ?? `${state}-${reason}-${updated}`, state, reason, message, added_at: added, started_at: null, updated_at: updated })

describe("the words on a queue row", () => {
  test("each state has its group and a plain label", () => {
    expect(queueWords(item("waiting"), 2)).toMatchObject({ label: "Up next", group: "working" })
    expect(queueWords(item("waiting"), 2).why).toMatch(/^2nd in line/)
    expect(queueWords(item("working")).label).toBe("Filling in")
    expect(queueWords(item("review")).label).toBe("Ready to send")
    expect(queueWords(item("sent")).group).toBe("done")
    expect(queueWords(item("skipped")).group).toBe("done")
    expect(groupOf(item("needs_you"))).toBe("needs")
  })
  test("places in line read as words", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"])
    const places = linePlaces([item("waiting", null, null, "x", "2026-10-18T08:02:00Z", "b"), item("working"), item("waiting", null, null, "x", "2026-10-18T08:01:00Z", "a")])
    expect([...places]).toEqual([["a", 1], ["b", 2]])
  })
  test("a stop that needs the person gives exactly one reason", () => {
    expect(queueWords(item("needs_you", "captcha"))).toMatchObject({ label: "A check is in the way", group: "needs" })
    expect(queueWords(item("needs_you", "account")).why).toMatch(/never types passwords/)
    expect(queueWords(item("needs_you", "tab")).label).toBe("Tab closed")
    expect(queueWords(item("needs_you", "email")).label).toBe("Apply by email")
  })
  test("an unknown stop keeps the site's own sentence; a failure can be tried again, a closed job is done", () => {
    expect(queueWords(item("needs_you", "other", "Pick your start date.")).why).toBe("Pick your start date.")
    expect(queueWords(item("failed", "other", "The form would not load."))).toMatchObject({ label: "Couldn't apply", why: "The form would not load.", group: "needs" })
    expect(queueWords(item("failed", "closed"))).toMatchObject({ label: "Closed", group: "done" })
  })
  test("no words use jargon or promise that Odds sends anything", () => {
    for (const state of ["waiting", "working", "review", "needs_you", "failed", "sent", "skipped"] as const) {
      const w = queueWords(item(state, state === "needs_you" ? "captcha" : null))
      expect(`${w.label} ${w.why}`).not.toMatch(/broods|agent|\brun\b|drive|assist/i)
      expect(w.why).not.toMatch(/odds (will )?(submit|send)s? (it|for you)/i)
    }
  })
  test("rows group needs-you first; working before waiting, waiting in line order", () => {
    const groups = groupQueue([
      item("review", null, null, "2026-10-18T09:00:00Z"),
      item("needs_you", "captcha"),
      item("waiting", null, null, "2026-10-18T09:00:00Z", "2026-10-18T08:05:00Z", "w2"),
      item("waiting", null, null, "2026-10-18T09:00:00Z", "2026-10-18T08:01:00Z", "w1"),
      item("working"),
      item("sent"),
    ])
    expect(groups.map((g) => g.group)).toEqual(["needs", "ready", "working", "done"])
    expect(groups[2].items.map((i) => i.state === "working" ? "working" : i.posting_id)).toEqual(["working", "w1", "w2"])
    expect(queueCounts([item("review"), item("review"), item("failed"), item("waiting"), item("sent")])).toMatchObject({ ready: 2, needs: 1, waiting: 1, sent: 1 })
  })
  test("what each row offers", () => {
    expect(queueActions(item("review"))).toMatchObject({ goToTab: true, markSent: true, skip: true, remove: false })
    expect(queueActions(item("waiting"))).toMatchObject({ goToTab: false, remove: true, skip: false })
    expect(queueActions(item("needs_you", "captcha"))).toMatchObject({ goToTab: true, retry: true, skip: true })
    expect(queueActions(item("failed", "closed"))).toMatchObject({ goToTab: false, retry: false })
    expect(queueActions(item("skipped")).retry).toBe(true)
    expect(queueActions(item("sent"))).toMatchObject({ goToTab: false, markSent: false, retry: false, skip: false, remove: false })
  })
})

type Row = { posting_id: string; state: string; added_at: string; updated_at?: string; tries?: number; reason?: string | null; message?: string | null }
/** A fake of the database: just enough PostgREST to run the two server routes. */
function fakeDb(queue: Row[], postings: Record<string, { url: string | null; closed_at: string | null }>, runs: Array<Record<string, unknown>> = []) {
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
    return sorted.slice(0, limit).map((r) => ({ posting_id: r.posting_id, updated_at: r.updated_at ?? new Date().toISOString(), tries: r.tries ?? 0 }))
  }
  return { svc, patches }
}
const open = { url: "https://jobs.example.com/a", closed_at: null }
const longAgo = "2026-01-01T00:00:00Z"

describe("the server hands out queued jobs", () => {
  test("never more than three at a time, oldest first", async () => {
    const queue: Row[] = ["a", "b", "c", "d", "e"].map((id, i) => ({ posting_id: id, state: "waiting", added_at: `2026-10-18T08:0${i}:00Z` }))
    const db = fakeDb(queue, { a: open, b: open, c: open, d: open, e: open })
    const first = await queueNext(db.svc, "u1", [])
    expect(first.start.map((s) => s.posting_id)).toEqual(["a", "b", "c"])
    expect(QUEUE_PARALLEL).toBe(3)
    const second = await queueNext(db.svc, "u1", ["a", "b", "c"])
    expect(second.start).toEqual([])
    // One reached Review: its place is free for the next in line.
    queue.find((r) => r.posting_id === "a")!.state = "review"
    const third = await queueNext(db.svc, "u1", ["b", "c"])
    expect(third.start.map((s) => s.posting_id)).toEqual(["d"])
  })
  test("a job the person skipped is let go; a job no Chrome checked in on for a while goes back in line and starts again", async () => {
    const queue: Row[] = [{ posting_id: "gone", state: "waiting", added_at: "1" }, { posting_id: "lost", state: "working", added_at: "2", updated_at: longAgo }]
    const db = fakeDb(queue, { gone: open, lost: open })
    const answer = await queueNext(db.svc, "u1", ["skipped"])
    expect(answer.drop).toEqual(["skipped"])
    expect(answer.start.map((s) => s.posting_id).sort()).toEqual(["gone", "lost"])
  })
  test("a job another Chrome is still working on is left alone", async () => {
    const queue: Row[] = [{ posting_id: "theirs", state: "working", added_at: "1", updated_at: new Date().toISOString() }]
    const db = fakeDb(queue, { theirs: open })
    const answer = await queueNext(db.svc, "u1", [])
    expect(answer.start).toEqual([])
    expect(queue[0].state).toBe("working")
  })
  test("the jobs this Chrome holds are checked in, so no other Chrome takes them", async () => {
    const queue: Row[] = [{ posting_id: "mine", state: "working", added_at: "1", updated_at: longAgo }]
    const db = fakeDb(queue, { mine: open })
    await queueNext(db.svc, "u1", ["mine"])
    expect(Date.parse(queue[0].updated_at!)).toBeGreaterThan(Date.parse(longAgo))
    expect(queue[0].state).toBe("working")
  })
  test("a closed job is never opened: it fails with the closed reason", async () => {
    const queue: Row[] = [{ posting_id: "x", state: "waiting", added_at: "1" }]
    const db = fakeDb(queue, { x: { url: "https://jobs.example.com/x", closed_at: "2026-10-01T00:00:00Z" } })
    const answer = await queueNext(db.svc, "u1", [])
    expect(answer.start).toEqual([])
    expect(queue[0]).toMatchObject({ state: "failed", reason: "closed" })
  })
})

describe("how a job ended", () => {
  test("review and sent carry no reason; needs_you always has one", async () => {
    const queue: Row[] = [{ posting_id: "a", state: "working", added_at: "1" }]
    const db = fakeDb(queue, {})
    await queueDone(db.svc, "u1", { posting_id: "a", state: "needs_you", message: "Check the box" })
    expect(queue[0]).toMatchObject({ state: "needs_you", reason: "other" })
    await queueDone(db.svc, "u1", { posting_id: "a", state: "review", reason: "captcha", message: "Filled" })
    expect(queue[0]).toMatchObject({ state: "review", reason: null })
  })
  test("the form's own reason wins over the tab's last line, and a closed job is a failure", async () => {
    const queue: Row[] = [{ posting_id: "a", state: "working", added_at: "1" }]
    const db = fakeDb(queue, {}, [{ status: "needs_you", reason: "captcha", message: "A security check blocks the form." }])
    await queueDone(db.svc, "u1", { posting_id: "a", state: "needs_you", reason: "other", message: "stopped" })
    expect(queue[0]).toMatchObject({ state: "needs_you", reason: "captcha", message: "A security check blocks the form." })
    const closed = fakeDb([{ posting_id: "b", state: "working", added_at: "1" }], {}, [{ status: "needs_you", reason: "closed", message: "Closed." }])
    await queueDone(closed.svc, "u1", { posting_id: "b", state: "needs_you" })
    expect(closed.patches[0].body).toMatchObject({ state: "failed", reason: "closed" })
  })
  test("a run that died partway starts again by itself twice, then asks the person", async () => {
    expect(brokeMidway("Broods' model is unreachable. The fill stopped. Press Apply again.")).toBe(true)
    expect(brokeMidway("Please complete the captcha")).toBe(false)
    const queue: Row[] = [{ posting_id: "a", state: "working", added_at: "1", tries: 0 }]
    const db = fakeDb(queue, {}, [{ status: "stuck", reason: "other", message: "Broods' model is unreachable. The fill stopped." }])
    for (let i = 0; i < QUEUE_TRIES; i++) {
      await queueDone(db.svc, "u1", { posting_id: "a", state: "needs_you", message: "stopped" })
      expect(queue[0]).toMatchObject({ state: "waiting", tries: i + 1 })
      queue[0].state = "working"
    }
    await queueDone(db.svc, "u1", { posting_id: "a", state: "needs_you", message: "stopped" })
    expect(queue[0]).toMatchObject({ state: "needs_you", reason: "other" })
    expect(queue[0].message).toMatch(/tried 3 times/)
  })
  test("a lost tab goes back in line, then becomes Tab closed", async () => {
    const queue: Row[] = [{ posting_id: "a", state: "working", added_at: "1", tries: QUEUE_TRIES }]
    const db = fakeDb(queue, {})
    await queueDone(db.svc, "u1", { posting_id: "a", state: "retry", reason: "tab", message: "The application tab was closed before Odds finished." })
    expect(queue[0]).toMatchObject({ state: "needs_you", reason: "tab" })
  })
  test("a state the extension cannot know is refused", async () => {
    const db = fakeDb([{ posting_id: "a", state: "waiting", added_at: "1" }], {})
    expect(await queueDone(db.svc, "u1", { posting_id: "a", state: "waiting" })).toBe(false)
    expect(await queueDone(db.svc, "u1", { posting_id: "a", state: "working" })).toBe(false)
    expect(db.patches).toEqual([])
  })
})
