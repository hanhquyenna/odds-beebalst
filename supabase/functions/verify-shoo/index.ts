// Supabase Edge Function: Google sign-in bridge. Verifies a Shoo id_token
// (ES256 against Shoo's JWKS, issuer and one of our origins as audience,
// verified email required) and hands back a one-time Supabase magic-link
// token, so Google users get a real Supabase session and every row-level
// policy keeps working unchanged. No rate table: the token is single-use
// and short-lived, and minting one needs a completed Google OAuth flow.
// Deploy:  scripts/deploy-shoo-bridge.sh
// Secret: SHOO_APP_ORIGINS (comma-separated site origins, e.g.
// https://odds.example,http://localhost:5173). Dev and prod are different
// Shoo origins with different pairwise ids; the verified email is the link.
import { createRemoteJWKSet, jwtVerify } from "npm:jose@4"

const SHOO_BASE_URL = "https://shoo.dev"
const SHOO_ISSUER = "https://shoo.dev"
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

const jwks = createRemoteJWKSet(new URL("/.well-known/jwks.json", SHOO_BASE_URL))

interface ShooClaims {
  pairwise_sub?: unknown
  email?: unknown
  email_verified?: unknown
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return reply(405, { error: "Use POST." })
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const origins = (Deno.env.get("SHOO_APP_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0)
  if (origins.length === 0) return reply(503, { error: "Google sign-in is not switched on yet." })

  const idToken = ((await req.json().catch(() => ({}))) as { idToken?: unknown }).idToken
  if (typeof idToken !== "string" || !idToken) return reply(400, { error: "Send the Shoo token." })

  let claims: ShooClaims | null = null
  for (const origin of origins) {
    try {
      const { payload } = await jwtVerify(idToken, jwks, { issuer: SHOO_ISSUER, audience: `origin:${new URL(origin).origin}` })
      claims = payload as ShooClaims
      break
    } catch {
      continue
    }
  }
  const email = typeof claims?.email === "string" ? claims.email.trim().toLowerCase() : ""
  const sub = typeof claims?.pairwise_sub === "string" ? claims.pairwise_sub : ""
  if (!claims || !email || claims.email_verified !== true || !sub) {
    return reply(401, { error: "Google did not share a verified email. Try again and allow sharing your email." })
  }

  const admin = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }
  // Find or make the Supabase user, keyed by the verified email. An existing
  // address answers "already registered", which is the found case.
  const made = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ email, email_confirm: true, user_metadata: { shoo_sub: sub } }),
  })
  if (!made.ok) {
    const err = (await made.json().catch(() => ({}))) as { msg?: unknown; message?: unknown }
    const said = err.msg ?? err.message
    if (!(typeof said === "string" ? said : "").toLowerCase().includes("already")) {
      return reply(500, { error: "Could not open your account." })
    }
  }
  const link = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: admin,
    body: JSON.stringify({ type: "magiclink", email }),
  })
  const actionLink = ((await link.json().catch(() => ({}))) as { action_link?: unknown }).action_link
  if (!link.ok || typeof actionLink !== "string" || !actionLink) {
    return reply(500, { error: "Could not open your account." })
  }

  return reply(200, { action_link: actionLink })
})
