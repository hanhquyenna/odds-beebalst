import type { Posting } from "@/lib/types"

/**
 * Whether a job is still open, from what our checks found. A job is closed when we have confirmed it ended (closed_at). Otherwise it is open, and
 * last_checked says how long ago we last looked. A job that was never checked is open but unchecked.
 */
export interface OpenStatus {
  open: boolean
  /** When it closed (YYYY-MM-DD), or null. */
  closedOn: string | null
  /** Days since we last checked it, or null if never. */
  checkedDaysAgo: number | null
}

const day = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))

export function openStatusOf(post: Pick<Posting, "closed_at" | "last_checked">, now: Date = new Date()): OpenStatus {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const checked = post.last_checked ? Math.max(0, Math.round((today - day(post.last_checked)) / 86_400_000)) : null

  return { open: !post.closed_at, closedOn: post.closed_at && /^\d{4}-\d{2}-\d{2}/.test(post.closed_at) ? post.closed_at.slice(0, 10) : null, checkedDaysAgo: checked }
}

/** The words for it, short: "Open · checked today", "Open · checked 3 days ago", "Open", "Closed on 2 Oct". */
export function openStatusText(status: OpenStatus): string {
  if (!status.open) {
    const date = status.closedOn ? new Date(`${status.closedOn}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : null

    return date ? `Closed on ${date}` : "Closed"
  }
  if (status.checkedDaysAgo === null) {
    return "Open"
  }

  return `Open · checked ${status.checkedDaysAgo === 0 ? "today" : status.checkedDaysAgo === 1 ? "yesterday" : `${status.checkedDaysAgo} days ago`}`
}
