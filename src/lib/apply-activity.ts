// Live Apply-with-Odds activity for the tracker: pin the job you're working on to the top
// and show filling / needs you / review instead of a stale Saved chip.
import { useEffect, useState } from "react"
import { tabGone, type DriveReason, type DriveRun, type DriveStatus } from "@/lib/drive-run-state"

export type ApplyActivityStatus = "filling" | "needs_input" | "ready" | "failed" | "submitted"

export interface ApplyActivity {
  postingId: string
  url?: string
  status: ApplyActivityStatus
  message: string
  /** Last update — used for ACTIVE_MS expiry only (not sort order). */
  at: number
  /** First time this Apply became live — stable pin order so rows don't thrash. */
  pinnedAt: number
  /** The Broods run behind it, as the server last reported it (the truth over the tab's last line). */
  drive?: DriveInfo
  /** When the server last reported that run. */
  driveAt?: number
}

export interface DriveInfo {
  runId: string
  status: DriveStatus
  reason: DriveReason | null
  /** Broods' own line about what it is doing now. */
  note: string
  steps: number
  /** Running, but the tab stopped asking for steps: Chrome or the tab is gone. */
  tabGone: boolean
  /** Broods' own sentence when it stopped (what it needs, the questions). */
  message: string
}

/** The server reported this run in the last poll or so. */
const DRIVE_FRESH_MS = 20_000
const driveFresh = (a: ApplyActivity | null | undefined, now = Date.now()): a is ApplyActivity & { drive: DriveInfo } =>
  Boolean(a?.drive && typeof a.driveAt === "number" && now - a.driveAt < DRIVE_FRESH_MS)

const KEY = "odds:apply-activity-v1"
/** Keep an active Apply visible at the top of the tracker for this long. */
const ACTIVE_MS = 2 * 60 * 60 * 1000
/** A filling line that has not changed for this long, with no Broods run behind it, is a dead tab's leftover. */
const FILLING_SILENT_MS = 10 * 60 * 1000
const listeners = new Set<() => void>()
let syncBatch: Record<string, ApplyActivity> | null = null
let syncBatchChanged = false

function read(): Record<string, ApplyActivity> {
  if (syncBatch) return syncBatch
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, ApplyActivity>
    if (!parsed || typeof parsed !== "object") return {}
    // Older rows may lack pinnedAt — treat `at` as the pin time once.
    for (const a of Object.values(parsed)) {
      if (a && typeof a.at === "number" && typeof a.pinnedAt !== "number") a.pinnedAt = a.at
    }
    return parsed
  } catch {
    return {}
  }
}

function write(all: Record<string, ApplyActivity>): void {
  if (syncBatch) { syncBatch = all; syncBatchChanged = true; return }
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* ignore quota */
  }
  for (const l of listeners) l()
}

/** Subscribe to Apply activity changes (tracker re-sort / badges). */
export function onApplyActivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The Broods run behind a job's chip, while the server reports it. */
export function driveOf(postingId: string): DriveInfo | null {
  const a = read()[postingId]
  return driveFresh(a) ? a.drive : null
}

export function applyActivityOf(postingId: string): ApplyActivity | null {
  const a = read()[postingId]
  return a && typeof a.at === "number" ? a : null
}

/** Filling / needs answer / ready to review — still in play. */
export function isLiveApply(a: ApplyActivity | null | undefined): boolean {
  if (!a) return false
  // A Broods run is live until it is sent, failed, or the person moved the job themselves.
  if (driveFresh(a)) return !["submitted", "failed"].includes(a.drive.status)
  if (!["filling", "needs_input", "ready"].includes(a.status)) return false
  // "Applying…" with no Broods run behind it and no new line for 10 minutes is not live: never a silent forever-Applying chip.
  if (a.status === "filling" && Date.now() - a.at > FILLING_SILENT_MS) return false
  return Date.now() - a.at < ACTIVE_MS
}

/**
 * Stuck chip ONLY when Odds/Broods assist already ran and still cannot move —
 * never bare timeouts / “still loading” (those stay Applying… or Your answers).
 */
// Transport / “reload extension” is NOT Broods Stuck — never classify those as Stuck chips.
const STUCK_MSG = /\bafter (odds )?assist\b|\bagent gave up\b|odds assist could not\b|broods could not\b|could not move this application forward after assist|could not open the application form after assist|could not open an application after assist|employer site returned an error/i
const EXT_TRANSPORT_MSG = /extension did not respond|odds in chrome did not answer|reconnect(ing)? the extension|reconnect odds on connect|connect odds from the extension|extension context invalidated/i
const CAPTCHA_MSG = /captcha|verify you are human|security verification/i
/** Old stuck copy named both — never treat as Captcha (chip/title mismatch with Account body). */
const AMBIG_CAPTCHA_ACCOUNT = /captcha or account/i
/** Real account gates only — not "login" inside "could not open… login/verification" opener text. */
const ACCOUNT_MSG = /password|create (an )?account|account (or login|required|aanmaken)|needs an account|make the account|register|sign up|sign in or make|account or login required|never types passwords|choose your password|inloggen|account aanmaken|email from your odds profile|sign in to (linkedin|indeed|glassdoor)|still not signed in to/i
const REVIEW_MSG = /check everything|press submit|review and send|filled in by odds|send it yourself/i
const CLOSED_MSG = /no longer accepting applications|not currently accepting applications|applications are closed|no longer available|vacature gesloten|this job is no longer available/i
/** Waiting on the person for outlined / marked Easy Apply fields (not a mid-fill “fix it” nag). */
const ANSWERS_MSG = /answer the \d* ?marked questions?|answer the \d* ?outlined questions?|outlined question|marked question/i
/** The person went back a step: Odds waits on their page until they press Next/Apply (or Apply with Odds) again. */
const PAUSED_MSG = /odds paused here|you went back a step/i
/** Mid-fill LinkedIn nags — keep Applying… so the script/LLM can keep going. */
const NAG_MSG = /wants something changed|fix it, then press/i
/** Broods / Edge still working — never Your answers / Review until they finish a pass. */
const AGENT_BUSY_MSG = /asking odds|broods is reading|filling what we know|continuing in the background|filling in the background|no progress — filling|odds confirmed|odds checked your profile|odds filled \d|waiting for odds to attach/i

/**
 * Captcha / Account / Stuck / Your answers → needs_input chip. Review → ready.
 * Closed → failed. Mid-fill LinkedIn nags stay Applying….
 */
export function normalizeApplyStatus(status: ApplyActivityStatus, message: string): ApplyActivityStatus {
  const m = message || ""
  if (status === "submitted" || status === "failed") return status
  // Going back pauses the run, whatever it said before (a Review from a later step is no longer true).
  if (PAUSED_MSG.test(m)) return "needs_input"
  if (status === "ready") return status
  // Closed is failed, never Account (old fallback text contained "login").
  if (CLOSED_MSG.test(m)) return "failed"
  // Broods still working — stay Applying… even if an older poll said needs_input.
  if (AGENT_BUSY_MSG.test(m)) return "filling"
  // Opener / closed ambiguity is Stuck, even when an old build said "login".
  if (STUCK_MSG.test(m)) return "needs_input"
  if (CAPTCHA_MSG.test(m) || ACCOUNT_MSG.test(m)) return "needs_input"
  // Outlined / marked questions: person must answer — sync as Needs your answer, not Filling.
  if (ANSWERS_MSG.test(m)) return "needs_input"
  if (REVIEW_MSG.test(m) && !ANSWERS_MSG.test(m)) return "ready"
  // LinkedIn mid-fill nags: keep filling for the chip.
  if (NAG_MSG.test(m)) return "filling"
  return status
}

/** Tracker chip: Captcha / Account / Stuck / Your answers / Applying… / Review & send. */
export function applyActivityLabel(a: ApplyActivity): string {
  if (driveFresh(a)) return driveLabel(a.drive)
  const m = a.message || ""
  const status = normalizeApplyStatus(a.status, m)
  if (PAUSED_MSG.test(m)) return "Paused"
  if (status === "ready") return "Review & send"
  if (CLOSED_MSG.test(m) || (status === "failed" && CLOSED_MSG.test(m))) return "Closed"
  if (status === "failed") return "Apply stopped"
  if (status === "submitted") return "Applied"
  if (CAPTCHA_MSG.test(m) && !AMBIG_CAPTCHA_ACCOUNT.test(m)) return "Captcha"
  if (EXT_TRANSPORT_MSG.test(m)) return "Reconnect"
  if (STUCK_MSG.test(m) || AMBIG_CAPTCHA_ACCOUNT.test(m)) return "Stuck"
  if (ACCOUNT_MSG.test(m) && !CLOSED_MSG.test(m)) return "Account"
  if (ANSWERS_MSG.test(m) || status === "needs_input") return "Your answers"
  return "Applying…"
}

/** The chip for a Broods run: what it is doing, or exactly why it waits for the person. */
export function driveLabel(d: DriveInfo): string {
  if (d.status === "running") return d.tabGone ? "Tab closed" : "Applying…"
  if (d.status === "review") return "Review & send"
  if (d.status === "submitted") return "Applied"
  if (d.status === "stopped") return "Stopped"
  if (d.status === "failed") return "Apply stopped"
  const byReason: Record<string, string> = { captcha: "Captcha", account: "Sign in", questions: "Your answers", letter: "Cover letter", closed: "Closed", quiet: "Stopped" }
  return (d.reason && byReason[d.reason]) || (d.status === "needs_you" ? "Needs you" : "Stuck")
}

/** What the run waits for, in a sentence the person can act on (the run's own message follows it). */
export function driveWhy(d: DriveInfo): string {
  if (d.status === "running") return d.tabGone ? "The application tab is closed or Chrome is asleep, so Broods cannot go on. Open the tab or press Continue." : d.note || "Broods is applying in your Chrome tab."
  if (d.status === "review") return "Everything is filled in. Check it in the tab and press Submit yourself."
  if (d.status === "stopped") return "Broods is stopped on this application. Continue to carry on, or finish it yourself."
  const byReason: Record<string, string> = {
    captcha: "A captcha is on the page. Tick it in the tab, then press Continue.",
    account: "The site wants you to sign in. Sign in in the tab (Odds never types passwords), then press Continue.",
    questions: "Some questions only you can answer. Answer them here or in the tab, then press Continue.",
    letter: "This application asks for a cover letter. Add one for this job in Documents, then press Continue.",
    closed: "This job no longer takes applications.",
    quiet: "Broods went quiet on this application. Press Continue to have it pick up again.",
  }
  return (d.reason && byReason[d.reason]) || "Broods could not move on by itself. Open the tab to see why, then press Continue."
}

const DISMISSED_KEY = "odds:drive-dismissed-v1"
function dismissedRuns(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]") as string[]) } catch { return new Set() }
}
/** The person set this job's status themselves: this run's chip is gone for good (a later run shows again). */
export function dismissDriveRun(runId: string): void {
  try {
    const ids = dismissedRuns()
    ids.add(runId)
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-300)))
  } catch { /* storage unavailable */ }
}

/** Runs the server reported in its last poll (null before the first poll). */
let serverRuns: Set<string> | null = null

/** Server poll: every Broods run becomes its job's chip, straight from the run (no guessing from the tab's wording). */
export function syncDriveRuns(runs: ReadonlyArray<DriveRun>, now = Date.now()): void {
  const dismissed = dismissedRuns()
  serverRuns = new Set(runs.map((r) => r.id))
  const all = read()
  let changed = false
  for (const run of runs) {
    if (!run.posting_id || dismissed.has(run.id)) continue
    const drive: DriveInfo = { runId: run.id, status: run.status, reason: run.reason, note: (run.last_note || "").slice(0, 300), steps: run.steps, tabGone: tabGone(run, now), message: (run.message || "").slice(0, 500) }
    const status: ApplyActivityStatus = run.status === "running" ? (drive.tabGone ? "needs_input" : "filling")
      : run.status === "review" ? "ready"
      : run.status === "submitted" ? "submitted"
      : run.status === "failed" ? "failed"
      : "needs_input"
    const message = [driveWhy(drive), run.status === "running" ? "" : run.message || ""].filter(Boolean).join(" ").slice(0, 500)
    const prev = all[run.posting_id]
    const same = prev?.drive && prev.drive.runId === drive.runId && prev.drive.status === drive.status && prev.drive.reason === drive.reason && prev.drive.note === drive.note && prev.drive.tabGone === drive.tabGone && prev.drive.steps === drive.steps && prev.drive.message === drive.message
    all[run.posting_id] = {
      postingId: run.posting_id,
      url: prev?.url ?? run.url,
      status,
      message,
      at: same && prev ? prev.at : now,
      pinnedAt: prev?.pinnedAt ?? now,
      drive,
      driveAt: now,
    }
    if (!same) changed = true
  }
  // Fresh-stamped either way (driveAt); listeners only hear about real changes.
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage unavailable */ }
  if (changed) for (const l of listeners) l()
}

/** Drop a posting's live chip (Cancel, or a finished run the person dismissed). */
export function clearApplyActivity(postingId: string): void {
  if (!postingId) return
  const all = read()
  if (!all[postingId]) return
  delete all[postingId]
  write(all)
}

/** Person should see the Chrome tab (Stuck / Captcha / Account / Your answers / Review). */
export function applyNeedsReveal(status: ApplyActivityStatus, message: string): boolean {
  const s = normalizeApplyStatus(status, message)
  if (s === "ready") return true
  if (s !== "needs_input") return false
  const m = message || ""
  return CAPTCHA_MSG.test(m) || ACCOUNT_MSG.test(m) || STUCK_MSG.test(m) || ANSWERS_MSG.test(m)
}

const CLOSED_HANDLED_KEY = "odds:closed-apply-handled-v1"
export function closedApplyHandled(postingId: string): boolean {
  try { return (JSON.parse(localStorage.getItem(CLOSED_HANDLED_KEY) || "[]") as string[]).includes(postingId) } catch { return false }
}
export function markClosedApplyHandled(postingId: string): void {
  try {
    const ids = new Set(JSON.parse(localStorage.getItem(CLOSED_HANDLED_KEY) || "[]") as string[])
    ids.add(postingId)
    localStorage.setItem(CLOSED_HANDLED_KEY, JSON.stringify([...ids].slice(-1000)))
  } catch { /* unavailable storage */ }
}

/** Record or replace Apply progress for a job (clears the previous stale state). */
export function recordApplyActivity(input: {
  postingId: string
  url?: string
  status: ApplyActivityStatus
  message?: string
}): void {
  if (!input.postingId) return
  const message = (input.message || "").slice(0, 500)
  if (CLOSED_MSG.test(message) && closedApplyHandled(input.postingId)) return
  const status = normalizeApplyStatus(input.status, message)
  const all = read()
  // Drop finished/old rows so the tracker stays about what's live.
  const now = Date.now()
  for (const [id, a] of Object.entries(all)) {
    if (id === input.postingId) continue
    if (!isLiveApply(a) && now - a.at > ACTIVE_MS) delete all[id]
  }
  const prev = all[input.postingId]
  // A Broods run the server reports is the truth: the tab's last line (or an old poll) never overrides it.
  if (driveFresh(prev, now)) return
  // Skip no-op writes so the row doesn't flicker while still "Applying…".
  if (prev && prev.status === status && prev.message === message && (!input.url || prev.url === input.url)) {
    // The same line again is not progress: `at` stays when it last changed, so a dead tab's line ages out.
    return
  }
  // Closed jobs: keep a Closed chip briefly, but never stay "live" pinned.
  all[input.postingId] = {
    postingId: input.postingId,
    url: input.url ?? prev?.url,
    status,
    message,
    at: now,
    pinnedAt: prev?.pinnedAt ?? now,
  }
  write(all)
}

/** Batch sync from the extension (all live applies), so tracker chips update with detail closed. */
export function syncApplyActivities(runs: ReadonlyArray<{
  postingId?: string
  posting_id?: string
  status?: string
  message?: string
  url?: string
  runId?: string | null
}>): void {
  syncBatch = read()
  syncBatchChanged = false
  try {
  for (const r of runs) {
    const postingId = (typeof r.postingId === "string" && r.postingId) || (typeof r.posting_id === "string" && r.posting_id) || ""
    if (!postingId) continue
    // The tab's line for a Broods run the server no longer has (ended long ago, or the person moved the job): a leftover, drop it.
    const runId = typeof r.runId === "string" && r.runId ? r.runId : ""
    if (runId && (dismissedRuns().has(runId) || (serverRuns && !serverRuns.has(runId)))) {
      const kept = syncBatch?.[postingId]
      if (kept && !kept.drive && syncBatch) { delete syncBatch[postingId]; syncBatchChanged = true }
      continue
    }
    const status = r.status
    if (!status || !["filling", "needs_input", "ready", "failed", "submitted", "queued"].includes(status)) continue
    recordApplyActivity({
      postingId,
      url: typeof r.url === "string" ? r.url : undefined,
      status: (status === "queued" ? "filling" : status) as ApplyActivityStatus,
      message: typeof r.message === "string" ? r.message : "",
    })
  }
  } finally {
    const all = syncBatch
    const changed = syncBatchChanged
    syncBatch = null
    syncBatchChanged = false
    if (changed && all) write(all)
  }
}

/** Active Applies first, then open Saved, then closed jobs at the bottom of the table. */
export function pinLiveApplies<T extends { id: string; closed_at?: string | null }>(posts: ReadonlyArray<T>): T[] {
  const activities = read()
  const live: T[] = []
  const open: T[] = []
  const closed: T[] = []
  for (const p of posts) {
    // Closed never pins as live Apply (stale Filling chip after LinkedIn closed the listing).
    if (p.closed_at) {
      closed.push(p)
      continue
    }
    if (isLiveApply(activities[p.id])) live.push(p)
    else open.push(p)
  }
  // Stable: pinnedAt (first live), then id — never re-order on every status poll.
  live.sort((a, b) => {
    const pa = activities[a.id]
    const pb = activities[b.id]
    const d = (pb?.pinnedAt ?? 0) - (pa?.pinnedAt ?? 0)
    return d !== 0 ? d : a.id.localeCompare(b.id)
  })
  return [...live, ...open, ...closed]
}

/** React: bump when Apply activity changes so the tracker re-sorts / badges update. */
export function useApplyActivityTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => onApplyActivity(() => setTick((n) => n + 1)), [])
  return tick
}

/**
 * Map live activity → the same ApplyProgress phase the drawer uses.
 * Row chip + drawer card + primary button all derive from this.
 */
export function applyActivityPhase(a: ApplyActivity | null | undefined): "filling" | "needs_input" | "ready" | "failed" | null {
  if (!a) return null
  if (driveFresh(a)) return a.drive.status === "submitted" ? null : a.drive.status === "failed" ? "failed" : a.drive.status === "review" ? "ready" : a.drive.status === "running" && !a.drive.tabGone ? "filling" : "needs_input"
  if (a.status === "submitted") return null
  if (a.status === "failed") return "failed"
  const n = normalizeApplyStatus(a.status, a.message || "")
  if (n === "ready") return "ready"
  if (n === "needs_input") return "needs_input"
  if (n === "filling") return "filling"
  return null
}
