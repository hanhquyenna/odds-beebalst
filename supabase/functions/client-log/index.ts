// Supabase Edge Function (temporary, for testing install and notifications on real phones): stores one step the app
// took (event name plus a few facts like browser and Home Screen or not). No personal data; a small size cap per event.
// Deploy:  supabase functions deploy client-log --project-ref ukpmpyfcnbhngkgbnkxi --use-api --no-verify-jwt
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return new Response("Use POST.", { status: 405, headers: cors })
  const body = (await req.json().catch(() => ({}))) as { event?: string; device?: string; user?: string; detail?: unknown }
  const event = typeof body.event === "string" ? body.event.slice(0, 60) : ""
  if (!event) return new Response("No event.", { status: 400, headers: cors })
  const detail = JSON.stringify(body.detail ?? null).slice(0, 2000)
  const user = typeof body.user === "string" && /^[0-9a-f-]{36}$/.test(body.user) ? body.user : null
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/client_events`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ event, device: typeof body.device === "string" ? body.device.slice(0, 40) : null, user_id: user, detail: JSON.parse(detail) }),
  })
  return new Response("ok", { headers: cors })
})
