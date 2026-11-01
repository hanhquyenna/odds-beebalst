import { supabase } from "@/lib/supabase"
export interface ApplicationRun {
  id: string
  posting_id: string
  status: "queued" | "filling" | "needs_input" | "ready" | "submitted" | "failed" | "cancelled"
  message: string
  expires_at?: string
  url?: string
  created_at?: string
  updated_at?: string
}
export const activeApplication = (run: ApplicationRun): boolean => ["queued", "filling", "needs_input", "ready"].includes(run.status)
export async function applicationState(postingId: string): Promise<{ run: ApplicationRun | null; online: boolean }> {
  const [runs, devices] = await Promise.all([
    supabase.from("application_runs").select("id,posting_id,status,message,expires_at").eq("posting_id", postingId).order("created_at", { ascending: false }).limit(1),
    supabase.from("application_desktops").select("device_id").gt("last_seen_at", new Date(Date.now() - 90000).toISOString()).limit(1),
  ])
  if (runs.error || devices.error) throw new Error("Application preparation is temporarily unavailable.")
  let run = (runs.data?.[0] as ApplicationRun | undefined) ?? null
  if (run && activeApplication(run) && run.expires_at && Date.parse(run.expires_at) < Date.now()) run = { ...run, status: "failed", message: "Preparation expired. Start again when your desktop is ready." }
  return { run, online: Boolean(devices.data?.length) }
}

/** Active server-side Apply runs for tracker chips when the job detail is closed. */
export async function liveApplicationRuns(): Promise<ApplicationRun[]> {
  const { data, error } = await supabase
    .from("application_runs")
    .select("id,posting_id,status,message,expires_at,url,created_at,updated_at")
    .in("status", ["queued", "filling", "needs_input", "ready"])
    .order("created_at", { ascending: false })
    .limit(40)
  if (error) return []
  const now = Date.now()
  const seen = new Set<string>()
  const out: ApplicationRun[] = []
  for (const row of (data || []) as ApplicationRun[]) {
    if (!row.posting_id || seen.has(row.posting_id)) continue
    if (row.expires_at && Date.parse(row.expires_at) < now) continue
    seen.add(row.posting_id)
    out.push(row)
  }
  return out
}
export async function requestApplication(postingId: string): Promise<ApplicationRun> {
  const { data, error } = await supabase.rpc("request_application", { p_posting_id: postingId })
  if (error) throw new Error(error.message)
  return data as ApplicationRun
}
export async function cancelApplication(id: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_application", { p_id: id })
  if (error) throw new Error(error.message)
}

export async function continueApplication(postingId: string): Promise<ApplicationRun> {
  const { data, error } = await supabase.rpc("continue_application", { p_posting_id: postingId })
  if (error) throw new Error("Could not resume. Open Chrome and try again.")
  return data as ApplicationRun
}
