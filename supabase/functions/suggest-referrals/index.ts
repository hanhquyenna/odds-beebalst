// Supabase Edge Function: people to ask for a referral at a job's company.
// It only READS public.job_people, which scripts/prefill-people.ts fills in a batch (a scraper search per employer, every person judged by Jev),
// so a click costs nothing and shows only people that were checked. Nothing is scraped here.
// Signed-in browser sends { employer, company }; the answer is { people, searched } where `searched` says the employer was looked up at all.
// Deploy:  supabase functions deploy suggest-referrals --project-ref ukpmpyfcnbhngkgbnkxi

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
type Json = Record<string, unknown>
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return reply(405, { error: "Use POST." })
  try {
    const body = (await req.json().catch(() => ({}))) as Json
    const employer = str(body.employer)
    if (!employer) return reply(400, { error: "Send { employer }." })
    const url = Deno.env.get("SUPABASE_URL")!
    // Scraped people are personal data: signed-in accounts only, never the public anon key.
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    const who = await fetch(`${url}/auth/v1/user`, { headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY")!, Authorization: `Bearer ${jwt}` } })
    if (!who.ok) return reply(401, { error: "Sign in to see people at this company." })
    const rest = { apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` }
    const enc = encodeURIComponent(employer)
    const [people, run] = await Promise.all([
      fetch(`${url}/rest/v1/job_people?employer=eq.${enc}&select=name,headline,place,photo,about,positions,profile_url&order=fetched_at.desc&limit=60`, { headers: rest }).then((r) => (r.ok ? (r.json() as Promise<Json[]>) : [])),
      fetch(`${url}/rest/v1/job_people_runs?employer=eq.${enc}&select=searched_at,found,kept`, { headers: rest }).then((r) => (r.ok ? (r.json() as Promise<Json[]>) : [])),
    ])

    return reply(200, {
      people: people.map((p) => ({ name: str(p.name), headline: str(p.headline), place: str(p.place), url: str(p.profile_url), photo: str(p.photo), about: str(p.about), positions: Array.isArray(p.positions) ? p.positions : [] })),
      searched: run.length > 0,
      more: false,
      widened: [],
    })
  } catch (e) {
    console.error("suggest-referrals", e)

    return reply(500, { error: "Could not look up people. Try again." })
  }
})
