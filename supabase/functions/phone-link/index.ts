// Supabase Edge Function: signs a phone in without typing anything, and makes guest accounts.
//   guest:  someone without an account (after a LinkedIn import) gets a guest account and its session, so their profile,
//           phone and morning message work before real sign-in exists. Limited per connection.
//   adopt:  right after a real sign-in, a guest's profile, phones and applications move to the real account. Needs both
//           sign-ins: the real one in Authorization and the guest's access token in the body.
//   pair-start / pair-approve / pair-claim: a Home Screen app signs in through the browser (it cannot finish a Google
//           sign-in itself). The app starts a pair and keeps its secret, the browser approves it once signed in (after
//           the person confirms the short code both screens show), and the app claims its session with the secret.
//   create: a signed-in person asks for a one-time code (the QR code on the computer, or the address an iPhone's Home
//           Screen app opens with, since that app keeps its own storage apart from Safari).
//   redeem: the phone hands the code back once and gets a session for the same person.
// Codes are random, used once, and expire (15 minutes for a QR code, 30 for the Home Screen address).
// Deploy:  supabase functions deploy phone-link --project-ref ukpmpyfcnbhngkgbnkxi --use-api --no-verify-jwt

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })

/** How long each kind of code lives, in minutes. */
const LIFETIME = { qr: 15, home: 30 } as const
/** Codes one person can ask for in an hour; enough for any real use, stops a runaway loop. */
const HOURLY = 30

/** Guest accounts one connection can make in a day. */
const GUESTS_PER_DAY = 20

/** A session for an account, made on the server: a sign-in link (nothing is emailed) exchanged at once. */
async function sessionFor(supabaseUrl: string, anon: string, admin: Record<string, string>, email: string): Promise<unknown> {
  const link = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email }) })
  const hashed = link.ok ? ((await link.json()) as { properties?: { hashed_token?: string }; hashed_token?: string }) : null
  const tokenHash = hashed?.properties?.hashed_token ?? hashed?.hashed_token
  if (!tokenHash) return null
  const verified = await fetch(`${supabaseUrl}/auth/v1/verify`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }) })

  return verified.ok ? await verified.json() : null
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return reply(405, { error: "Use POST." })

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const admin = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }
  const body = (await req.json().catch(() => ({}))) as { action?: string; code?: string; kind?: string; guest_token?: string; id?: string; secret?: string }

  if (body.action === "create") {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    const who = jwt ? await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } }) : null
    if (!who || !who.ok) return reply(401, { error: "Sign in first." })
    const userId = (await who.json()).id as string

    const since = new Date(Date.now() - 3600 * 1000).toISOString()
    const recent = await fetch(`${supabaseUrl}/rest/v1/phone_links?select=code&user_id=eq.${userId}&created_at=gte.${since}`, { headers: { ...admin, Prefer: "count=exact", Range: "0-0" } })
    const total = Number(recent.headers.get("content-range")?.split("/")[1] ?? 0)
    if (total >= HOURLY) return reply(429, { error: "Too many links in the last hour. Try again later." })

    const kind = body.kind === "home" ? "home" : "qr"
    const code = newCode()
    const expires = new Date(Date.now() + LIFETIME[kind] * 60 * 1000).toISOString()
    const saved = await fetch(`${supabaseUrl}/rest/v1/phone_links`, { method: "POST", headers: admin, body: JSON.stringify({ code, user_id: userId, expires_at: expires }) })
    if (!saved.ok) return reply(500, { error: "Could not make a link." })

    return reply(200, { code, expires_at: expires })
  }

  if (body.action === "redeem") {
    const code = typeof body.code === "string" ? body.code : ""
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(code)) return reply(400, { error: "This link is not valid." })

    // Used once: mark it used only if it is still unused and in date, and learn whose it was in the same step.
    const now = new Date().toISOString()
    const taken = await fetch(`${supabaseUrl}/rest/v1/phone_links?code=eq.${code}&used_at=is.null&expires_at=gt.${now}&select=user_id`, {
      method: "PATCH",
      headers: { ...admin, Prefer: "return=representation" },
      body: JSON.stringify({ used_at: now }),
    })
    const rows = taken.ok ? ((await taken.json()) as Array<{ user_id: string }>) : []
    if (rows.length === 0) return reply(410, { error: "This link has expired. Make a new one on your computer." })

    const user = await fetch(`${supabaseUrl}/auth/v1/admin/users/${rows[0].user_id}`, { headers: admin })
    const email = user.ok ? ((await user.json()).email as string | undefined) : undefined
    if (!email) return reply(404, { error: "Account not found." })

    const session = await sessionFor(supabaseUrl, anon, admin, email)
    if (!session) return reply(500, { error: "Could not sign you in." })

    return reply(200, session)
  }

  if (body.action === "guest") {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
    const ipHash = await sha256(`${ip}|${service.slice(-16)}`)
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const recent = await fetch(`${supabaseUrl}/rest/v1/guest_accounts?select=user_id&ip_hash=eq.${ipHash}&created_at=gte.${since}`, { headers: { ...admin, Prefer: "count=exact", Range: "0-0" } })
    const total = Number(recent.headers.get("content-range")?.split("/")[1] ?? 0)
    if (total >= GUESTS_PER_DAY) return reply(429, { error: "Too many new accounts from here today." })

    // No email of the person's own: a placeholder address that can never receive mail, and a password nobody knows.
    const email = `guest-${crypto.randomUUID()}@guest.odds.invalid`
    const made = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: admin,
      body: JSON.stringify({ email, password: newCode() + newCode(), email_confirm: true, user_metadata: { guest: true } }),
    })
    if (!made.ok) return reply(500, { error: "Could not make a guest account.", detail: (await made.text()).slice(0, 200) })
    const userId = (await made.json()).id as string
    await fetch(`${supabaseUrl}/rest/v1/guest_accounts`, { method: "POST", headers: admin, body: JSON.stringify({ user_id: userId, ip_hash: ipHash }) })

    const session = await sessionFor(supabaseUrl, anon, admin, email)
    if (!session) return reply(500, { error: "Could not sign you in." })

    return reply(200, session)
  }

  if (body.action === "adopt") {
    const userOf = async (token: string): Promise<string | null> => {
      if (!token) return null
      const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
      return r.ok ? ((await r.json()).id as string) : null
    }
    const owner = await userOf((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""))
    const guest = await userOf(typeof body.guest_token === "string" ? body.guest_token : "")
    if (!owner) return reply(401, { error: "Sign in first." })
    if (!guest) return reply(400, { error: "The guest sign-in is missing or has expired." })
    if (owner === guest) return reply(200, { moved: {} })

    const done = await fetch(`${supabaseUrl}/rest/v1/rpc/adopt_guest`, { method: "POST", headers: admin, body: JSON.stringify({ guest, owner }) })
    if (!done.ok) return reply(409, { error: "Could not move the guest account.", detail: (await done.text()).slice(0, 200) })

    return reply(200, { moved: await done.json() })
  }

  if (body.action === "pair-start") {
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
    const ipHash = await sha256(`${ip}|${service.slice(-16)}`)
    const since = new Date(Date.now() - 3600 * 1000).toISOString()
    const recent = await fetch(`${supabaseUrl}/rest/v1/device_pairs?select=id&ip_hash=eq.${ipHash}&created_at=gte.${since}`, { headers: { ...admin, Prefer: "count=exact", Range: "0-0" } })
    if (Number(recent.headers.get("content-range")?.split("/")[1] ?? 0) >= HOURLY) return reply(429, { error: "Too many sign-in attempts. Try again later." })
    const id = newCode()
    const secret = newCode() + newCode()
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    const saved = await fetch(`${supabaseUrl}/rest/v1/device_pairs`, { method: "POST", headers: admin, body: JSON.stringify({ id, secret_hash: await sha256(secret), ip_hash: ipHash, expires_at: expires }) })
    if (!saved.ok) return reply(500, { error: "Could not start sign-in." })

    return reply(200, { id, secret, expires_at: expires })
  }

  if (body.action === "pair-approve") {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    const who = jwt ? await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${jwt}` } }) : null
    if (!who || !who.ok) return reply(401, { error: "Sign in first." })
    const userId = (await who.json()).id as string
    const id = typeof body.id === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(body.id) ? body.id : ""
    if (!id) return reply(400, { error: "This sign-in link is not valid." })
    const now = new Date().toISOString()
    const done = await fetch(`${supabaseUrl}/rest/v1/device_pairs?id=eq.${id}&user_id=is.null&expires_at=gt.${now}&select=id`, {
      method: "PATCH",
      headers: { ...admin, Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, approved_at: now }),
    })
    const rows = done.ok ? ((await done.json()) as unknown[]) : []
    if (rows.length === 0) return reply(410, { error: "This sign-in has expired. Start again in the app." })

    return reply(200, { approved: true })
  }

  if (body.action === "pair-claim") {
    const id = typeof body.id === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(body.id) ? body.id : ""
    const secret = typeof body.secret === "string" ? body.secret : ""
    if (!id || !secret) return reply(400, { error: "Not valid." })
    const now = new Date().toISOString()
    const found = (await (await fetch(`${supabaseUrl}/rest/v1/device_pairs?id=eq.${id}&select=secret_hash,user_id,expires_at,claimed_at`, { headers: admin })).json()) as Array<{ secret_hash: string; user_id: string | null; expires_at: string; claimed_at: string | null }>
    const pair = found[0]
    if (!pair || pair.claimed_at || pair.expires_at <= now) return reply(410, { error: "This sign-in has expired. Start again." })
    if (pair.secret_hash !== (await sha256(secret))) return reply(403, { error: "Not allowed." })
    if (!pair.user_id) return reply(202, { waiting: true })

    // Claimed once: only if still unclaimed, in the same step.
    const taken = await fetch(`${supabaseUrl}/rest/v1/device_pairs?id=eq.${id}&claimed_at=is.null&select=user_id`, { method: "PATCH", headers: { ...admin, Prefer: "return=representation" }, body: JSON.stringify({ claimed_at: now }) })
    const rows = taken.ok ? ((await taken.json()) as Array<{ user_id: string }>) : []
    if (rows.length === 0) return reply(410, { error: "This sign-in has already been used." })
    const user = await fetch(`${supabaseUrl}/auth/v1/admin/users/${rows[0].user_id}`, { headers: admin })
    const email = user.ok ? ((await user.json()).email as string | undefined) : undefined
    if (!email) return reply(404, { error: "Account not found." })
    const session = await sessionFor(supabaseUrl, anon, admin, email)
    if (!session) return reply(500, { error: "Could not sign you in." })

    return reply(200, session)
  }

  return reply(400, { error: "Unknown action." })
})
