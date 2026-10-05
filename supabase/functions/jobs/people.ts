// POST /jobs/people: people to ask for a referral at a job's company.
// It only READS public.job_people, which a batch job fills (a scraper search per employer, every person judged by Jev),
// so a click costs nothing and shows only people that were checked. Nothing is scraped here.
// Signed-in browser sends { employer, company }; the answer is { people, searched } where `searched` says the employer was looked up at all.
// Scraped people are personal data: Google accounts only. Not signed in is 401, a free guest account is 403.
import { isGuest, reply, userFromRequest } from "../_shared/http.ts"

type Json = Record<string, unknown>

/** The stored people for { employer }, for a signed-in, non-guest caller. */
export async function people(req: Request): Promise<Response> {
  if (req.method !== "POST") return reply(405, { error: "Use POST." })
  try {
    const body = (await req.json().catch(() => ({}))) as Json
    const employer = str(body.employer)
    if (!employer) return reply(400, { error: "Send { employer }." })
    const url = Deno.env.get("SUPABASE_URL")!
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const rest = { apikey: service, Authorization: `Bearer ${service}` }
    const enc = encodeURIComponent(employer)
    const [user, found, run] = await Promise.all([
      userFromRequest(req),
      fetch(`${url}/rest/v1/job_people?employer=eq.${enc}&select=name,headline,place,photo,about,positions,profile_url&order=fetched_at.desc&limit=60`, { headers: rest }).then((r) => (r.ok ? (r.json() as Promise<Json[]>) : [])),
      fetch(`${url}/rest/v1/job_people_runs?employer=eq.${enc}&select=searched_at,found,kept`, { headers: rest }).then((r) => (r.ok ? (r.json() as Promise<Json[]>) : [])),
    ])
    if (!user) return reply(401, { error: "Sign in to see people at this company." })
    if (isGuest(user)) return reply(403, { error: "Sign in with Google to see people." })

    return reply(200, {
      people: found.map((p) => ({ name: str(p.name), headline: str(p.headline), place: str(p.place), url: str(p.profile_url), photo: str(p.photo), about: str(p.about), positions: Array.isArray(p.positions) ? p.positions : [] })),
      searched: run.length > 0,
      more: false,
      widened: [],
    })
  } catch (e) {
    console.error("jobs/people", e)

    return reply(500, { error: "Could not look up people. Try again." })
  }
}

/** A trimmed string, or "" for anything else. */
function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : ""
}
