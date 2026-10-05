// POST /jobs/morning: the morning message. Runs from pg_cron; for every phone or browser that said yes to
// notifications (table push_subscriptions) and whose own clock reads its send hour (8 by default), it counts the jobs
// first found yesterday that are in that person's "Jobs that fit you" (the app's own rule, bundled in match.js), and
// sends one message: "5 new jobs fit you". Nothing is sent when nothing new fits.
// POST /jobs/welcome: one message to the caller's own newest device, right after they turn notifications on.
// match.js is built from src/lib/fit-filters.ts by scripts/build-morning-jobs.sh; rebuild it before deploying after a filter change.
// Secrets (Edge Function secrets, never in a file): VAPID_KEYS, VAPID_CONTACT, MORNING_SECRET
import * as webpush from "jsr:@negrel/webpush@0.5.0"
import { reply, userFromRequest } from "../_shared/http.ts"
// @ts-ignore: bundled from src/lib/filters.ts by scripts/build-morning-jobs.sh
import { applyFilters, savedFitFilters } from "./match.js"

/** The browser push services a real subscription points at. Anything else (an internal address, a host that never answers) is refused, since anyone can store an endpoint. */
const PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com", "notify.windows.com"]

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

/** Sends every due device its count of yesterday's fitting jobs. ?dry=1 only reports, ?now=1 ignores the send hour, ?user= limits to one person. */
export async function morning(req: Request): Promise<Response> {
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
  const patch = (id: string, body: Record<string, unknown>): Promise<Response> => fetch(`${supabaseUrl}/rest/v1/push_subscriptions?id=eq.${id}`, { method: "PATCH", headers: rest, body: JSON.stringify(body) })

  const now = new Date()
  const all = await get<Sub[]>(`push_subscriptions?select=id,user_id,endpoint,p256dh,auth,send_hour,time_zone,last_sent_at${onlyUser ? `&user_id=eq.${onlyUser}` : ""}`)
  // Due: the person's clock reads their hour, and nothing went out in the last 20 hours (cron runs twice around 8 for summer and winter time).
  const due = all.filter((s) => isPushEndpoint(s.endpoint) && (ignoreHour || hourIn(s.time_zone, now) === s.send_hour) && (ignoreHour || !s.last_sent_at || now.getTime() - Date.parse(s.last_sent_at) > 20 * 3600 * 1000))
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
  // Jobs someone already applied to are not news for them.
  const applied = await get<Array<{ user_id: string; posting_id: string }>>(`applications?select=user_id,posting_id&user_id=in.(${users.join(",")})`)
  const appliedBy = new Map<string, Set<string>>()
  for (const a of applied) appliedBy.set(a.user_id, (appliedBy.get(a.user_id) ?? new Set()).add(a.posting_id))
  const profileOf = new Map(profiles.map((p) => [p.user_id, p.data]))

  const server = await pushServer()

  const report: Array<{ user: string; jobs: number; status: string }> = []
  for (const sub of due) {
    // Exactly "Jobs that fit you" in the app (src/lib/fit-filters.ts): the person's preferences, English unless they chose
    // otherwise, their lines of work; without the jobs they dismissed or applied to.
    const profile = profileOf.get(sub.user_id) ?? {}
    const filters = savedFitFilters(profile)
    const dismissed = new Set((profile.dismissed as string[] | undefined) ?? [])
    const done = appliedBy.get(sub.user_id) ?? new Set<string>()
    const fits = (applyFilters(jobs, filters) as Job[]).filter((j) => !dismissed.has(j.id) && !done.has(j.id))

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

  return reply(200, { subscriptions: all.length, due: due.length, newJobs: jobs.length, sent: report.filter((r) => r.status === "sent").length, report: report })
}

/**
 * Right after someone turns notifications on: one message to their own devices, so they see at once that it works.
 * Called by the app with the person's sign-in; it can only ever reach that person's own devices.
 */
export async function welcome(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const user = await userFromRequest(req)
  if (!user) return reply(401, { error: "Sign in first." })
  const rest = { apikey: service, Authorization: `Bearer ${service}` }
  const subs = (await (await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${user.id}&order=created_at.desc&limit=1`, { headers: rest })).json()) as Sub[]
  if (subs.length === 0 || !isPushEndpoint(subs[0].endpoint)) return reply(404, { error: "No device to send to." })

  const server = await pushServer()
  const sub = subs[0]
  try {
    await server
      .subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } })
      .pushTextMessage(JSON.stringify({ title: "You’re set", body: "odds sends you the new jobs that fit you at 8 every morning.", url: "/", tag: "odds-welcome" }), { ttl: 3600, urgency: webpush.Urgency.High })

    return reply(200, { sent: true })
  } catch {
    return reply(502, { error: "The device did not take the message." })
  }
}

/** The hour on the person's own clock. */
function hourIn(timeZone: string, now: Date): number {
  try {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: timeZone, hour: "numeric", hourCycle: "h23" }).format(now))
  } catch {
    return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "numeric", hourCycle: "h23" }).format(now))
  }
}

/** True for an https endpoint on one of the PUSH_HOSTS; both senders skip anything else. */
function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)

    return url.protocol === "https:" && PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/** The morning message for a person's fitting jobs. */
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

/** The web push sender, signed with our VAPID keys. */
async function pushServer(): Promise<webpush.ApplicationServer> {
  const vapidKeys = await webpush.importVapidKeys(JSON.parse(Deno.env.get("VAPID_KEYS")!), { extractable: false })

  return webpush.ApplicationServer.new({ contactInformation: Deno.env.get("VAPID_CONTACT") ?? "mailto:hello@odds.nl", vapidKeys: vapidKeys })
}
