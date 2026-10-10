import { supabase } from "@/lib/supabase"

/**
 * The jobs someone saved, kept with their account too (table saved_jobs), so their other devices and Claude (the odds connector)
 * see them. The browser's own list stays the one the app reads; this only copies it up and brings the account's copy down.
 */

/** Saves or removes one job on the account. A failure is let go: the browser still has it and the next sign-in copies it up. */
export function pushSaved(id: string, on: boolean): void {
  if (id.startsWith("local-")) return
  const done = on ? supabase.from("saved_jobs").upsert({ posting_id: id }, { onConflict: "user_id,posting_id", ignoreDuplicates: true }) : supabase.from("saved_jobs").delete().eq("posting_id", id)
  void Promise.resolve(done).catch(() => undefined)
}

/** On sign-in: the account's saved jobs and this browser's, together. Jobs saved here but not yet on the account are copied up. */
export async function mergeSaved(local: ReadonlySet<string>): Promise<Set<string> | null> {
  const { data, error } = await supabase.from("saved_jobs").select("posting_id")
  if (error) return null
  const remote = new Set((data as Array<{ posting_id: string }>).map((r) => r.posting_id))
  const up = [...local].filter((id) => !id.startsWith("local-") && !remote.has(id))
  if (up.length > 0) await supabase.from("saved_jobs").upsert(up.map((posting_id) => ({ posting_id })), { onConflict: "user_id,posting_id", ignoreDuplicates: true })

  return new Set([...local, ...remote])
}
