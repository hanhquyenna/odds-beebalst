// The apply queue in plain words: what each card says, which group it sits in, and what the person can do. Pure, so it is testable.

export type QueueState = "waiting" | "working" | "review" | "needs_you" | "failed" | "sent"
export type QueueReason = "captcha" | "account" | "questions" | "letter" | "closed" | "email" | "other"

export interface QueueItem {
  posting_id: string
  state: QueueState
  reason: QueueReason | null
  message: string | null
  added_at: string
  started_at: string | null
  updated_at: string
}

/** The groups on the inbox, in the order they are shown: what needs the person first, then what is ready, then what Odds is still doing. */
export type QueueGroup = "needs" | "ready" | "working" | "failed" | "sent"
export const GROUP_ORDER: readonly QueueGroup[] = ["needs", "ready", "working", "failed", "sent"]
export const GROUP_TITLE: Record<QueueGroup, string> = {
  needs: "Needs you",
  ready: "Ready to review",
  working: "Odds is working on these",
  failed: "Could not finish",
  sent: "Sent",
}

export function groupOf(item: Pick<QueueItem, "state">): QueueGroup {
  switch (item.state) {
    case "needs_you": return "needs"
    case "review": return "ready"
    case "failed": return "failed"
    case "sent": return "sent"
    default: return "working"
  }
}

/** The same reasons the side panel shows, one per stop. */
const NEEDS: Record<QueueReason, { label: string; why: string }> = {
  captcha: { label: "Security check", why: "The site asks you to prove you are a person. Open the form and complete the check; Odds carries on after." },
  account: { label: "Sign in", why: "The site wants you to sign in or make an account. Odds never types passwords, so open the form and do that step." },
  questions: { label: "Your answers", why: "The form asks something Odds does not know about you. Open the form and answer it." },
  letter: { label: "Cover letter", why: "This application asks for a cover letter. Add one for this job in Documents, then open the form." },
  closed: { label: "Closed", why: "This job is closed: it no longer takes applications." },
  email: { label: "Apply by email", why: "This employer takes applications by email. Send your CV (and letter) to the address on the job page." },
  other: { label: "Needs you", why: "Odds stopped on a step only you can do. Open the form to see which." },
}

export interface QueueWords {
  group: QueueGroup
  /** The short status on the card. */
  label: string
  /** One sentence: what happened, or what to do. Never jargon. */
  why: string
}

export function queueWords(item: Pick<QueueItem, "state" | "reason" | "message">): QueueWords {
  const group = groupOf(item)
  switch (item.state) {
    case "waiting":
      return { group, label: "Waiting", why: "Odds fills these one after another, two at a time, while Chrome is open." }
    case "working":
      return { group, label: "Filling it in", why: "Odds is filling this form in its own window. Nothing is sent." }
    case "review":
      return { group, label: "Ready to review", why: "Everything is filled in. Check it, then press Submit yourself. Odds never sends it." }
    case "sent":
      return { group, label: "Sent", why: "The site showed its own thank-you, so this one is done." }
    case "failed": {
      const closed = item.reason === "closed"
      return { group, label: closed ? "Closed" : "Could not finish", why: closed ? NEEDS.closed.why : (item.message || "Odds could not finish this form. Open it to carry on yourself.") }
    }
    case "needs_you": {
      const need = NEEDS[item.reason ?? "other"] ?? NEEDS.other
      // The site's or Broods' own sentence is kept when the reason is only "other": it says more than we can.
      return { group, label: need.label, why: item.reason && item.reason !== "other" ? need.why : (item.message || need.why) }
    }
  }
}

/** The cards in each group, newest change first. */
export function groupQueue<T extends Pick<QueueItem, "state" | "updated_at">>(items: readonly T[]): Array<{ group: QueueGroup; title: string; items: T[] }> {
  return GROUP_ORDER.map((group) => ({
    group,
    title: GROUP_TITLE[group],
    items: items.filter((i) => groupOf(i) === group).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  })).filter((g) => g.items.length > 0)
}

/** What the person can do on a card. "Mark as sent" is only for a form at Review: it is the person saying they pressed Submit. */
export function queueActions(item: Pick<QueueItem, "state">): { open: boolean; markSent: boolean; retry: boolean; remove: boolean } {
  return {
    open: ["working", "review", "needs_you", "failed"].includes(item.state),
    markSent: item.state === "review",
    retry: item.state === "failed" || item.state === "needs_you",
    remove: true,
  }
}

/** Counts for the header line. */
export function queueCounts(items: readonly Pick<QueueItem, "state">[]): Record<QueueGroup, number> {
  const out: Record<QueueGroup, number> = { needs: 0, ready: 0, working: 0, failed: 0, sent: 0 }
  for (const i of items) out[groupOf(i)]++

  return out
}

/** How far back the report looks: a queue run is the applications Odds touched in the last day. */
export const REPORT_HOURS = 24

/** The report once Odds has nothing left to do: what came out of the run, in counts the person can act on. */
export interface QueueReport {
  /** Applications Odds touched in this run. */
  total: number
  /** Filled and checked: the person sends them. */
  ready: number
  /** Stopped on a step only the person can do (a check, an account, …). */
  needs: number
  sent: number
  /** Closed, or could not be finished. */
  skipped: number
  /** From the first one started to the last change, in whole minutes; null when nothing has started. */
  minutes: number | null
}

/**
 * The report, or null while Odds is still working (the agent bar shows progress then) or when nothing happened in the last day. The
 * person pressed Apply and walked away: this is what they come back to.
 */
export function queueReport(items: readonly Pick<QueueItem, "state" | "added_at" | "started_at" | "updated_at">[], now: number = Date.now()): QueueReport | null {
  if (items.some((i) => i.state === "waiting" || i.state === "working")) return null
  const since = now - REPORT_HOURS * 3_600_000
  const run = items.filter((i) => Date.parse(i.updated_at) >= since)
  if (run.length === 0) return null
  const counts = queueCounts(run)
  const starts = run.map((i) => Date.parse(i.started_at ?? i.added_at)).filter(Number.isFinite)
  const last = Math.max(...run.map((i) => Date.parse(i.updated_at)))
  const minutes = run.some((i) => i.started_at) && starts.length ? Math.max(1, Math.round((last - Math.min(...starts)) / 60_000)) : null

  return { total: run.length, ready: counts.ready, needs: counts.needs, sent: counts.sent, skipped: counts.failed, minutes }
}

/** The report's headline: what the person has to do next, first. */
export function reportHeadline(r: QueueReport): string {
  if (r.ready > 0) return `${r.ready} of ${r.total} ready to send`
  if (r.needs > 0) return `${r.needs} of ${r.total} ${r.needs === 1 ? "needs" : "need"} you`
  if (r.sent === r.total) return r.total === 1 ? "Sent" : `All ${r.total} sent`

  return `Queue done: ${r.total} ${r.total === 1 ? "application" : "applications"}`
}
