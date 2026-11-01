const STORAGE_KEY = "careersim.seenJobs"

/**
 * The jobs this browser has already been shown, so the bell can say how many
 * have turned up since.
 *
 * It keeps ids rather than a timestamp on purpose. postings carry an age in
 * days and no clock, so a job posted the same day someone signed up cannot be
 * ordered against them. Ids do not have that problem: a job is new exactly
 * until it has been seen once.
 *
 * This is a per-browser convenience. It never reaches the database, and losing
 * it only means one over-full bell. Storage throws in private browsing and
 * when site data is blocked, so every path swallows.
 */
export function loadSeenRooms(): ReadonlySet<string> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }

    const ids: unknown = JSON.parse(raw)

    return Array.isArray(ids) ? new Set(ids.filter((id) => typeof id === "string")) : null
  } catch {
    return null
  }
}

export function saveSeenRooms(ids: ReadonlyArray<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    return
  }
}

export function clearSeenRooms(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}
