// Google Drive for documents (migrations/20261010150000_google_drive.sql). Shared by the function `drive` (connect, sync,
// download, rename, delete) and `mcp` (a letter Claude saves goes to Drive too). Everything here runs with the service role:
// the refresh token never leaves the server.
//
// A document's file is in one of two places: the private bucket "documents" (drive_file_id null), or the person's Drive
// (drive_file_id set, the bucket copy removed). Uploads always land in the bucket first and are then moved, so the app's
// upload path stays one and the same whether Drive is connected or not.
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (a Google Cloud OAuth client, "Web application", with the redirect URI
// <SUPABASE_URL>/functions/v1/drive/callback and the scope drive.file).

const DRIVE = "https://www.googleapis.com/drive/v3/files"
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files"
const FOLDER = "application/vnd.google-apps.folder"

export const SCOPES = "https://www.googleapis.com/auth/drive.file openid email"
export const FOLDER_NAMES = { root: "odds", cv: "CVs", cover_letter: "Cover letters" } as const

export interface DriveEnv {
  url: string
  serviceKey: string
  clientId: string
  clientSecret: string
}

/** The settings Drive needs, or null when Google is not set up on this project (the app then hides Drive). */
export function driveEnv(): DriveEnv | null {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID")
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")
  if (!clientId || !clientSecret) return null

  return { url: Deno.env.get("SUPABASE_URL")!, serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, clientId, clientSecret }
}

export const redirectUri = (env: DriveEnv): string => `${env.url}/functions/v1/drive/callback`

export interface DriveLink {
  user_id: string
  email: string | null
  refresh_token: string
  root_id: string
  cv_folder_id: string
  letter_folder_id: string
}

export interface DocRow {
  id: string
  kind: "cv" | "cover_letter"
  name: string
  file_name: string
  mime: string
  path: string
  drive_file_id: string | null
  drive_md5: string | null
}

const DOC_COLUMNS = "id,kind,name,file_name,mime,path,drive_file_id,drive_md5"

/** Google said the person took the app's access back (or the token expired for good): the link is gone. */
export class DriveGone extends Error {}

type Init = { method?: string; body?: BodyInit; headers?: Record<string, string> }

export async function svc<T = unknown>(env: DriveEnv, path: string, init: Init = {}): Promise<T> {
  const r = await fetch(`${env.url}/rest/v1/${path}`, { method: init.method, body: init.body, headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json", ...init.headers } })
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()

  return (t ? JSON.parse(t) : null) as T
}

export async function linkOf(env: DriveEnv, uid: string): Promise<DriveLink | null> {
  const rows = await svc<DriveLink[]>(env, `drive_links?user_id=eq.${uid}&select=*`)

  return rows?.[0] ?? null
}

export async function docsOf(env: DriveEnv, uid: string, id?: string): Promise<DocRow[]> {
  return (await svc<DocRow[]>(env, `documents?user_id=eq.${uid}${id ? `&id=eq.${id}` : ""}&select=${DOC_COLUMNS}&order=created_at`)) ?? []
}

// ---------------------------------------------------------------- Google

/** Trades a code (connect) or a refresh token (every later call) for tokens. */
export async function googleToken(env: DriveEnv, grant: { code: string } | { refresh: string }): Promise<{ access_token: string; refresh_token?: string; id_token?: string }> {
  const body = new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret })
  if ("code" in grant) {
    body.set("grant_type", "authorization_code")
    body.set("code", grant.code)
    body.set("redirect_uri", redirectUri(env))
  } else {
    body.set("grant_type", "refresh_token")
    body.set("refresh_token", grant.refresh)
  }
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body, signal: AbortSignal.timeout(15_000) })
  const out = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; id_token?: string; error?: string }
  if (out.error === "invalid_grant") throw new DriveGone("Google access was taken back.")
  if (!r.ok || !out.access_token) throw new Error(`Google token: ${r.status} ${out.error ?? ""}`)

  return out as { access_token: string; refresh_token?: string; id_token?: string }
}

export async function revokeGoogle(refresh: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).catch(() => undefined)
}

/** A short-lived access token for this person's Drive. When Google has taken access back, the link is removed. */
export async function accessFor(env: DriveEnv, link: DriveLink): Promise<string> {
  try {
    return (await googleToken(env, { refresh: link.refresh_token })).access_token
  } catch (err) {
    if (err instanceof DriveGone) await svc(env, `drive_links?user_id=eq.${link.user_id}`, { method: "DELETE" }).catch(() => undefined)
    throw err
  }
}

async function g(token: string, url: string, init: Init = {}): Promise<Response> {
  return fetch(url, { method: init.method, body: init.body, headers: { Authorization: `Bearer ${token}`, ...init.headers }, signal: AbortSignal.timeout(30_000) })
}

async function makeFolder(token: string, name: string, parent?: string): Promise<string> {
  const r = await g(token, `${DRIVE}?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }) })
  if (!r.ok) throw new Error(`Drive folder: ${r.status}`)

  return ((await r.json()) as { id: string }).id
}

async function alive(token: string, id: string | null | undefined): Promise<boolean> {
  if (!id) return false
  const r = await g(token, `${DRIVE}/${encodeURIComponent(id)}?fields=trashed`)
  if (!r.ok) return false

  return !((await r.json()) as { trashed?: boolean }).trashed
}

/** The folders "odds", "odds/CVs" and "odds/Cover letters": the ones on the link when still there, made again when not. */
export async function ensureFolders(token: string, have?: Partial<Pick<DriveLink, "root_id" | "cv_folder_id" | "letter_folder_id">>): Promise<Pick<DriveLink, "root_id" | "cv_folder_id" | "letter_folder_id">> {
  const root = (await alive(token, have?.root_id)) ? have!.root_id! : await makeFolder(token, FOLDER_NAMES.root)
  const keep = root === have?.root_id
  const cv = keep && (await alive(token, have?.cv_folder_id)) ? have!.cv_folder_id! : await makeFolder(token, FOLDER_NAMES.cv, root)
  const letters = keep && (await alive(token, have?.letter_folder_id)) ? have!.letter_folder_id! : await makeFolder(token, FOLDER_NAMES.cover_letter, root)

  return { root_id: root, cv_folder_id: cv, letter_folder_id: letters }
}

/** The file name in Drive: the document's own name with the uploaded file's extension ("CV Finance.pdf"). */
export function driveName(doc: Pick<DocRow, "name" | "file_name">): string {
  const ext = /\.[a-z0-9]{1,5}$/i.exec(doc.file_name)?.[0] ?? ""

  return doc.name.toLowerCase().endsWith(ext.toLowerCase()) ? doc.name : `${doc.name}${ext}`
}

/**
 * The document name a Drive file name stands for: without the file's own extension, spaces tidied, at most 80 characters.
 * Null when it says nothing new (the same name, or empty), so only a real rename in Drive is taken over.
 */
export function nameFromDrive(driveFileName: string | undefined, doc: Pick<DocRow, "name" | "file_name">): string | null {
  if (!driveFileName) return null
  const ext = /\.[a-z0-9]{1,5}$/i.exec(doc.file_name)?.[0] ?? ""
  const bare = ext && driveFileName.toLowerCase().endsWith(ext.toLowerCase()) ? driveFileName.slice(0, -ext.length) : driveFileName
  const name = bare.replace(/\s+/g, " ").trim().slice(0, 80)
  if (!name || driveFileName === driveName(doc) || name === doc.name) return null

  return name
}

/** What a sync must do for one document, from what Drive says about its file now. */
export type Difference = { missing: true } | { changedMd5?: string; renamedTo?: string }

export function compareWithDrive(doc: Pick<DocRow, "name" | "file_name" | "drive_md5">, meta: DriveMeta | null): Difference {
  if (meta === null || meta.trashed) return { missing: true }
  const out: { changedMd5?: string; renamedTo?: string } = {}
  if (meta.md5Checksum && meta.md5Checksum !== doc.drive_md5) out.changedMd5 = meta.md5Checksum
  const renamed = nameFromDrive(meta.name, doc)
  if (renamed) out.renamedTo = renamed

  return out
}

async function uploadTo(token: string, folder: string, name: string, mime: string, bytes: Uint8Array): Promise<{ id: string; md5Checksum?: string }> {
  const boundary = `odds${crypto.randomUUID()}`
  const head = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folder] })}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`)
  const tail = new TextEncoder().encode(`\r\n--${boundary}--`)
  const body = new Uint8Array(head.length + bytes.length + tail.length)
  body.set(head, 0)
  body.set(bytes, head.length)
  body.set(tail, head.length + bytes.length)
  const r = await g(token, `${UPLOAD}?uploadType=multipart&fields=id,md5Checksum`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body })
  if (!r.ok) throw new Error(`Drive upload: ${r.status}`)

  return (await r.json()) as { id: string; md5Checksum?: string }
}

export interface DriveMeta {
  name?: string
  md5Checksum?: string
  trashed?: boolean
}

/** What Drive has for a file now, or null when it is gone (deleted for good, or no longer the app's to see). */
export async function metaOf(token: string, fileId: string): Promise<DriveMeta | null> {
  const r = await g(token, `${DRIVE}/${encodeURIComponent(fileId)}?fields=name,md5Checksum,trashed`)
  if (r.status === 404 || r.status === 403) return null
  if (!r.ok) throw new Error(`Drive file: ${r.status}`)

  return (await r.json()) as DriveMeta
}

export async function contentOf(token: string, fileId: string): Promise<Response> {
  return g(token, `${DRIVE}/${encodeURIComponent(fileId)}?alt=media`)
}

export async function renameIn(token: string, fileId: string, name: string): Promise<void> {
  await g(token, `${DRIVE}/${encodeURIComponent(fileId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
}

/** To the Drive bin, never deleted for good: the person can still get it back from there for 30 days. */
export async function trashIn(token: string, fileId: string): Promise<void> {
  await g(token, `${DRIVE}/${encodeURIComponent(fileId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) })
}

// ---------------------------------------------------------------- the bucket

const objectUrl = (env: DriveEnv, path: string): string => `${env.url}/storage/v1/object/documents/${path.split("/").map(encodeURIComponent).join("/")}`

async function readBucket(env: DriveEnv, path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const r = await fetch(objectUrl(env, path), { headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}` } })

  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null
}

async function writeBucket(env: DriveEnv, path: string, mime: string, bytes: Uint8Array<ArrayBuffer>): Promise<boolean> {
  const r = await fetch(objectUrl(env, path), { method: "POST", headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": mime, "x-upsert": "true" }, body: bytes })

  return r.ok
}

async function dropBucket(env: DriveEnv, path: string): Promise<void> {
  await fetch(`${env.url}/storage/v1/object/documents`, { method: "DELETE", headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [path] }) }).catch(() => undefined)
}

// ---------------------------------------------------------------- moving files

/**
 * Moves one document's file from the bucket into the person's Drive folder for its kind, then removes the bucket copy. Does
 * nothing for a file already in Drive. The bucket copy goes only after Drive has the file and the row points at it.
 */
export async function pushDoc(env: DriveEnv, link: DriveLink, token: string, doc: DocRow): Promise<boolean> {
  if (doc.drive_file_id) return false
  const bytes = await readBucket(env, doc.path)
  if (!bytes) return false
  const folder = doc.kind === "cv" ? link.cv_folder_id : link.letter_folder_id
  const made = await uploadTo(token, folder, driveName(doc), doc.mime, bytes)
  await svc(env, `documents?id=eq.${doc.id}&user_id=eq.${link.user_id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ drive_file_id: made.id, drive_md5: made.md5Checksum ?? null }) })
  await dropBucket(env, doc.path)

  return true
}

/** Moves every document still in the bucket to Drive. Returns how many moved; one failing never stops the others. */
export async function pushAll(env: DriveEnv, link: DriveLink, token: string): Promise<number> {
  let moved = 0
  for (const doc of await docsOf(env, link.user_id)) {
    if (doc.drive_file_id) continue
    try {
      if (await pushDoc(env, link, token, doc)) moved++
    } catch {
      // Left in the bucket: the next sync tries again.
    }
  }

  return moved
}

/** Brings every Drive file back into the bucket (disconnecting), so downloads keep working without Drive. */
export async function pullAll(env: DriveEnv, link: DriveLink, token: string): Promise<void> {
  for (const doc of await docsOf(env, link.user_id)) {
    if (!doc.drive_file_id) continue
    try {
      const r = await contentOf(token, doc.drive_file_id)
      if (!r.ok || !(await writeBucket(env, doc.path, doc.mime, new Uint8Array(await r.arrayBuffer())))) continue
      await svc(env, `documents?id=eq.${doc.id}&user_id=eq.${link.user_id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ drive_file_id: null, drive_md5: null }) })
    } catch {
      // Stays pointing at Drive: its text is still here, only the original file is out of reach.
    }
  }
}

/** For a function that saved a document straight into the bucket (Claude's letters): move it to Drive when connected. */
export async function pushIfConnected(uid: string, docId: string): Promise<void> {
  const env = driveEnv()
  if (!env) return
  const link = await linkOf(env, uid)
  if (!link) return
  const [doc] = await docsOf(env, uid, docId)
  if (!doc) return
  await pushDoc(env, link, await accessFor(env, link), doc)
}

export interface SyncOutcome {
  moved: number
  changed: Array<{ id: string; md5: string }>
  missing: string[]
  renamed: Array<{ id: string; name: string }>
}

/**
 * One sync for a connected person: files not yet in Drive are moved there; then every Drive file is checked. An edited file is
 * reported (the browser reads it again: it has the readers), a deleted one is reported, and a rename in Drive becomes the
 * document's name. When that name is already taken by another document, the Drive file gets the odds name back instead.
 */
export async function syncDocs(env: DriveEnv, link: DriveLink, token: string): Promise<SyncOutcome> {
  const moved = await pushAll(env, link, token)
  const out: SyncOutcome = { moved, changed: [], missing: [], renamed: [] }
  for (const doc of await docsOf(env, link.user_id)) {
    if (!doc.drive_file_id) continue
    let meta: DriveMeta | null
    try {
      meta = await metaOf(token, doc.drive_file_id)
    } catch {
      continue
    }
    const diff = compareWithDrive(doc, meta)
    if ("missing" in diff) {
      out.missing.push(doc.id)
      continue
    }
    if (diff.changedMd5) out.changed.push({ id: doc.id, md5: diff.changedMd5 })
    if (diff.renamedTo) {
      try {
        await svc(env, `documents?id=eq.${doc.id}&user_id=eq.${link.user_id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ name: diff.renamedTo }) })
        out.renamed.push({ id: doc.id, name: diff.renamedTo })
      } catch {
        await renameIn(token, doc.drive_file_id, driveName(doc)).catch(() => undefined)
      }
    }
  }

  return out
}
