// Edge Function `drive`: a person's own Google Drive as the place their documents' files are kept (../_shared/drive.ts).
//   POST /drive/start       { returnTo }  the Google consent address to send the browser to
//   GET  /drive/callback    Google comes back here: keeps the link, makes the folders, moves the files, back to the app
//   POST /drive/sync        moves anything still in the bucket; takes over renames made in Drive; says which files changed or went missing there
//   POST /drive/file        { id }  the original file, from Drive
//   POST /drive/rename      { id }  gives the Drive file the document's current name
//   POST /drive/trash       { id }  puts the Drive file in the Drive bin (before the document row is deleted)
//   POST /drive/disconnect  brings the files back into the bucket, then lets go of Drive
// Deploy:  supabase functions deploy drive --project-ref ukpmpyfcnbhngkgbnkxi --use-api   (config.toml: verify_jwt = false,
// because Google's redirect carries no sign-in; every other route checks it here.)
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET; SHOO_APP_ORIGINS (the sites the browser may be sent back to).
import { reply, serveRoutes, userFromRequest, type AuthUser } from "../_shared/http.ts"
import {
  DriveGone,
  SCOPES,
  accessFor,
  contentOf,
  docsOf,
  driveEnv,
  driveName,
  ensureFolders,
  googleToken,
  linkOf,
  pullAll,
  pushAll,
  redirectUri,
  renameIn,
  revokeGoogle,
  svc,
  syncDocs,
  trashIn,
  type DriveEnv,
  type DriveLink,
} from "../_shared/drive.ts"

const ID = /^[0-9a-f-]{36}$/

// ---------------------------------------------------------------- the state that rides through Google

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
const fromB64url = (s: string): string => atob(s.replace(/-/g, "+").replace(/_/g, "/"))

async function hmac(env: DriveEnv, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(`drive-state|${env.serviceKey}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text))))
}

interface State {
  u: string
  r: string
  e: number
}

async function sealState(env: DriveEnv, state: State): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(state)))

  return `${body}.${await hmac(env, body)}`
}

async function openState(env: DriveEnv, sealed: string): Promise<State | null> {
  const [body, mac] = sealed.split(".")
  if (!body || !mac || mac !== (await hmac(env, body))) return null
  try {
    const s = JSON.parse(fromB64url(body)) as State
    return typeof s.u === "string" && typeof s.r === "string" && s.e > Date.now() ? s : null
  } catch {
    return null
  }
}

/** Only back to the app's own sites (or this computer while developing): never to an address a caller made up. */
function safeReturn(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const origins = (Deno.env.get("SHOO_APP_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => new URL(s).origin)
  const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")
  if (!local && !origins.includes(u.origin)) return null

  return `${u.origin}${u.pathname}`
}

function back(to: string, outcome: "connected" | "cancelled" | "failed"): Response {
  const u = new URL(to)
  u.searchParams.set("drive", outcome)

  return new Response(null, { status: 302, headers: { Location: u.toString() } })
}

// ---------------------------------------------------------------- routes

type Ctx = { env: DriveEnv; me: AuthUser; body: Record<string, unknown> }

/** The signed-in, non-guest caller and Drive being set up; or the answer to give instead. */
function signedIn(run: (ctx: Ctx) => Promise<Response>): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method !== "POST") return reply(405, { error: "Use POST." })
    const env = driveEnv()
    if (!env) return reply(503, { error: "Google Drive is not switched on yet." })
    const me = await userFromRequest(req)
    if (!me) return reply(401, { error: "Sign in first." })
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    try {
      return await run({ env, me, body })
    } catch (err) {
      if (err instanceof DriveGone) return reply(409, { error: "Google Drive is no longer connected. Connect it again.", connected: false })
      return reply(502, { error: "Google Drive did not answer. Try again." })
    }
  }
}

/** The connected person's link and a fresh access token; or a 409 to give back. */
async function connected(ctx: Ctx): Promise<{ link: DriveLink; token: string } | Response> {
  const link = await linkOf(ctx.env, ctx.me.id)
  if (!link) return reply(409, { error: "Google Drive is not connected.", connected: false })

  return { link, token: await accessFor(ctx.env, link) }
}

const start = signedIn(async ({ env, me, body }) => {
  if (me.email?.endsWith("@guest.odds.invalid") || me.user_metadata?.guest === true) return reply(403, { error: "Sign in with Google first, then connect your Drive." })
  const returnTo = safeReturn(body.returnTo)
  if (!returnTo) return reply(400, { error: "Unknown return address." })
  const state = await sealState(env, { u: me.id, r: returnTo, e: Date.now() + 15 * 60_000 })
  const q = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: redirectUri(env),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    // Asked every time, so Google always hands over a refresh token (it gives one only on a consent screen).
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    ...(me.email ? { login_hint: me.email } : {}),
  })

  return reply(200, { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` })
})

async function callback(req: Request): Promise<Response> {
  const env = driveEnv()
  const params = new URL(req.url).searchParams
  const state = env ? await openState(env, params.get("state") ?? "") : null
  if (!env || !state) return new Response("This link has expired. Go back to odds and press Connect Google Drive again.", { status: 400 })
  const code = params.get("code")
  if (!code) return back(state.r, "cancelled")
  try {
    const t = await googleToken(env, { code })
    if (!t.refresh_token) return back(state.r, "failed")
    if (!(t.access_token && (await grantedDriveFile(t.access_token)))) return back(state.r, "cancelled")
    const old = await linkOf(env, state.u)
    const folders = await ensureFolders(t.access_token, old ?? undefined)
    const link: DriveLink = { user_id: state.u, email: emailOf(t.id_token), refresh_token: t.refresh_token, ...folders }
    await svc(env, "drive_links?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ ...link, connected_at: new Date().toISOString() }) })
    if (old && old.refresh_token !== link.refresh_token) await revokeGoogle(old.refresh_token)
    await pushAll(env, link, t.access_token)

    return back(state.r, "connected")
  } catch {
    return back(state.r, "failed")
  }
}

/** Google lets a person untick the Drive box on the consent screen: then there is nothing to keep files in. */
async function grantedDriveFile(token: string): Promise<boolean> {
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
  if (!r.ok) return false

  return String(((await r.json()) as { scope?: string }).scope ?? "").includes("auth/drive.file")
}

/** The Google account's address, from the id token Google handed over directly (no need to check its signature here). */
function emailOf(idToken: string | undefined): string | null {
  try {
    const claims = JSON.parse(fromB64url(idToken!.split(".")[1])) as { email?: string }
    return typeof claims.email === "string" ? claims.email : null
  } catch {
    return null
  }
}

const sync = signedIn(async (ctx) => {
  const got = await connected(ctx)
  if (got instanceof Response) return got
  const { link, token } = got
  // Folders deleted in Drive are made again, so a new upload always has somewhere to go.
  const folders = await ensureFolders(token, link)
  const fresh = { ...link, ...folders }
  if (folders.root_id !== link.root_id || folders.cv_folder_id !== link.cv_folder_id || folders.letter_folder_id !== link.letter_folder_id) {
    await svc(ctx.env, `drive_links?user_id=eq.${link.user_id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(folders) })
  }
  const outcome = await syncDocs(ctx.env, fresh, token)

  return reply(200, { connected: true, email: link.email, folder: `https://drive.google.com/drive/folders/${fresh.root_id}`, ...outcome })
})

const file = signedIn(async (ctx) => {
  const id = typeof ctx.body.id === "string" ? ctx.body.id : ""
  if (!ID.test(id)) return reply(400, { error: "Unknown document." })
  const [doc] = await docsOf(ctx.env, ctx.me.id, id)
  if (!doc?.drive_file_id) return reply(404, { error: "That file is not in your Drive." })
  const got = await connected(ctx)
  if (got instanceof Response) return got
  const r = await contentOf(got.token, doc.drive_file_id)
  if (!r.ok) return reply(404, { error: "That file is no longer in your Drive." })

  return new Response(r.body, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": doc.mime } })
})

const rename = signedIn(async (ctx) => {
  const id = typeof ctx.body.id === "string" ? ctx.body.id : ""
  if (!ID.test(id)) return reply(400, { error: "Unknown document." })
  const [doc] = await docsOf(ctx.env, ctx.me.id, id)
  if (!doc?.drive_file_id) return reply(200, { ok: true })
  const got = await connected(ctx)
  if (got instanceof Response) return got
  await renameIn(got.token, doc.drive_file_id, driveName(doc))

  return reply(200, { ok: true })
})

const trash = signedIn(async (ctx) => {
  const id = typeof ctx.body.id === "string" ? ctx.body.id : ""
  if (!ID.test(id)) return reply(400, { error: "Unknown document." })
  const [doc] = await docsOf(ctx.env, ctx.me.id, id)
  if (!doc?.drive_file_id) return reply(200, { ok: true })
  const got = await connected(ctx)
  if (got instanceof Response) return got
  await trashIn(got.token, doc.drive_file_id)

  return reply(200, { ok: true })
})

const disconnect = signedIn(async (ctx) => {
  const link = await linkOf(ctx.env, ctx.me.id)
  if (!link) return reply(200, { connected: false })
  try {
    await pullAll(ctx.env, link, await accessFor(ctx.env, link))
  } catch {
    // Access already taken back in Google: the files stay in their Drive, the text stays here.
  }
  await svc(ctx.env, `drive_links?user_id=eq.${link.user_id}`, { method: "DELETE" })
  await revokeGoogle(link.refresh_token)

  return reply(200, { connected: false })
})

serveRoutes({ start, callback, sync, file, rename, trash, disconnect })
