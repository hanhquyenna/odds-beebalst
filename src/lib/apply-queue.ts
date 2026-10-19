// The apply queue as the app sees it: the rows in the database (one per picked job), kept fresh while someone looks at them. The extension
// works the queue; this only adds, removes and reads. Nothing here can submit an application.
import { useEffect, useSyncExternalStore } from "react"
import { supabase } from "@/lib/supabase"
import type { QueueItem } from "@/lib/apply-queue-words"

const COLUMNS = "posting_id,state,reason,message,added_at,started_at,updated_at"
/** Rows are re-read this often while a page that shows them is open; faster while Odds is working on something. */
const QUIET_MS = 20_000
const BUSY_MS = 5_000

let items: QueueItem[] = []
let loaded = false
const listeners = new Set<() => void>()
const emit = (): void => { for (const l of listeners) l() }

export async function refreshQueue(): Promise<void> {
  const { data, error } = await supabase.from("apply_queue").select(COLUMNS).order("added_at", { ascending: true }).limit(200)
  if (error || !data) return
  items = data as QueueItem[]
  loaded = true
  emit()
}

/** Add jobs to the queue. Returns how many were added (a job already in play stays as it is). */
export async function addToQueue(ids: readonly string[]): Promise<number> {
  const { data, error } = await supabase.rpc("queue_jobs", { p_ids: [...ids] })
  if (error) throw new Error("Could not add to the queue. Try again.")
  await refreshQueue()

  return typeof data === "number" ? data : 0
}

async function call(name: "queue_leave" | "queue_sent" | "queue_retry", id: string): Promise<void> {
  const { error } = await supabase.rpc(name, { p_id: id })
  if (error) throw new Error("That did not go through. Try again.")
  await refreshQueue()
}
export const leaveQueue = (id: string): Promise<void> => call("queue_leave", id)
export const markQueueSent = (id: string): Promise<void> => call("queue_sent", id)
export const retryQueue = (id: string): Promise<void> => call("queue_retry", id)

export interface QueueView {
  items: readonly QueueItem[]
  loaded: boolean
  byId: ReadonlyMap<string, QueueItem>
}
let view: QueueView = { items, loaded, byId: new Map() }
function snapshot(): QueueView {
  if (view.items !== items || view.loaded !== loaded) view = { items, loaded, byId: new Map(items.map((i) => [i.posting_id, i])) }

  return view
}

/** The queue, refreshed while the page is open. `signedIn` false reads nothing. */
export function useApplyQueue(signedIn: boolean): QueueView {
  const current = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, snapshot, snapshot)
  const busy = current.items.some((i) => i.state === "working" || i.state === "waiting")
  useEffect(() => {
    if (!signedIn) return
    void refreshQueue()
    const timer = window.setInterval(() => { if (!document.hidden) void refreshQueue() }, busy ? BUSY_MS : QUIET_MS)

    return () => window.clearInterval(timer)
  }, [signedIn, busy])

  return current
}
