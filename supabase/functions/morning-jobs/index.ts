// Supabase Edge Function: the morning message. Runs from pg_cron; for every phone or browser that said yes to
// notifications (table push_subscriptions) and whose own clock reads its send hour (8 by default), it counts the jobs
// first found yesterday that pass that person's job preferences, with the app's own filters (match.js), and sends one
// message: "5 new jobs fit you". Nothing is sent when nothing new fits.
// Deploy:  scripts/build-morning-jobs.sh && supabase functions deploy morning-jobs --project-ref ukpmpyfcnbhngkgbnkxi --use-api --no-verify-jwt
// Secrets (Edge Function secrets, never in a file): VAPID_KEYS, VAPID_CONTACT, MORNING_SECRET
import * as webpush from "jsr:@negrel/webpush@0.5.0"
// @ts-ignore: bundled from src/lib/filters.ts by scripts/build-morning-jobs.sh
import { DEFAULT_FILTERS, activeCount, applyFilters, normalizeFilters } from "./match.js"

interface Sub {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  send_hour: number
  time_zone: string
  last_sent_at: string | null
}

interface Job {
  id: string
  title: string
  employer_display: string | null
  employer: string
}

const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

/** The hour on the person's own clock. */
function hourIn(timeZone: string, now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now))
  } catch {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "numeric", hourCycle: "h23" }).format(now))
  }
}

function message(jobs: ReadonlyArray<Job>, day: string): { title: string; body: string; url: string; tag: string; count: number } {
  const first = jobs[0]
  const where = first.employer_display ?? first.employer
  const n = jobs.length

  return {
    title: n === 1 ? "1 new job fits you" : `${n} new jobs fit you`,
    body: n === 1 ? `${first.title} at ${where}` : `${first.title} at ${where} and ${n - 1} more`,
    url: "/?open=new-jobs",
    tag: `odds-morning-${day}`,
    count: n,
  }
}

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }

/**
 * Right after someone turns notifications on: one message to their own devices, so they see at once that it works.
 * Called by the app with the person's sign-in; it can only ever reach that person's own devices.
 */
async function welcome(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  const who = jwt ? await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } }) : null
  if (!who || !who.ok) return json(401, { error: "Sign in first." })
  const userId = (await who.json()).id as string
  const rest = { apikey: service, Authorization: `Bearer ${service}` }
  const subs = (await (await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${userId}&order=created_at.desc&limit=1`, { headers: rest })).json()) as Sub[]
  if (subs.length === 0) return json(404, { error: "No device to send to." })

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get("VAPID_KEYS")!), { extractable: false })
  const server = await webpush.ApplicationServer.new({ contactInformation: Deno.env.get("VAPID_CONTACT") ?? "mailto:hello@odds.nl", vapidKeys })
  const sub = subs[0]
  try {
    await server
      .subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })
      .pushTextMessage(JSON.stringify({ title: "You’re set", body: "odds sends you the new jobs that fit you at 8 every morning.", url: "/", tag: "odds-welcome" }), { ttl: 3600, urgency: webpush.Urgency.High })
    return json(200, { sent: true })
  } catch (e) {
    return json(502, { error: String(e).slice(0, 200) })
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (new URL(req.url).searchParams.get("welcome") === "1") return welcome(req)
  if (req.method !== "POST") return reply(405, { error: "Use POST." })
  const secret = Deno.env.get("MORNING_SECRET")
  if (!secret || req.headers.get("x-check-secret") !== secret) return reply(401, { error: "Not allowed." })

  const url = new URL(req.url)
  // ?dry=1 says what would be sent without sending; ?now=1 ignores the send hour (for testing).
  const dry = url.searchParams.get("dry") === "1"
  const ignoreHour = url.searchParams.get("now") === "1"
  const onlyUser = url.searchParams.get("user")

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const rest = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }
  const get = async <T>(path: string): Promise<T> => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: rest })
    if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${await r.text()}`)
    return (await r.json()) as T
  }
  const patch = (id: string, body: Record<string, unknown>) => fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${id}`, { method: "PATCH", headers: rest, body: JSON.stringify(body) })

  const now = new Date()
  const all = await get<Sub[]>(`push_subscriptions?select=id,user_id,endpoint,p256dh,auth,send_hour,time_zone,last_sent_at${onlyUser ? `&user_id=eq.${onlyUser}` : ""}`)
  // Due: the person's clock reads their hour, and nothing went out in the last 20 hours (cron runs twice around 8 for summer and winter time).
  const due = all.filter((s) => (ignoreHour || hourIn(s.time_zone, now) === s.send_hour) && (ignoreHour || !s.last_sent_at || now.getTime() - Date.parse(s.last_sent_at) > 20 * 3600 * 1000))
  if (due.length === 0) return reply(200, { subscriptions: all.length, due: 0, sent: 0 })

  // Yesterday's new jobs, once for everyone. Each job is in exactly one morning: the one after the day it was found.
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10)
  const fresh = await get<Array<{ id: string }>>(`postings?select=id&first_seen=eq.${yesterday}&closed_at=is.null`)
  const jobs: Job[] = []
  for (let i = 0; i < fresh.length; i += 200) {
    const ids = fresh.slice(i, i + 200).map((p) => `"${p.id}"`).join(",")
    jobs.push(...(await get<Job[]>(`app_jobs?select=*&id=in.(${ids})&order=id.asc`)))
  }

  const users = [...new Set(due.map((s) => s.user_id))]
  const profiles = await get<Array<{ user_id: string; data: Record<string, unknown> }>>(`profiles?select=user_id,data&user_id=in.(${users.join(",")})`)
  const profileOf = new Map(profiles.map((p) => [p.user_id, p.data]))

  const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get("VAPID_KEYS")!), { extractable: false })
  const server = await webpush.ApplicationServer.new({ contactInformation: Deno.env.get("VAPID_CONTACT") ?? "mailto:hello@odds.nl", vapidKeys })

  const report: Array<{ user: string; jobs: number; status: string }> = []
  for (const sub of due) {
    // The same rule as the bell: the person's saved preferences when they are on, otherwise the list's opening filters.
    const profile = profileOf.get(sub.user_id) ?? {}
    const prefs = profile.prefs ? normalizeFilters(profile.prefs) : null
    const filters = profile.prefsOn && prefs && activeCount(prefs) > 0 ? prefs : DEFAULT_FILTERS
    const dismissed = new Set((profile.dismissed as string[] | undefined) ?? [])
    const fits = (applyFilters(jobs, filters) as Job[]).filter((j) => !dismissed.has(j.id))

    if (fits.length === 0) {
      report.push({ user: sub.user_id, jobs: 0, status: "nothing new" })
      if (!dry) await patch(sub.id, { last_sent_at: now.toISOString(), last_error: null })
      continue
    }
    if (dry) {
      report.push({ user: sub.user_id, jobs: fits.length, status: `would send: ${message(fits, yesterday).title}` })
      continue
    }
    try {
      await server.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }).pushTextMessage(JSON.stringify(message(fits, yesterday)), { ttl: 12 * 3600, urgency: webpush.Urgency.Normal })
      await patch(sub.id, { last_sent_at: now.toISOString(), last_error: null })
      report.push({ user: sub.user_id, jobs: fits.length, status: "sent" })
    } catch (e) {
      const gone = e instanceof webpush.PushMessageError && (e.isGone() || e.response.status === 404)
      // A phone that removed odds or turned notifications off: forget it.
      if (gone) await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${sub.id}`, { method: "DELETE", headers: rest })
      else await patch(sub.id, { last_error: String(e).slice(0, 300) })
      report.push({ user: sub.user_id, jobs: fits.length, status: gone ? "removed (gone)" : `failed: ${String(e).slice(0, 120)}` })
    }
  }

  return reply(200, { subscriptions: all.length, due: due.length, newJobs: jobs.length, sent: report.filter((r) => r.status === "sent").length, report })
})
