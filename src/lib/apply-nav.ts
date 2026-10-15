/** After Apply with Odds: open Tracker with that job’s drawer so Applying… / Captcha / Account chips are visible. */
const OPEN_KEY = "odds:open-live-apply"
export const LIVE_APPLY_EVENT = "odds:live-apply"

export function showLiveApplyInTracker(postingId: string): void {
  if (!postingId) return
  try {
    sessionStorage.setItem(OPEN_KEY, postingId)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(LIVE_APPLY_EVENT, { detail: { postingId } }))
}

/** Peek without clearing — postings may not be loaded yet when Tracker mounts. */
export function peekLiveApplyPostingId(): string | null {
  try {
    return sessionStorage.getItem(OPEN_KEY)
  } catch {
    return null
  }
}

/** Clear only after the job drawer actually opened. */
export function takeLiveApplyPostingId(): string | null {
  try {
    const id = sessionStorage.getItem(OPEN_KEY)
    if (id) sessionStorage.removeItem(OPEN_KEY)
    return id
  } catch {
    return null
  }
}
