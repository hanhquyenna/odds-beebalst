import { useEffect, useSyncExternalStore } from "react"
import type { ApplicationRun } from "@/lib/application-runs"
import type { DesktopApplicationRun, MonitoredRun } from "@/lib/application-progress"
import type { DriveRun } from "@/lib/drive-run-state"
import { supabase } from "@/lib/supabase"

const PAGE_SIZE = 50
const DRIVE_COLUMNS =
  "id,posting_id,url,status,reason,message,last_note,steps,last_seen_at,person_active_at,updated_at,created_at"
const DESKTOP_COLUMNS = "id,posting_id,url,status,message,expires_at,updated_at,created_at"
const EMPTY: MonitorSnapshot = {
  userId: null,
  attempts: [],
  loaded: false,
  loading: false,
  hasMore: false,
  error: "",
}
const listeners = new Set<() => void>()
let snapshot: MonitorSnapshot = EMPTY
let attempts = new Map<string, MonitoredRun>()
let generation = 0
let pending: Promise<void> | null = null
let driveOffset = 0
let desktopOffset = 0
let moreDrives = true
let moreDesktop = true

export interface MonitorSnapshot {
  userId: string | null
  attempts: ReadonlyArray<MonitoredRun>
  loaded: boolean
  loading: boolean
  hasMore: boolean
  error: string
}

export interface ApplicationHistoryPage {
  attempts: MonitoredRun[]
  hasMore: boolean
}

/** Clears account-scoped activity, including in-flight reads, when the signed-in identity changes. */
export function setApplicationMonitorUser(userId: string | null): void {
  if (snapshot.userId === userId) return
  generation += 1
  attempts = new Map()
  pending = null
  driveOffset = 0
  desktopOffset = 0
  moreDrives = true
  moreDesktop = true
  snapshot = { ...EMPTY, userId: userId }
  publish()
}

/** Reuses the app's existing live reads; rendering a monitor never starts an agent or another polling loop. */
export function syncApplicationMonitor(
  userId: string,
  drives: ReadonlyArray<DriveRun> = [],
  desktop: ReadonlyArray<ApplicationRun> = [],
): void {
  if (snapshot.userId !== userId) return
  const incoming: MonitoredRun[] = drives.map((run) => ({ source: "drive", run: run }))
  for (const run of desktop) {
    if (run.url && run.created_at && run.updated_at)
      incoming.push({
        source: "desktop",
        run: { ...run, url: run.url, created_at: run.created_at, updated_at: run.updated_at },
      })
  }
  mergeAttempts(incoming)
}

/** Reads a bounded page from each existing run table, with older attempts available explicitly. */
export function loadApplicationMonitor(userId: string, refresh = false): Promise<void> {
  if (snapshot.userId !== userId) setApplicationMonitorUser(userId)
  if (pending) return pending
  if (refresh) {
    driveOffset = 0
    desktopOffset = 0
    moreDrives = true
    moreDesktop = true
  }
  if (snapshot.loaded && !refresh && !moreDrives && !moreDesktop) return Promise.resolve()
  const version = generation
  snapshot = { ...snapshot, loading: true, error: "" }
  publish()
  pending = (async (): Promise<void> => {
    try {
      const [drives, desktop] = await Promise.all([
        moreDrives ? drivePage(userId, driveOffset) : Promise.resolve([]),
        moreDesktop ? desktopPage(userId, desktopOffset) : Promise.resolve([]),
      ])
      if (version !== generation) return
      driveOffset += drives.length
      desktopOffset += desktop.length
      moreDrives = drives.length === PAGE_SIZE
      moreDesktop = desktop.length === PAGE_SIZE
      mergeAttempts([
        ...drives.map((run): MonitoredRun => ({ source: "drive", run: run })),
        ...desktop.map((run): MonitoredRun => ({ source: "desktop", run: run })),
      ])
      snapshot = { ...snapshot, loaded: true, loading: false, hasMore: moreDrives || moreDesktop }
    } catch (error: unknown) {
      if (version !== generation) return
      snapshot = {
        ...snapshot,
        loading: false,
        error: error instanceof Error ? error.message : "Could not load application activity.",
      }
    } finally {
      if (version === generation) {
        pending = null
        publish()
      }
    }
  })()

  return pending
}

/** Loads one job's attempts on demand, independently of the temporary live-status overlay. */
export async function applicationHistoryPage(
  userId: string,
  postingId: string | null,
  page = 0,
  url?: string,
): Promise<ApplicationHistoryPage> {
  if (!postingId && !url) throw new Error("This application has no job or address to look up.")
  const offset = page * PAGE_SIZE
  const [drives, desktop] = await Promise.all([
    drivePage(userId, offset, postingId || undefined, url),
    desktopPage(userId, offset, postingId || undefined, url),
  ])
  const rows: MonitoredRun[] = [
    ...drives.map((run): MonitoredRun => ({ source: "drive", run: run })),
    ...desktop.map((run): MonitoredRun => ({ source: "desktop", run: run })),
  ]

  return {
    attempts: rows.sort((a, b) => b.run.created_at.localeCompare(a.run.created_at)),
    hasMore: drives.length === PAGE_SIZE || desktop.length === PAGE_SIZE,
  }
}

/** Updates an acknowledged control result until the existing live feed reports the next state. */
export function acknowledgeApplicationControl(
  userId: string,
  attempt: MonitoredRun,
  action: "stop" | "continue",
): void {
  if (snapshot.userId !== userId) return
  const now = new Date().toISOString()
  if (attempt.source === "drive") {
    mergeAttempts([
      {
        source: "drive",
        run: {
          ...attempt.run,
          status: action === "stop" ? "stopped" : "running",
          reason: null,
          message: action === "stop" ? "You stopped assistance." : null,
          last_note:
            action === "continue" ? "Continuing in the same application." : attempt.run.last_note,
          updated_at: now,
        },
      },
    ])
  } else if (attempt.source === "desktop" && action === "stop") {
    mergeAttempts([
      {
        source: "desktop",
        run: {
          ...attempt.run,
          status: "cancelled",
          message: "You cancelled preparation.",
          updated_at: now,
        },
      },
    ])
  }
}

/** Subscribes all Tracker surfaces to the same account-scoped snapshot. */
export function useApplicationMonitor(userId: string | null, enabled = false): MonitorSnapshot {
  const value = useSyncExternalStore(
    subscribe,
    applicationMonitorSnapshot,
    applicationMonitorSnapshot,
  )
  useEffect(() => {
    if (!enabled || !userId) return
    const load = (): void => {
      if (!document.hidden && (!snapshot.loaded || snapshot.userId !== userId))
        void loadApplicationMonitor(userId)
    }
    load()
    document.addEventListener("visibilitychange", load)

    return () => document.removeEventListener("visibilitychange", load)
  }, [enabled, userId])

  return value.userId === userId ? value : EMPTY
}

/** Reads the owner's desktop queue metadata, including stopped and completed requests. */
async function desktopPage(
  userId: string,
  offset: number,
  postingId?: string,
  url?: string,
): Promise<DesktopApplicationRun[]> {
  let query = supabase
    .from("application_runs")
    .select(DESKTOP_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)
  if (postingId) query = query.eq("posting_id", postingId)
  else if (url) query = query.eq("url", url)
  const { data, error } = await query
  if (error) throw new Error("Could not load desktop applications. Try again.")

  return (data ?? []) as DesktopApplicationRun[]
}

/** Reads one owner's run metadata using the existing permissions and indexes. */
async function drivePage(
  userId: string,
  offset: number,
  postingId?: string,
  url?: string,
): Promise<DriveRun[]> {
  let query = supabase
    .from("drive_runs")
    .select(DRIVE_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)
  if (postingId) query = query.eq("posting_id", postingId)
  else if (url) query = query.eq("url", url)
  const { data, error } = await query
  if (error) throw new Error("Could not load application activity. Try again.")

  return (data ?? []) as DriveRun[]
}

/** Returns a stable snapshot for React's external-store subscription. */
export function applicationMonitorSnapshot(): MonitorSnapshot {
  return snapshot
}

/** Keeps historical attempts and rejects older copies of a run delivered by a slower read. */
function mergeAttempts(incoming: ReadonlyArray<MonitoredRun>): void {
  let changed = false
  for (const attempt of incoming) {
    const key = `${attempt.source}:${attempt.run.id}`
    const previous = attempts.get(key)
    if (previous && previous.run.updated_at > attempt.run.updated_at) continue
    if (previous && JSON.stringify(previous) === JSON.stringify(attempt)) continue
    attempts.set(key, attempt)
    changed = true
  }
  if (!changed) return
  snapshot = { ...snapshot, attempts: [...attempts.values()] }
  publish()
}

/** Notifies subscribers after a meaningful data or loading-state change. */
function publish(): void {
  for (const listener of listeners) listener()
}

/** Registers a monitor subscriber without creating network work. */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
