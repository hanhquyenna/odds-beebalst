// The apply queue on the server side (the extension's two routes). No imports: the caller passes the database call in, so this is testable.
// The extension asks for work (`queueNext`) and says how each job ended (`queueDone`). It never submits anything.

// deno-lint-ignore no-explicit-any
type Svc = (path: string, init?: { method?: string; body?: string; headers?: Record<string, string> }) => Promise<any>

/** At most this many applications are worked on at the same time. */
export const QUEUE_PARALLEL = 3
/** A run that died partway is started again by itself this many times before the person is asked. */
export const QUEUE_TRIES = 2
/** A job another Chrome is working on is only taken back when that Chrome has not checked in for this long. */
const ORPHAN_MS = 2 * 60_000

export const QUEUE_STATES = ["review", "needs_you", "failed", "sent", "retry"] as const
export const QUEUE_REASONS = ["captcha", "account", "questions", "letter", "closed", "email", "tab", "other"] as const
export type QueueState = (typeof QUEUE_STATES)[number]

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 500) : "")

/** A stop that is Odds' own trouble, not the person's: the model or the network went away, the tab was lost. Worth starting again. */
export function brokeMidway(message: string): boolean {
  return /model is unreachable|unreachable|lost its connection|timed out before|odds stopped answering|timed out|network error|failed to fetch|the fill stopped|tab went away|extension was (reloaded|updated)|lost the (page|tab)|took too long/i.test(message)
}

/**
 * What the extension asked: `active` are the jobs it is working on now. It gets back the jobs to start (as many as there is room for,
 * oldest first) and the jobs it must let go of (no longer working on the server: the person skipped them).
 */
export async function queueNext(svc: Svc, userId: string, active: unknown): Promise<{ start: Array<{ posting_id: string; url: string }>; drop: string[] }> {
  const mine = Array.isArray(active) ? active.filter((v): v is string => typeof v === "string" && v.length <= 200).slice(0, 10) : []
  const now = new Date().toISOString()
  const working: Array<{ posting_id: string; updated_at: string }> = (await svc(`apply_queue?user_id=eq.${userId}&state=eq.working&select=posting_id,updated_at`)) ?? []
  const live = new Set(working.map((r) => r.posting_id))
  const drop = mine.filter((id) => !live.has(id))
  const held = mine.filter((id) => live.has(id))
  // The jobs this Chrome still works on: checked in, so another Chrome never takes them back.
  if (held.length) {
    await svc(`apply_queue?user_id=eq.${userId}&state=eq.working&posting_id=in.(${held.map(encodeURIComponent).join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ updated_at: now }),
    })
  }
  // Jobs the server says are working but no Chrome has checked in on for a while (it was closed or restarted): back to waiting, first in
  // line, so they are started again (in the same tab when it is still open).
  const cutoff = Date.now() - ORPHAN_MS
  const orphans = working.filter((r) => !mine.includes(r.posting_id) && Date.parse(r.updated_at) < cutoff).map((r) => r.posting_id)
  if (orphans.length) {
    await svc(`apply_queue?user_id=eq.${userId}&state=eq.working&posting_id=in.(${orphans.map(encodeURIComponent).join(",")})`, {
      method: "PATCH",
      body: JSON.stringify({ state: "waiting", started_at: null, updated_at: now }),
    })
  }
  const room = Math.max(0, QUEUE_PARALLEL - held.length)
  if (room === 0) return { start: [], drop }
  const waiting: Array<{ posting_id: string }> = (await svc(`apply_queue?user_id=eq.${userId}&state=eq.waiting&select=posting_id&order=added_at.asc&limit=${room}`)) ?? []
  const start: Array<{ posting_id: string; url: string }> = []
  for (const row of waiting) {
    // Only a job still waiting is taken (a second poll at the same moment gets nothing for it).
    const taken: Array<{ posting_id: string }> = await svc(`apply_queue?user_id=eq.${userId}&posting_id=eq.${encodeURIComponent(row.posting_id)}&state=eq.waiting`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ state: "working", started_at: now, updated_at: now }),
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
 * (the site's own thank-you), retry (the run died partway: the tab was lost or it stalled). When the Broods run for the job stopped for a
 * reason, that reason and its words win over the tab's last line. A run that died of Odds' own trouble goes back to the front of the line
 * by itself, twice; after that the person is asked.
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
    if (reason !== "closed" && brokeMidway(message)) state = "retry"
  }
  const rows: Array<{ tries: number }> = (await svc(`apply_queue?user_id=eq.${userId}&posting_id=eq.${encodeURIComponent(id)}&select=tries`).catch(() => null)) ?? []
  const now = new Date().toISOString()
  if (state === "retry") {
    const tries = rows[0]?.tries ?? 0
    if (tries < QUEUE_TRIES) {
      // Back to the front of the line (its first added time is kept, so it comes before jobs added later).
      await svc(`apply_queue?user_id=eq.${userId}&posting_id=eq.${encodeURIComponent(id)}&state=in.(working,needs_you)`, {
        method: "PATCH",
        body: JSON.stringify({ state: "waiting", reason: null, message: "Starting again after a hiccup.", tries: tries + 1, started_at: null, updated_at: now }),
      })
      return true
    }
    state = "needs_you"
    reason = reason === "tab" ? "tab" : "other"
    message = `${message || "Odds lost this application partway."} It tried ${tries + 1} times. Open the tab to finish it, or press Try again.`.slice(0, 500)
  }
  if (state === "needs_you" && !reason) reason = "other"
  if (state === "review" || state === "sent") reason = null
  await svc(`apply_queue?user_id=eq.${userId}&posting_id=eq.${encodeURIComponent(id)}&state=in.(working,review,needs_you)`, {
    method: "PATCH",
    body: JSON.stringify({ state, reason, message: message || null, updated_at: now }),
  })

  return true
}
