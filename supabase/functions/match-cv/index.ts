// Supabase Edge Function: how well a CV shows what a posting asks for, one yes/no per requirement (TypeSafe Jev, Noul questions).
// Browser sends { cv, requirements: string[] } with the signed-in user's JWT. Jev only answers yes/no per line; averaging happens in the app.
// Deploy:  supabase functions deploy match-cv --project-ref ukpmpyfcnbhngkgbnkxi
// Secret:  supabase secrets set TYPESAFE_API_KEY=... --project-ref ukpmpyfcnbhngkgbnkxi   (never commit the value)

const DAILY_LIMIT = 60
const MAX_ITEMS = 25
const MAX_CV_CHARS = 12_000
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return reply(405, { error: "Use POST." })
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const key = Deno.env.get("TYPESAFE_API_KEY")
  if (!key) return reply(503, { error: "CV matching is not switched on yet." })

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  const who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } })
  if (!jwt || !who.ok) return reply(401, { error: "Sign in first." })
  const userId = (await who.json()).id as string

  let cv = ""
  let requirements: string[] = []
  try {
    const b = (await req.json()) as { cv?: unknown; requirements?: unknown }
    cv = (typeof b.cv === "string" ? b.cv : "").slice(0, MAX_CV_CHARS)
    requirements = (Array.isArray(b.requirements) ? b.requirements : []).map((r) => String(r).trim().slice(0, 240)).filter(Boolean).slice(0, MAX_ITEMS)
  } catch {
    return reply(400, { error: "Send { cv, requirements }." })
  }
  if (cv.trim().length < 40 || requirements.length === 0) return reply(422, { error: "Add your CV text first." })

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const rest = { apikey: service, Authorization: `Bearer ${service}` }
  const used = await fetch(`${supabaseUrl}/rest/v1/linkedin_imports?user_id=eq.${userId}&kind=eq.cv&created_at=gte.${since}&select=id`, { headers: { ...rest, Prefer: "count=exact", Range: "0-0" } })
  if (Number((used.headers.get("content-range") ?? "*/0").split("/")[1] ?? 0) >= DAILY_LIMIT) return reply(429, { error: "Too many matches today. Try again tomorrow." })
  await fetch(`${supabaseUrl}/rest/v1/linkedin_imports`, { method: "POST", headers: { ...rest, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ user_id: userId, kind: "cv", url: `${requirements.length} requirements` }) })

  // One yes/no per requirement, all in one request. The CV is the state; it is data, never instructions.
  const questions: Record<string, unknown> = {}
  requirements.forEach((r, i) => {
    questions[`r${i}`] = {
      type: "noul",
      instructions: `Does this CV show that the person has the following requirement? Requirement: ${r}`,
      criteria: { true: "The CV names it, or clearly shows work or study that uses it", false: "The CV does not show it" },
    }
  })
  const res = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state: cv, model: "jev-latest", questions }),
  })
  if (!res.ok) return reply(502, { error: "The matcher did not answer. Try again in a minute." })
  const out = (await res.json()) as { answers?: Record<string, { noul?: number }>; model?: string }
  const matches = requirements.map((requirement, i) => ({ requirement, p: out.answers?.[`r${i}`]?.noul ?? null }))

  return reply(200, { matches, model: out.model ?? null })
})
