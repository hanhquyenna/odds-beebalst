// Signing in to odds from an MCP client (Claude, ChatGPT): OAuth 2.1 with PKCE, so the person types no link and pastes no key.
//
//   Claude is given only the plain address of the connector. Its first request has no credentials and is answered 401 with a pointer
//   to /oauth/resource (RFC 9728), which names https://odds.beeblast.co as the authorization server. Its metadata is a static file
//   (public/.well-known/oauth-authorization-server, RFC 8414) that sends Claude to:
//     /oauth/register   register (RFC 7591): the client_id is signed, nothing is stored
//     odds.beeblast.co/connect/claude   the page where the person signs in and taps Allow (src/components/ConnectApproval.tsx)
//     /oauth/authorize  called by that page with the person's own session: checks the request, returns the redirect with a code
//     /oauth/token      trades the code (PKCE checked) for the person's private odds key, which is the access token
//   The access token IS the private key of migrations/20261010140000_claude_private_link.sql (only its hash is kept, "Disconnect"
//   deletes it), so everything after sign-in works as it did with the private link.
//
// Codes and client ids are signed with a key derived from the service role key and expire in five minutes: nothing to store.

// deno-lint-ignore no-explicit-any
type Json = any

export const SITE = "https://odds.beeblast.co"
const CODE_SECONDS = 300
const enc = new TextEncoder()

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const unb64 = (text: string): Uint8Array => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))
const b64json = (value: Json): string => b64(enc.encode(JSON.stringify(value)))

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(`odds-oauth-v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))))
}

async function sign(secret: string, value: Json): Promise<string> {
  const body = b64json(value)

  return `${body}.${await hmac(secret, body)}`
}

async function open(secret: string, token: string): Promise<Json> {
  const [body, mac, ...rest] = token.split(".")
  if (!body || !mac || rest.length > 0 || mac !== (await hmac(secret, body))) return null
  try {
    return JSON.parse(new TextDecoder().decode(unb64(body)))
  } catch {
    return null
  }
}

const sha256b64 = async (text: string): Promise<string> => b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text))))
const sha256hex = async (text: string): Promise<string> => [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("")

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" }
const reply = (status: number, body: Json, cors: Record<string, string>): Response => new Response(JSON.stringify(body), { status, headers: { ...cors, ...JSON_HEADERS } })
const oauthError = (status: number, error: string, description: string, cors: Record<string, string>): Response => reply(status, { error, error_description: description }, cors)

/** https anywhere (Claude, ChatGPT, other clients each have their own address), or a loopback address for desktop tools. */
function redirectAllowed(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false
  try {
    const u = new URL(uri)
    if (u.hash) return false
    if (u.protocol === "https:") return true

    return u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  } catch {
    return false
  }
}

export interface OAuthEnv {
  url: string
  anonKey: string
  serviceKey?: string
}

/** The address of the connector, derived from the function's own public URL. */
export const resourceOf = (env: OAuthEnv): string => `${env.url}/functions/v1/mcp`

/** The 401 an unsigned request gets: it tells the client where to find out how to sign in. */
export function unauthorized(env: OAuthEnv, cors: Record<string, string>, reason = "Sign in to odds to use this connector."): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: reason } }), {
    status: 401,
    headers: { ...cors, "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${resourceOf(env)}/oauth/resource"`, "Access-Control-Expose-Headers": "mcp-session-id, WWW-Authenticate" },
  })
}

async function formOrJson(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? ""
  const raw = await req.text()
  if (raw.length > 8192) return {}
  if (type.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw)

      return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {}
    } catch {
      return {}
    }
  }

  return Object.fromEntries(new URLSearchParams(raw))
}

async function userOf(env: OAuthEnv, req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? ""
  if (!/^Bearer\s+\S+/i.test(auth)) return null
  const r = await fetch(`${env.url}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: auth } }).catch(() => null)
  if (!r?.ok) return null
  const u = (await r.json().catch(() => null)) as { id?: string; email?: string } | null
  // A guest account is not a person to connect to Claude.
  if (!u?.id || (u.email ?? "").endsWith("@guest.odds.invalid")) return null

  return u.id
}

/** Handles /oauth/*. Returns null for any other path. */
export async function handleOAuth(req: Request, env: OAuthEnv, cors: Record<string, string>): Promise<Response | null> {
  const path = new URL(req.url).pathname
  const at = path.indexOf("/oauth/")
  if (at < 0) return null
  const route = path.slice(at + "/oauth/".length).replace(/\/+$/, "")
  const secret = env.serviceKey
  if (!secret) return oauthError(503, "server_error", "Sign-in is not set up.", cors)

  if (route === "resource" && req.method === "GET") {
    return reply(200, { resource: resourceOf(env), authorization_servers: [SITE], bearer_methods_supported: ["header"], resource_name: "odds" }, cors)
  }

  if (route === "register" && req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as { redirect_uris?: unknown; client_name?: unknown }
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : []
    if (uris.length === 0 || uris.length > 10 || !uris.every(redirectAllowed)) return oauthError(400, "invalid_redirect_uri", "Give one to ten https (or localhost) redirect addresses.", cors)
    const name = typeof body.client_name === "string" ? body.client_name.slice(0, 80) : "An app"
    const client_id = await sign(secret, { t: "client", u: uris, n: name })

    return reply(201, { client_id, client_name: name, redirect_uris: uris, grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none", client_id_issued_at: Math.floor(Date.now() / 1000) }, cors)
  }

  // From the odds page, with the person's own session: "check" says who is asking, "allow" returns where to send them back.
  if (route === "authorize" && req.method === "POST") {
    const userId = await userOf(env, req)
    if (!userId) return oauthError(401, "login_required", "Sign in to odds first.", cors)
    const b = (await req.json().catch(() => ({}))) as Record<string, string>
    const client = await open(secret, String(b.client_id ?? ""))
    if (!client || client.t !== "client") return oauthError(400, "invalid_client", "This request is not valid. Start again from Claude.", cors)
    if (!client.u.includes(b.redirect_uri)) return oauthError(400, "invalid_request", "This request is not valid. Start again from Claude.", cors)
    if (b.code_challenge_method !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(String(b.code_challenge ?? ""))) return oauthError(400, "invalid_request", "This request is not valid. Start again from Claude.", cors)
    const back = new URL(b.redirect_uri)
    if (b.action === "check") return reply(200, { client_name: client.n, host: back.host }, cors)
    if (b.action === "deny") {
      back.searchParams.set("error", "access_denied")
      if (b.state) back.searchParams.set("state", String(b.state).slice(0, 500))

      return reply(200, { redirect: back.toString() }, cors)
    }
    if (b.action !== "allow") return oauthError(400, "invalid_request", "Unknown action.", cors)
    const code = await sign(secret, { t: "code", u: userId, c: await clientHash(String(b.client_id)), r: b.redirect_uri, h: b.code_challenge, e: Math.floor(Date.now() / 1000) + CODE_SECONDS })
    back.searchParams.set("code", code)
    if (b.state) back.searchParams.set("state", String(b.state).slice(0, 500))

    return reply(200, { redirect: back.toString() }, cors)
  }

  if (route === "token" && req.method === "POST") {
    const b = await formOrJson(req)
    if (b.grant_type !== "authorization_code") return oauthError(400, "unsupported_grant_type", "Only authorization_code is supported.", cors)
    const code = await open(secret, String(b.code ?? ""))
    if (!code || code.t !== "code" || code.e < Math.floor(Date.now() / 1000)) return oauthError(400, "invalid_grant", "This sign-in has expired. Connect again from Claude.", cors)
    if (code.r !== b.redirect_uri || code.c !== (await clientHash(String(b.client_id ?? "")))) return oauthError(400, "invalid_grant", "This sign-in does not match the request.", cors)
    if (!b.code_verifier || (await sha256b64(String(b.code_verifier))) !== code.h) return oauthError(400, "invalid_grant", "The sign-in check failed. Connect again from Claude.", cors)
    // The access token is the person's private key (a new one replaces the old: one link, one person, one place at a time).
    const token = `odds_${[...crypto.getRandomValues(new Uint8Array(24))].map((x) => x.toString(16).padStart(2, "0")).join("")}`
    const saved = await fetch(`${env.url}/rest/v1/mcp_keys?on_conflict=user_id`, {
      method: "POST",
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: code.u, key_hash: await sha256hex(token), hint: token.slice(-4), created_at: new Date().toISOString(), last_used_at: null }),
    }).catch(() => null)
    if (!saved?.ok) return oauthError(500, "server_error", "Could not finish connecting. Try again.", cors)

    return reply(200, { access_token: token, token_type: "Bearer" }, cors)
  }

  return oauthError(404, "not_found", "Unknown sign-in address.", cors)
}

// The client id is long (it carries its redirect addresses): the code keeps a short fingerprint of it instead.
const clientHash = async (clientId: string): Promise<string> => (await sha256b64(clientId)).slice(0, 16)
