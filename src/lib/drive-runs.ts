// A Broods run in the person's own Chrome, read from the run itself: the tracker's truth for an Apply with Odds.
// The extension's tab only says what it last showed; the run says what Broods is doing now, why it stopped, and whether the tab is there.
import type { DriveRun } from "@/lib/drive-run-state"
import { supabase } from "@/lib/supabase"

export { TAB_GONE_MS, tabGone, type DriveReason, type DriveRun, type DriveStatus } from "@/lib/drive-run-state"

/** A run ended this long ago no longer shows as live in the tracker. */
const SHOW_MS = 2 * 60 * 60 * 1000

/** The latest Broods run per job, from the last two hours. */
export async function liveDriveRuns(): Promise<DriveRun[]> {
  const { data, error } = await supabase
    .from("drive_runs")
    .select("id,posting_id,url,status,reason,message,last_note,steps,last_seen_at,updated_at,created_at")
    .gt("updated_at", new Date(Date.now() - SHOW_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(40)
  if (error || !data) return []
  const seen = new Set<string>()
  const out: DriveRun[] = []
  for (const run of data as DriveRun[]) {
    if (!run.posting_id || seen.has(run.posting_id)) continue
    seen.add(run.posting_id)
    out.push(run)
  }
  return out
}

export interface DriveStep { id: number; tool: string; note: string; created_at: string }

/** What Broods said it was doing, newest first: the live reasoning feed. */
export async function driveSteps(runId: string, limit = 8): Promise<DriveStep[]> {
  const { data, error } = await supabase
    .from("drive_commands")
    .select("id,tool,note,created_at")
    .eq("run_id", runId)
    .not("note", "is", null)
    .order("id", { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return data as DriveStep[]
}

/** stop: Broods ends at its next step. continue: Broods carries on in the same tab. sent: the person submitted it. */
export async function driveControl(runId: string, action: "stop" | "continue" | "sent"): Promise<boolean> {
  const { data, error } = await supabase.rpc("drive_control", { p_run: runId, p_action: action })
  return !error && data === "ok"
}
