import type { ChanceSnapshot } from "@/lib/outcome-snapshot"
import { supabase } from "@/lib/supabase"

/**
 * Keeps the chance snapshot of an application on the account (table chance_snapshots). The first snapshot per job is the one that
 * stays: marking the same job applied again does not change what was predicted. A failure is let go: the application itself is what
 * matters, and the loop only loses one data point.
 */
export function saveChanceSnapshot(snap: ChanceSnapshot): void {
  void Promise.resolve(supabase.from("chance_snapshots").upsert(snap, { onConflict: "user_id,posting_id", ignoreDuplicates: true })).catch(() => undefined)
}
