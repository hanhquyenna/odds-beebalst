import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import {
  DriveGone,
  accessFor,
  compareWithDrive,
  driveName,
  ensureFolders,
  linkOf,
  nameFromDrive,
  pullAll,
  pushDoc,
  pushIfConnected,
  syncDocs,
  type DocRow,
  type DriveEnv,
  type DriveLink,
} from "../../supabase/functions/_shared/drive.ts"

/**
 * The Drive code the edge functions run (supabase/functions/_shared/drive.ts), against a pretend Google Drive and a pretend
 * Supabase held in memory: every fetch it makes is answered here, so the whole round trip (folders, moving files, both ways of
 * syncing, disconnecting) is checked without a Google account.
 */

const URL_ = "https://project.supabase.co"
const env: DriveEnv = { url: URL_, serviceKey: "service", clientId: "client", clientSecret: "secret" }
const ME = "11111111-1111-1111-1111-111111111111"
const OTHER = "22222222-2222-2222-2222-222222222222"
let grantedScope = "openid https://www.googleapis.com/auth/drive.file email"

interface FakeFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  trashed: boolean
  content: Uint8Array
}

let docs: Array<DocRow & { user_id: string }>
let links: DriveLink[]
let bucket: Map<string, Uint8Array>
let drive: Map<string, FakeFile>
let revoked: string[]
let grantGone: boolean
let nextId: number
const realFetch = globalThis.fetch

const md5 = (b: Uint8Array): string => new Bun.CryptoHasher("md5").update(b).digest("hex")
const text = (b: Uint8Array | undefined): string => new TextDecoder().decode(b)
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s)
const json = (status: number, body: unknown): Response => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

function asBytes(body: BodyInit | null | undefined): Uint8Array {
  if (body instanceof Uint8Array) return body
  if (body instanceof URLSearchParams) return bytes(body.toString())
  if (typeof body === "string") return bytes(body)

  return new Uint8Array()
}

function eqParams(u: URL): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of u.searchParams) if (v.startsWith("eq.")) out[k] = v.slice(3)

  return out
}

function rest(u: URL, method: string, body: Uint8Array): Response {
  const table = u.pathname.split("/").at(-1)
  const where = eqParams(u)
  const match = (r: object): boolean => Object.entries(where).every(([k, v]) => String((r as Record<string, unknown>)[k]) === v)
  if (table === "documents") {
    if (method === "GET") return json(200, docs.filter(match))
    if (method === "PATCH") {
      const patch = JSON.parse(text(body)) as Partial<DocRow>
      for (const d of docs.filter(match)) {
        if (patch.name && docs.some((o) => o.id !== d.id && o.user_id === d.user_id && o.kind === d.kind && o.name.toLowerCase() === patch.name!.toLowerCase())) {
          return json(409, { code: "23505", message: "documents_name_unique" })
        }
        Object.assign(d, patch)
      }

      return json(204, undefined)
    }
  }
  if (table === "drive_links") {
    if (method === "GET") return json(200, links.filter(match))
    if (method === "DELETE") {
      links = links.filter((l) => !match(l))
      return json(204, undefined)
    }
    if (method === "PATCH") {
      for (const l of links.filter((l) => match(l))) Object.assign(l, JSON.parse(text(body)))
      return json(204, undefined)
    }
  }

  return json(404, { message: `no fake for ${method} ${table}` })
}

function storage(u: URL, method: string, body: Uint8Array): Response {
  const path = decodeURIComponent(u.pathname.replace("/storage/v1/object/documents", "").replace(/^\//, ""))
  if (method === "GET") return bucket.has(path) ? new Response(bucket.get(path)) : json(404, {})
  if (method === "POST") {
    bucket.set(path, body)
    return json(200, {})
  }
  if (method === "DELETE") {
    for (const p of (JSON.parse(text(body)) as { prefixes: string[] }).prefixes) bucket.delete(p)
    return json(200, [])
  }

  return json(405, {})
}

function newFile(meta: { name: string; mimeType?: string; parents?: string[] }, content = new Uint8Array()): FakeFile {
  const f: FakeFile = { id: `f${nextId++}`, name: meta.name, mimeType: meta.mimeType ?? "application/octet-stream", parents: meta.parents ?? [], trashed: false, content }
  drive.set(f.id, f)

  return f
}

function google(u: URL, method: string, body: Uint8Array, headers: Record<string, string>): Response {
  if (u.hostname === "oauth2.googleapis.com" && u.pathname === "/token") {
    const form = new URLSearchParams(text(body))
    if (form.get("grant_type") === "authorization_code") {
      if (form.get("code") !== "good-code" || form.get("redirect_uri") !== `${URL_}/functions/v1/drive/callback`) return json(400, { error: "invalid_grant" })
      const claims = btoa(JSON.stringify({ email: "me@gmail.com" })).replace(/=+$/, "")
      return json(200, { access_token: "access", refresh_token: "refresh-new", id_token: `h.${claims}.s` })
    }
    return grantGone ? json(400, { error: "invalid_grant" }) : json(200, { access_token: "access" })
  }
  if (u.hostname === "oauth2.googleapis.com" && u.pathname === "/tokeninfo") {
    return json(200, { scope: grantedScope })
  }
  if (u.hostname === "oauth2.googleapis.com" && u.pathname === "/revoke") {
    revoked.push(u.searchParams.get("token") ?? "")
    return json(200, {})
  }
  if (headers.Authorization !== "Bearer access") return json(401, {})
  if (u.pathname === "/upload/drive/v3/files" && method === "POST") {
    // multipart/related: the metadata part, then the file part.
    const boundary = /boundary=(.+)$/.exec(headers["Content-Type"])![1]
    const raw = text(body)
    const parts = raw.split(`--${boundary}`).slice(1, 3).map((p) => p.slice(p.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, ""))
    const f = newFile(JSON.parse(parts[0]) as { name: string; parents: string[] }, bytes(parts[1]))
    return json(200, { id: f.id, md5Checksum: md5(f.content) })
  }
  const id = /^\/drive\/v3\/files\/?(.*)$/.exec(u.pathname)?.[1]
  if (id === undefined) return json(404, {})
  if (id === "" && method === "POST") return json(200, { id: newFile(JSON.parse(text(body)) as { name: string; mimeType: string; parents?: string[] }).id })
  const f = drive.get(decodeURIComponent(id))
  if (!f) return json(404, {})
  if (method === "GET" && u.searchParams.get("alt") === "media") return new Response(f.content)
  if (method === "GET") return json(200, { name: f.name, md5Checksum: f.mimeType.includes("folder") ? undefined : md5(f.content), trashed: f.trashed })
  if (method === "PATCH") {
    Object.assign(f, JSON.parse(text(body)))
    return json(200, { id: f.id })
  }

  return json(405, {})
}

function fakeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  const method = (init.method ?? "GET").toUpperCase()
  const headers = (init.headers ?? {}) as Record<string, string>
  const body = asBytes(init.body as BodyInit | undefined)
  if (u.origin === URL_ && u.pathname === "/auth/v1/user") {
    const who = { "Bearer user-token": { id: ME, email: "me@gmail.com" }, "Bearer other-token": { id: OTHER, email: "other@gmail.com" }, "Bearer guest-token": { id: OTHER, email: "x@guest.odds.invalid" } }[headers.Authorization]
    return Promise.resolve(who ? json(200, who) : json(401, {}))
  }
  if (u.origin === URL_ && u.pathname === "/rest/v1/drive_links" && method === "POST") {
    const row = JSON.parse(text(body)) as DriveLink
    links = [...links.filter((l) => l.user_id !== row.user_id), row]
    return Promise.resolve(json(201, undefined))
  }
  if (u.origin === URL_ && u.pathname.startsWith("/rest/v1/")) return Promise.resolve(rest(u, method, body))
  if (u.origin === URL_ && u.pathname.startsWith("/storage/v1/object/documents")) return Promise.resolve(storage(u, method, body))

  return Promise.resolve(google(u, method, body, headers))
}

function addDoc(over: Partial<DocRow> = {}): DocRow & { user_id: string } {
  const id = over.id ?? crypto.randomUUID()
  const d = { id, user_id: ME, kind: "cv" as const, name: "CV Finance", file_name: "cv_finance.pdf", mime: "application/pdf", path: `${ME}/${id}`, drive_file_id: null, drive_md5: null, ...over }
  docs.push(d)

  return d
}

async function connect(): Promise<DriveLink> {
  const link: DriveLink = { user_id: ME, email: "me@gmail.com", refresh_token: "refresh", ...(await ensureFolders("access")) }
  links.push(link)

  return link
}

beforeEach(() => {
  docs = []
  links = []
  bucket = new Map()
  drive = new Map()
  revoked = []
  grantGone = false
  nextId = 1
  grantedScope = "openid https://www.googleapis.com/auth/drive.file email"
  globalThis.fetch = fakeFetch as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("folders", () => {
  test("connecting makes odds, with CVs and Cover letters inside it", async () => {
    const f = await ensureFolders("access")
    expect(drive.get(f.root_id)).toMatchObject({ name: "odds", parents: [] })
    expect(drive.get(f.cv_folder_id)).toMatchObject({ name: "CVs", parents: [f.root_id] })
    expect(drive.get(f.letter_folder_id)).toMatchObject({ name: "Cover letters", parents: [f.root_id] })
  })

  test("folders still there are kept; a folder put in the bin is made again", async () => {
    const first = await ensureFolders("access")
    expect(await ensureFolders("access", first)).toEqual(first)
    drive.get(first.cv_folder_id)!.trashed = true
    const again = await ensureFolders("access", first)
    expect(again.root_id).toBe(first.root_id)
    expect(again.cv_folder_id).not.toBe(first.cv_folder_id)
    expect(again.letter_folder_id).toBe(first.letter_folder_id)
  })
})

describe("moving files to Drive", () => {
  test("a CV goes into odds/CVs under its own name, and leaves the bucket", async () => {
    const link = await connect()
    const d = addDoc()
    bucket.set(d.path, bytes("%PDF my cv"))
    expect(await pushDoc(env, link, "access", d)).toBe(true)
    const f = drive.get(d.drive_file_id!)!
    expect(f).toMatchObject({ name: "CV Finance.pdf", parents: [link.cv_folder_id] })
    expect(text(f.content)).toBe("%PDF my cv")
    expect(d.drive_md5).toBe(md5(bytes("%PDF my cv")))
    expect(bucket.has(d.path)).toBe(false)
  })

  test("a cover letter goes into odds/Cover letters; a file already in Drive is left alone", async () => {
    const link = await connect()
    const d = addDoc({ kind: "cover_letter", name: "Letter Philips", file_name: "Letter Philips.txt", mime: "text/plain" })
    bucket.set(d.path, bytes("Dear team"))
    await pushDoc(env, link, "access", d)
    expect(drive.get(d.drive_file_id!)).toMatchObject({ name: "Letter Philips.txt", parents: [link.letter_folder_id] })
    const before = drive.size
    expect(await pushDoc(env, link, "access", d)).toBe(false)
    expect(drive.size).toBe(before)
  })

  test("Claude's saved letter follows when Drive is connected, and stays put when it is not", async () => {
    ;(globalThis as { Deno?: unknown }).Deno = { env: { get: (k: string) => ({ GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "service" })[k] } }
    try {
      const d = addDoc({ kind: "cover_letter", name: "From Claude", file_name: "From Claude.txt", mime: "text/plain" })
      bucket.set(d.path, bytes("Letter"))
      await pushIfConnected(ME, d.id)
      expect(d.drive_file_id).toBeNull()
      await connect()
      await pushIfConnected(ME, d.id)
      expect(d.drive_file_id).not.toBeNull()
      expect(bucket.has(d.path)).toBe(false)
    } finally {
      delete (globalThis as { Deno?: unknown }).Deno
    }
  })
})

describe("syncing both ways", () => {
  async function inDrive(over: Partial<DocRow> = {}, content = "%PDF v1"): Promise<{ link: DriveLink; d: DocRow }> {
    const link = links[0] ?? (await connect())
    const d = addDoc(over)
    bucket.set(d.path, bytes(content))
    await pushDoc(env, link, "access", d)

    return { link, d }
  }

  test("nothing changed: nothing to do", async () => {
    const { link } = await inDrive()
    expect(await syncDocs(env, link, "access")).toEqual({ moved: 0, changed: [], missing: [], renamed: [] })
  })

  test("a file left in the bucket (Drive was down) is moved on the next sync", async () => {
    const link = await connect()
    const d = addDoc()
    bucket.set(d.path, bytes("%PDF"))
    expect((await syncDocs(env, link, "access")).moved).toBe(1)
    expect(d.drive_file_id).not.toBeNull()
  })

  test("a file edited in Drive is reported with its new checksum, once", async () => {
    const { link, d } = await inDrive()
    drive.get(d.drive_file_id!)!.content = bytes("%PDF v2 with a new job")
    const out = await syncDocs(env, link, "access")
    expect(out.changed).toEqual([{ id: d.id, md5: md5(bytes("%PDF v2 with a new job")) }])
    // The browser reads it again and stores the checksum it read: then it is the same again.
    d.drive_md5 = out.changed[0].md5
    expect((await syncDocs(env, link, "access")).changed).toEqual([])
  })

  test("a rename in Drive becomes the document's name", async () => {
    const { link, d } = await inDrive()
    drive.get(d.drive_file_id!)!.name = "CV Finance 2026.pdf"
    expect((await syncDocs(env, link, "access")).renamed).toEqual([{ id: d.id, name: "CV Finance 2026" }])
    expect(d.name).toBe("CV Finance 2026")
    expect((await syncDocs(env, link, "access")).renamed).toEqual([])
  })

  test("a rename in Drive to a name another CV has: the Drive file gets the odds name back", async () => {
    const { link, d } = await inDrive({ name: "CV Finance" })
    await inDrive({ name: "CV Tech", file_name: "tech.pdf" }, "%PDF tech")
    drive.get(d.drive_file_id!)!.name = "CV Tech.pdf"
    expect((await syncDocs(env, link, "access")).renamed).toEqual([])
    expect(d.name).toBe("CV Finance")
    expect(drive.get(d.drive_file_id!)!.name).toBe("CV Finance.pdf")
  })

  test("a file put in the bin or deleted in Drive is reported missing", async () => {
    const { link, d } = await inDrive()
    const { d: e } = await inDrive({ name: "CV Two", file_name: "two.pdf" }, "%PDF two")
    drive.get(d.drive_file_id!)!.trashed = true
    drive.delete(e.drive_file_id!)
    expect((await syncDocs(env, link, "access")).missing.sort()).toEqual([d.id, e.id].sort())
  })
})

describe("disconnecting and losing access", () => {
  test("disconnecting brings every file back into the bucket and clears the Drive ids", async () => {
    const link = await connect()
    const d = addDoc()
    bucket.set(d.path, bytes("%PDF original"))
    await pushDoc(env, link, "access", d)
    drive.get(d.drive_file_id!)!.content = bytes("%PDF edited in Drive")
    await pullAll(env, link, "access")
    expect(text(bucket.get(d.path))).toBe("%PDF edited in Drive")
    expect(d.drive_file_id).toBeNull()
    expect(d.drive_md5).toBeNull()
  })

  test("access taken back in Google: the link is dropped and the caller is told", async () => {
    const link = await connect()
    grantGone = true
    let thrown: unknown
    try {
      await accessFor(env, link)
    } catch (err) {
      thrown = err
    }
    expect(thrown).toBeInstanceOf(DriveGone)
    expect(await linkOf(env, ME)).toBeNull()
  })
})

describe("names", () => {
  const doc = { name: "CV Finance", file_name: "cv.pdf", drive_md5: "a" }

  test("the Drive name is the document's name with the file's extension", () => {
    expect(driveName(doc)).toBe("CV Finance.pdf")
    expect(driveName({ name: "notes.pdf", file_name: "x.pdf" })).toBe("notes.pdf")
    expect(driveName({ name: "Letter", file_name: "noext" })).toBe("Letter")
  })

  test("only a real rename counts", () => {
    expect(nameFromDrive("CV Finance.pdf", doc)).toBeNull()
    expect(nameFromDrive("  CV   Finance  ", doc)).toBeNull()
    expect(nameFromDrive("CV Banking.pdf", doc)).toBe("CV Banking")
    expect(nameFromDrive("CV Banking.PDF", doc)).toBe("CV Banking")
    expect(nameFromDrive("   ", doc)).toBeNull()
    expect(nameFromDrive(undefined, doc)).toBeNull()
    expect(nameFromDrive(`${"x".repeat(120)}.pdf`, doc)).toHaveLength(80)
  })

  test("what a sync does for one file", () => {
    expect(compareWithDrive(doc, null)).toEqual({ missing: true })
    expect(compareWithDrive(doc, { trashed: true })).toEqual({ missing: true })
    expect(compareWithDrive(doc, { name: "CV Finance.pdf", md5Checksum: "a" })).toEqual({})
    expect(compareWithDrive(doc, { name: "New.pdf", md5Checksum: "b" })).toEqual({ changedMd5: "b", renamedTo: "New" })
  })
})

describe("the drive function, route by route", () => {
  let handler: (req: Request) => Promise<Response>
  const fn = (route: string): string => `${URL_}/functions/v1/drive/${route}`
  const post = (route: string, token: string | null, body: unknown = {}): Promise<Response> =>
    handler(new Request(fn(route), { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }))

  beforeEach(async () => {
    const vars: Record<string, string> = { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: "service", SUPABASE_ANON_KEY: "anon", SHOO_APP_ORIGINS: "https://odds.example" }
    ;(globalThis as { Deno?: unknown }).Deno = {
      env: { get: (k: string) => vars[k] },
      serve: (h: (req: Request) => Promise<Response>) => {
        handler = h
      },
    }
    // Loaded once; Deno.serve hands over the handler. Later tests reuse it.
    if (!handler) await import("../../supabase/functions/drive/index.ts")
  })

  afterEach(() => {
    delete (globalThis as { Deno?: unknown }).Deno
  })

  async function startUrl(returnTo = "https://odds.example/"): Promise<URL> {
    const r = await post("start", "user-token", { returnTo })
    expect(r.status).toBe(200)

    return new URL(((await r.json()) as { url: string }).url)
  }

  test("start: asks Google for drive.file only, offline, for this person, and coming back here", async () => {
    const u = await startUrl()
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/drive.file openid email")
    expect(u.searchParams.get("access_type")).toBe("offline")
    expect(u.searchParams.get("redirect_uri")).toBe(`${URL_}/functions/v1/drive/callback`)
    expect(u.searchParams.get("login_hint")).toBe("me@gmail.com")
  })

  test("start: refused without a sign-in, for a guest, and for a return address that is not ours", async () => {
    expect((await post("start", null, { returnTo: "https://odds.example/" })).status).toBe(401)
    expect((await post("start", "guest-token", { returnTo: "https://odds.example/" })).status).toBe(403)
    expect((await post("start", "user-token", { returnTo: "https://evil.example/" })).status).toBe(400)
    expect((await post("start", "user-token", { returnTo: "http://localhost:5173/" })).status).toBe(200)
  })

  test("callback: keeps the link, makes the folders, moves the files, and goes back to the app", async () => {
    const d = addDoc()
    bucket.set(d.path, bytes("%PDF mine"))
    const state = (await startUrl()).searchParams.get("state")!
    const r = await handler(new Request(`${fn("callback")}?code=good-code&state=${encodeURIComponent(state)}`))
    expect(r.status).toBe(302)
    expect(r.headers.get("Location")).toBe("https://odds.example/?drive=connected")
    const link = links[0]
    expect(link).toMatchObject({ user_id: ME, email: "me@gmail.com", refresh_token: "refresh-new" })
    expect(drive.get(link.root_id)!.name).toBe("odds")
    expect(drive.get(d.drive_file_id!)).toMatchObject({ name: "CV Finance.pdf", parents: [link.cv_folder_id] })
    expect(bucket.has(d.path)).toBe(false)
  })

  test("callback: connecting again keeps the same folders and lets go of the old token", async () => {
    const first = await connect()
    const state = (await startUrl()).searchParams.get("state")!
    await handler(new Request(`${fn("callback")}?code=good-code&state=${encodeURIComponent(state)}`))
    expect(links).toHaveLength(1)
    expect(links[0].root_id).toBe(first.root_id)
    expect(revoked).toEqual(["refresh"])
  })

  test("callback: a changed or made-up state is refused; 'cancel' on Google and an unticked Drive box go back as cancelled", async () => {
    const state = (await startUrl()).searchParams.get("state")!
    const [body] = state.split(".")
    const forged = `${btoa(JSON.stringify({ u: OTHER, r: "https://odds.example/", e: Date.now() + 60_000 })).replace(/=+$/, "")}.${state.split(".")[1]}`
    expect((await handler(new Request(`${fn("callback")}?code=good-code&state=${encodeURIComponent(forged)}`))).status).toBe(400)
    expect((await handler(new Request(`${fn("callback")}?code=good-code&state=${body}.bad`))).status).toBe(400)
    expect((await handler(new Request(`${fn("callback")}?error=access_denied&state=${encodeURIComponent(state)}`))).headers.get("Location")).toBe("https://odds.example/?drive=cancelled")
    grantedScope = "openid email"
    expect((await handler(new Request(`${fn("callback")}?code=good-code&state=${encodeURIComponent(state)}`))).headers.get("Location")).toBe("https://odds.example/?drive=cancelled")
    expect(links).toHaveLength(0)
  })

  test("sync: says what changed, takes over a rename, and links the folder", async () => {
    const link = await connect()
    const d = addDoc()
    bucket.set(d.path, bytes("%PDF"))
    await pushDoc(env, link, "access", d)
    drive.get(d.drive_file_id!)!.name = "CV Banking.pdf"
    const r = await post("sync", "user-token")
    expect(r.status).toBe(200)
    const out = (await r.json()) as { folder: string; renamed: unknown; changed: unknown; missing: unknown; moved: number }
    expect(out).toMatchObject({ folder: `https://drive.google.com/drive/folders/${link.root_id}`, renamed: [{ id: d.id, name: "CV Banking" }], changed: [], missing: [], moved: 0 })
  })

  test("sync without Drive connected says so, so the app shows Connect again", async () => {
    const r = await post("sync", "user-token")
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ connected: false })
  })

  test("file: gives back the original from Drive; never another person's", async () => {
    const link = await connect()
    const d = addDoc()
    bucket.set(d.path, bytes("%PDF original bytes"))
    await pushDoc(env, link, "access", d)
    const r = await post("file", "user-token", { id: d.id })
    expect(r.status).toBe(200)
    expect(await r.text()).toBe("%PDF original bytes")
    expect((await post("file", "other-token", { id: d.id })).status).toBe(404)
    expect((await post("file", "user-token", { id: "not-an-id" })).status).toBe(400)
  })

  test("rename and trash: the Drive file follows the app", async () => {
    const link = await connect()
    const d = addDoc()
    bucket.set(d.path, bytes("%PDF"))
    await pushDoc(env, link, "access", d)
    docs[0].name = "CV Renamed in odds"
    await post("rename", "user-token", { id: d.id })
    expect(drive.get(d.drive_file_id!)!.name).toBe("CV Renamed in odds.pdf")
    await post("trash", "user-token", { id: d.id })
    expect(drive.get(d.drive_file_id!)!.trashed).toBe(true)
  })

  test("disconnect: files come back, the link and Google's access are gone", async () => {
    const link = await connect()
    const d = addDoc()
    bucket.set(d.path, bytes("%PDF"))
    await pushDoc(env, link, "access", d)
    const r = await post("disconnect", "user-token")
    expect(await r.json()).toEqual({ connected: false })
    expect(bucket.has(d.path)).toBe(true)
    expect(d.drive_file_id).toBeNull()
    expect(links).toHaveLength(0)
    expect(revoked).toEqual(["refresh"])
  })

  test("access taken back in Google: sync answers 'not connected' and the link is dropped", async () => {
    await connect()
    grantGone = true
    const r = await post("sync", "user-token")
    expect(r.status).toBe(409)
    expect(links).toHaveLength(0)
  })
})
