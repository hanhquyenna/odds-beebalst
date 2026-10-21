/**
 * The interview chance kept per job for the signed-in person (table job_chances, job-chance.ts), so the job list, the job page, the
 * extension's panel and badge, and Claude all show one figure. Loaded once per person; a new figure is shown at once and written a moment
 * later, several jobs in one request.
 */
import { useSyncExternalStore } from "react"
import type { PinnedChance } from "@/lib/job-chance"
import { supabase } from "@/lib/supabase"

interface Pins {
  userId: string | null
  /** False until the kept figures are in: nothing is written before, or a fresh figure could replace one kept elsewhere. */
  loaded: boolean
  byJob: ReadonlyMap<string, PinnedChance>
}

let pins: Pins = { userId: null, loaded: false, byJob: new Map() }
const listeners = new Set<() => void>()
const set = (next: Pins): void => {
  pins = next
  for (const l of listeners) l()
}

let loadToken = 0
export async function loadPins(userId: string | null): Promise<void> {
  const mine = ++loadToken
  if (pins.userId !== userId) set({ userId, loaded: false, byJob: new Map() })
  if (!userId) return
  const r = await supabase.from("job_chances").select("posting_id,mid,low,high,inputs")
  if (mine !== loadToken || r.error) return
  const byJob = new Map<string, PinnedChance>()
  for (const row of r.data as Array<{ posting_id: string } & PinnedChance>) byJob.set(row.posting_id, { mid: row.mid, low: row.low, high: row.high, inputs: row.inputs })
  // A figure kept while these were loading (none should be, see `loaded`) stays.
  set({ userId, loaded: true, byJob: new Map([...byJob, ...pins.byJob]) })
}

const queue = new Map<string, PinnedChance>()
let timer: ReturnType<typeof setTimeout> | null = null
function flush(): void {
  timer = null
  const userId = pins.userId
  if (!userId || queue.size === 0) return
  const rows = [...queue].map(([posting_id, p]) => ({ user_id: userId, posting_id, ...p, updated_at: new Date().toISOString() }))
  queue.clear()
  void supabase.from("job_chances").upsert(rows, { onConflict: "user_id,posting_id" }).then(() => undefined)
}

/** Keep this figure for this job (shown at once, written within a couple of seconds). Ignored until the kept figures are loaded. */
export function pinChance(postingId: string, pin: PinnedChance): void {
  if (!pins.loaded || !pins.userId) return
  const was = pins.byJob.get(postingId)
  if (was && was.inputs === pin.inputs && was.mid === pin.mid) return
  set({ ...pins, byJob: new Map(pins.byJob).set(postingId, pin) })
  queue.set(postingId, pin)
  timer ??= setTimeout(flush, 1500)
}

export function usePins(): Pins {
  return useSyncExternalStore((l) => {
    listeners.add(l)

    return () => listeners.delete(l)
  }, () => pins)
}
