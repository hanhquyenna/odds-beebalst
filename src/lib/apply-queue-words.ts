// The apply queue in plain words: what each row says, which group it sits in, and what the person can do. Pure, so it is testable.

export type QueueState = "waiting" | "working" | "review" | "needs_you" | "failed" | "sent" | "skipped"
export type QueueReason = "captcha" | "account" | "questions" | "letter" | "closed" | "email" | "tab" | "other"

export interface QueueItem {
  posting_id: string
  state: QueueState
  reason: QueueReason | null
  message: string | null
  tries?: number
  added_at: string
  started_at: string | null
  updated_at: string
}

/** The groups, in the order they are shown: what needs the person first, then what is ready, then what Odds is doing, then what is done. */
export type QueueGroup = "needs" | "ready" | "working" | "done"
export const GROUP_ORDER: readonly QueueGroup[] = ["needs", "ready", "working", "done"]
export const GROUP_TITLE: Record<QueueGroup, string> = {
  needs: "Needs you",
  ready: "Ready to send",
  working: "Odds is on it",
  done: "Done",
}

export function groupOf(item: Pick<QueueItem, "state" | "reason">): QueueGroup {
  switch (item.state) {
    case "needs_you": return "needs"
    case "review": return "ready"
    // A closed job has nothing left to do; any other failure the person can try again.
    case "failed": return item.reason === "closed" ? "done" : "needs"
    case "sent":
    case "skipped": return "done"
    default: return "working"
  }
}

/** One reason per stop, the same ones the side panel shows. */
const NEEDS: Record<QueueReason, { label: string; why: string }> = {
  captcha: { label: "A check is in the way", why: "Tick the check in its tab. Odds carries on by itself after." },
  account: { label: "Sign in", why: "The site wants you to sign in or make an account. Odds never types passwords, so do that step in the tab." },
  questions: { label: "A question for you", why: "The form asks something Odds does not know about you. Answer it in the tab." },
  letter: { label: "Cover letter", why: "This one asks for a cover letter. Add one in Documents, then try again." },
  closed: { label: "Closed", why: "This job no longer takes applications. Nothing was sent." },
  email: { label: "Apply by email", why: "This employer takes applications by email. Send your CV to the address on the job page." },
  tab: { label: "Tab closed", why: "The tab was closed before Odds finished. Try again, or skip this job." },
  other: { label: "Needs you", why: "Odds stopped on a step only you can do. Go to the tab to see which." },
}

export interface QueueWords {
  group: QueueGroup
  /** The short status. */
  label: string
  /** One sentence: what happened, or what to do. Never jargon. */
  why: string
}

/** "1st", "2nd", "3rd", "4th"… */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** Words for one row. `place` is where a waiting job is in line (1 = next). */
export function queueWords(item: Pick<QueueItem, "state" | "reason" | "message">, place = 0): QueueWords {
  const group = groupOf(item)
  switch (item.state) {
    case "waiting":
      return { group, label: "Up next", why: place > 0 ? `${ordinal(place)} in line. Odds starts it when a place frees up, while Chrome is open.` : "Odds starts it when a place frees up, while Chrome is open." }
    case "working":
      return { group, label: "Filling in", why: item.message && /again/i.test(item.message) ? item.message : "Odds is filling it in a background tab. Nothing is sent." }
    case "review":
      return { group, label: "Ready to send", why: "Everything is filled in. Check it, then press Submit yourself." }
    case "sent":
      return { group, label: "Sent", why: "Marked as applied." }
    case "skipped":
      return { group, label: "Skipped", why: "You took this one out. Try again any time." }
    case "failed": {
      if (item.reason === "closed") return { group, label: "Closed", why: NEEDS.closed.why }
      return { group, label: "Couldn't apply", why: item.message || "Odds could not finish this form. Try again, or open the tab to do it yourself." }
    }
    case "needs_you": {
      const need = NEEDS[item.reason ?? "other"] ?? NEEDS.other
      // The site's own sentence is kept when the reason is only "other": it says more than we can.
      return { group, label: need.label, why: item.reason && item.reason !== "other" ? need.why : (item.message || need.why) }
    }
  }
}

/** Rows in each group: needs and ready newest first, waiting in line order (oldest first), done newest first. */
export function groupQueue<T extends Pick<QueueItem, "state" | "reason" | "updated_at" | "added_at">>(items: readonly T[]): Array<{ group: QueueGroup; title: string; items: T[] }> {
  return GROUP_ORDER.map((group) => ({
    group,
    title: GROUP_TITLE[group],
    items: items.filter((i) => groupOf(i) === group).sort((a, b) =>
      group === "working"
        ? (a.state === b.state ? a.added_at.localeCompare(b.added_at) : a.state === "working" ? -1 : 1)
        : b.updated_at.localeCompare(a.updated_at)),
  })).filter((g) => g.items.length > 0)
}

/** Where each waiting job is in line: 1 is next. */
export function linePlaces(items: readonly Pick<QueueItem, "posting_id" | "state" | "added_at">[]): Map<string, number> {
  const waiting = items.filter((i) => i.state === "waiting").sort((a, b) => a.added_at.localeCompare(b.added_at))
  return new Map(waiting.map((i, n) => [i.posting_id, n + 1]))
}

/** What the person can do on a row. "Mark as sent" is the person saying they pressed Submit themselves. */
export function queueActions(item: Pick<QueueItem, "state" | "reason">): { goToTab: boolean; markSent: boolean; retry: boolean; skip: boolean; remove: boolean } {
  return {
    // A closed tab has nothing to go to; a stop that waits on the person (a check, a sign-in, a question) is fixed in its tab, not by starting over.
    goToTab: ["working", "review"].includes(item.state) || (item.state === "needs_you" && item.reason !== "tab") || (item.state === "failed" && item.reason !== "closed"),
    markSent: item.state === "review" || item.state === "needs_you",
    retry: item.state === "skipped" || (item.state === "failed" && item.reason !== "closed") || (item.state === "needs_you" && ["tab", "other", "letter", "email"].includes(item.reason ?? "other")),
    skip: ["working", "review", "needs_you", "failed"].includes(item.state),
    remove: item.state === "waiting",
  }
}

/** Counts for the header line. */
export function queueCounts(items: readonly Pick<QueueItem, "state" | "reason">[]): { needs: number; ready: number; working: number; waiting: number; sent: number } {
  const out = { needs: 0, ready: 0, working: 0, waiting: 0, sent: 0 }
  for (const i of items) {
    if (i.state === "waiting") out.waiting++
    else if (i.state === "working") out.working++
    else if (i.state === "sent") out.sent++
    else if (groupOf(i) === "needs") out.needs++
    else if (groupOf(i) === "ready") out.ready++
  }
  return out
}
