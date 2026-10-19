// The apply queue on the server side (the extension's two routes). No imports: the caller passes the database call in, so this is testable.
// The extension asks for work (`queueNext`) and says how each job ended (`queueDone`). It never submits anything.

// deno-lint-ignore no-explicit-any
type Svc = (path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<any>

/** At most this many applications are worked on at the same time. */
export const QUEUE_PARALLEL = 2

export const QUEUE_STATES = ["review", "needs_you", "failed", "sent"] as const
export const QUEUE_REASONS = ["captcha", "account", "questions", "letter", "closed", "email", "other"] as const
export type QueueState = (typeof QUEUE_STATES)[number]

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 500) : "")

/**
 * What the extension asked: `active` are the jobs it is working on now. It gets back the jobs to start (as many as there is room for,
 * oldest first) and the jobs it must stop (no longer working on the server: the person took them out of the queue).
 */
export async function queueNext(svc: Svc, userId: string, active: unknown): Promise<{ start: Array<{ posting_id: string; url: string }>; drop: string[] }> {
  const mine = Array.isArray(active) ? active.filter((v): v is string => typeof v === "string" && v.length <= 200).slice(0, 10) : []
  const working: Array<{ posting_id: string }> = (await svc(`apply_queue?user_id=eq.${userId}&state=eq.working&select=posting_id`)) ?? []
  const live = new Set(working.map((r) => r.posting_id))
  const drop = mine.filter((id) => !live.has(id))
  // Jobs the server says are working but this extension does not have (it was restarted): back to waiting, so they are started again.
  const orphans = working.map((r) => r.posting_id).filter((id) => !mine.includes(id))
  if (orphans.length) {
    await svc(`apply_queue?user_id=eq.${userId}&state=eq.working&posting_id=in.(${orphans.map(encodeURIComponent).join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ state: "waiting", started_at: null, updated_at: new Date().toISOString() }),
    })
  }
  const room = Math.max(0, QUEUE_PARALLEL - mine.filter((id) => live.has(id)).length)
  if (room === 0) return { start: [], drop }
  const waiting: Array<{ posting_id: string }> = (await svc(`apply_queue?user_id=eq.${userId}&state=eq.waiting&select=posting_id&order=added_at.asc&limit=${room}`)) ?? []
  const start: Array<{ posting_id: string; url: string }> = []
  for (const row of waiting) {
    // Only a job still waiting is taken (a second poll at the same moment gets nothing for it).
    const taken: Array<{ posting_id: string }> = await svc(`apply_queue?user_id=eq.${userId}&posting_id=eq.${encodeURIComponent(row.posting_id)}&state=eq.waiting`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ state: "working", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    })
    if (!taken?.length) continue
    const post: Array<{ url: string | null; closed_at: string | null }> = (await svc(`postings?id=eq.${encodeURIComponent(row.posting_id)}&select=url,closed_at`)) ?? []
    const url = post[0]?.url
    if (!url || !/^https:\/\//.test(url) || post[0]?.closed_at) {
      await queueDone(svc, userId, { posting_id: row.posting_id, state: "failed", reason: post[0]?.closed_at ? "closed" : "other", message: post[0]?.closed_at ? "This job is closed: it no longer takes applications." : "This job has no application page Odds can open." })
      continue
    }
    start.push({ posting_id: row.posting_id, url })
  }

  return { start, drop }
}

/**
 * How a job ended. Only the states the extension can know: review (only Submit is left), needs_you (one reason), failed (a message), sent
 * (the site's own thank-you). When the Broods run for the job stopped for a reason, that reason and its words win over the tab's last line.
 */
export async function queueDone(svc: Svc, userId: string, body: { posting_id?: unknown; state?: unknown; reason?: unknown; message?: unknown }): Promise<boolean> {
  const id = typeof body.posting_id === "string" ? body.posting_id : ""
  if (!id || !(QUEUE_STATES as readonly unknown[]).includes(body.state)) return false
  let state = body.state as QueueState
  let reason: string | null = (QUEUE_REASONS as readonly unknown[]).includes(body.reason) ? (body.reason as string) : null
  let message = clean(body.message)
  if (state === "needs_you" || state === "failed") {
    const run: Array<{ status: string; reason: string | null; message: string | null }> =
      (await svc(`drive_runs?user_id=eq.${userId}&posting_id=eq.${encodeURIComponent(id)}&order=created_at.desc&limit=1&select=status,reason,message`).catch(() => null)) ?? []
    const last = run[0]
    if (last && ["needs_you", "stuck"].includes(last.status)) {
      if (last.reason && (QUEUE_REASONS as readonly unknown[]).includes(last.reason)) reason = last.reason
      if (last.message) message = clean(last.message)
      // A closed job is not something the person can fix: it is a failure.
      if (reason === "closed") state = "failed"
    }
  }
  if (state === "needs_you" && !reason) reason = "other"
  if (state === "review" || state === "sent") reason = null
  await svc(`apply_queue?user_id=eq.${userId}&posting_id=eq.${encodeURIComponent(id)}&state=in.(working,review,needs_you)`, {
    method: "PATCH",
    body: JSON.stringify({ state, reason, message: message || null, updated_at: new Date().toISOString() }),
  })

  return true
}
