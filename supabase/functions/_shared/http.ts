// What the three Edge Functions (account, profile, jobs) share: the sub-path router, JSON replies with CORS, the caller's
// sign-in, the hashed network address that keys per-connection limits, and LinkedIn pictures as data URLs.

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" }
const GUEST_DOMAIN = "@guest.odds.invalid"

/** The fields this code reads from Supabase's /auth/v1/user answer. */
export interface AuthUser {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
}

/** Answers one sub-path of a function, e.g. /jobs/add. */
export type Handler = (req: Request) => Promise<Response>

/** A small picture from LinkedIn's own image servers as a data URL, or null. Only a picture, and not a large one. */
export async function imageDataUrl(address: string | undefined, maxBytes: number, timeoutMs: number): Promise<string | null> {
  try {
    if (!address) return null
    const u = new URL(address)
    if (u.protocol !== "https:" || !/(^|\.)licdn\.com$/.test(u.hostname)) return null
    const res = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) })
    const type = res.headers.get("content-type") ?? ""
    if (!res.ok || !type.startsWith("image/")) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.length === 0 || bytes.length > maxBytes) return null
    let binary = ""
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))

    return `data:${type};base64,${btoa(binary)}`
  } catch {
    return null
  }
}

/** The caller's network address, hashed with a server-only salt. Keys the limits for people who are not signed in. */
export async function ipHash(req: Request): Promise<string> {
  const address = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"

  return sha256(`${address}|${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!.slice(-16)}`)
}

/** True for a free guest account: its placeholder address, or the guest flag set when it was made. */
export function isGuest(user: AuthUser): boolean {
  return Boolean(user.email?.endsWith(GUEST_DOMAIN)) || user.user_metadata?.guest === true
}

/** A JSON answer with the CORS headers every browser caller needs. */
export function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status: status, headers: { ...CORS, "Content-Type": "application/json" } })
}

/** Serves one function: answers CORS preflights, then hands the request to the route named by the last path segment. */
export function serveRoutes(routes: Record<string, Handler>): void {
  Deno.serve(async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS })
    const route = routes[new URL(req.url).pathname.split("/").filter(Boolean).at(-1) ?? ""]

    return route ? await route(req) : reply(404, { error: "Not found." })
  })
}

/** Hex SHA-256 of a text. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))

  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** The signed-in caller from the Authorization header, or null for no sign-in, the public anon key, or a bad token. */
export async function userFromRequest(req: Request): Promise<AuthUser | null> {
  return userFromToken((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""))
}

/** The user an access token belongs to, checked with Supabase Auth, or null. */
export async function userFromToken(token: string): Promise<AuthUser | null> {
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  if (!token || token === anon) return null
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")!}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
  const user = res.ok ? ((await res.json()) as Partial<AuthUser>) : null

  return user?.id ? (user as AuthUser) : null
}
