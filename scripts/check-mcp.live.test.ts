/**
 * The odds connector end to end, against the real database with a throwaway account (made, used and deleted here): every tool a person
 * reaches through Claude, what each writes, and that one person never sees another's rows.
 *
 *   LIVE_MCP=1 bun test scripts/check-mcp.live.test.ts                 runs supabase/functions/mcp/server.ts in this process
 *   LIVE_MCP=1 MCP_URL=https://<ref>.supabase.co/functions/v1/mcp bun test scripts/check-mcp.live.test.ts    the deployed function
 *
 * Needs SUPABASE_ACCESS_TOKEN (.env.secrets) for the project's keys. Skipped without LIVE_MCP=1, so `bun test` never touches the database.
 */
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test"
import * as PDFLib from "pdf-lib"

const LIVE = process.env.LIVE_MCP === "1"
const REF = "ukpmpyfcnbhngkgbnkxi"
const URL_ = `https://${REF}.supabase.co`
const REMOTE = process.env.MCP_URL

type Json = any
const run = LIVE ? describe : describe.skip

interface Who {
  id: string
  key: string
  email: string
}

let service = ""
let anon = ""
const made: Who[] = []
let handle: (req: Request, env: { url: string; anonKey: string; serviceKey: string }) => Promise<Response>

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
const sha = async (s: string): Promise<string> => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))))

async function db(path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<Json> {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { method: init.method ?? "GET", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: init.prefer ?? "return=representation" }, body: init.body === undefined ? undefined : JSON.stringify(init.body) })
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`)
  const t = await r.text()

  return t ? JSON.parse(t) : null
}

async function newUser(label: string): Promise<Who> {
  const email = `e2e-mcp-${label}-${crypto.randomUUID().slice(0, 8)}@example.com`
  const r = await fetch(`${URL_}/auth/v1/admin/users`, { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ email, email_confirm: true }) })
  if (!r.ok) throw new Error(`user: ${r.status} ${await r.text()}`)
  const id = ((await r.json()) as Json).id as string
  const key = `odds_${hex(crypto.getRandomValues(new Uint8Array(24)))}`
  await db("mcp_keys", { method: "POST", body: { user_id: id, key_hash: await sha(key), hint: "e2e" }, prefer: "return=minimal" })
  const who = { id, key, email }
  made.push(who)

  return who
}

async function rpc(who: Who, method: string, params: Json = {}): Promise<Json> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${who.key}`, Accept: "application/json, text/event-stream" }
  const res = REMOTE ? await fetch(REMOTE, { method: "POST", headers, body }) : await handle(new Request(`${URL_}/functions/v1/mcp`, { method: "POST", headers, body }), { url: URL_, anonKey: anon, serviceKey: service })
  expect(res.status).toBe(200)

  return (await res.json()) as Json
}

/** A tool call: the data it returned, or the message it failed with. */
async function tool(who: Who, name: string, args: Json = {}): Promise<{ ok: boolean; data: Json; message: string }> {
  const out = await rpc(who, "tools/call", { name, arguments: args })
  const result = out.result
  const message = String(result?.content?.[0]?.text ?? "")

  if (result?.isError && process.env.DEBUG_MCP) console.log(`TOOL ${name} FAILED: ${message}`)

  return { ok: !result?.isError, data: result?.structuredContent ?? null, message }
}

let a: Who
let b: Who
let jobs: Array<{ id: string; title: string }> = []
const CV = { name: "Test Person", headline: "Finance student", contact: { email: "test@example.com", phone: "+31 6 00000000", place: "Amsterdam, Netherlands" }, summary: "Finance student.", experience: [{ title: "Finance Intern", company: "Acme", location: "Amsterdam", start: "Jan 2025", end: "Jun 2025", bullets: ["Built monthly reports in Excel"] }], education: [{ school: "University of Amsterdam", degree: "BSc", field: "Economics", start: "Sep 2022", end: "Jun 2026" }], skills: [{ label: "Tools", items: ["Excel", "SQL"] }], languages: ["English (fluent)"] }

beforeAll(async () => {
  if (!LIVE) return
  const keys = (await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } })).json()) as Array<{ name: string; api_key: string }>
  service = keys.find((k) => k.name === "service_role")!.api_key
  anon = keys.find((k) => k.name === "anon")!.api_key
  if (!REMOTE) {
    ;(globalThis as Json).Deno = { env: { get: () => undefined } }
    mock.module("npm:pdf-lib@1.17.1", () => PDFLib)
    handle = (await import("../supabase/functions/mcp/server.ts")).handle
  }
  a = await newUser("a")
  b = await newUser("b")
  jobs = (await db("app_jobs?select=id,title&level_view=eq.Internship&limit=3")) as typeof jobs
  await db("saved_jobs", { method: "POST", body: { user_id: a.id, posting_id: jobs[0].id }, prefer: "return=minimal" })
  await db("profiles", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      user_id: a.id,
      data: {
        onboarded: true,
        name: "Test Person",
        positions: [{ Title: "Finance Intern", "Company Name": "Acme", "Started On": "Jan 2025", "Finished On": "Jun 2025" }],
        education: [{ "School Name": "University of Amsterdam", "Degree Name": "BSc Economics" }],
        people: [
          { id: "p-1", name: "Ada Lovelace", role: "Finance Manager", company: "Acme", jobId: jobs[0].id, status: "To contact", contact: "https://www.linkedin.com/in/ada", notes: "", place: "Amsterdam" },
          { id: "p-2", name: "Bo Other", role: "HR", company: "Other", jobId: jobs[1].id, status: "To contact", contact: "https://www.linkedin.com/in/bo", notes: "" },
        ],
        peopleFound: { [jobs[0].id]: { pool: [{ url: "https://www.linkedin.com/in/ada", name: "Ada Lovelace", headline: "Finance Manager" }, { url: "https://www.linkedin.com/in/cy", name: "Cy Newperson", headline: "Recruiter", place: "Utrecht" }] } },
      },
    },
  })
  await db("documents", { method: "POST", prefer: "return=minimal", body: { id: crypto.randomUUID(), user_id: a.id, kind: "cv", name: "Main CV", file_name: "main.txt", mime: "text/plain", size_bytes: 4, content_hash: await sha("main"), body: "MAIN CV TEXT", path: `${a.id}/main`, is_main: true } })
}, 120_000)

afterAll(async () => {
  if (!LIVE) return
  for (const w of made) {
    const docs = (await db(`documents?user_id=eq.${w.id}&select=path`).catch(() => [])) as Array<{ path: string }>
    for (const d of docs) await fetch(`${URL_}/storage/v1/object/documents/${d.path}`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } }).catch(() => undefined)
    await fetch(`${URL_}/auth/v1/admin/users/${w.id}`, { method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` } }).catch(() => undefined)
  }
}, 60_000)

run("the connector, as a signed-in person", () => {
  test("a call without a key is sent to sign in, and a call with a wrong key too", async () => {
    const none = REMOTE ? await fetch(REMOTE, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }) : await handle(new Request(`${URL_}/functions/v1/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), { url: URL_, anonKey: anon, serviceKey: service })
    expect(none.status).toBe(401)
    const wrong = await (REMOTE ? fetch(REMOTE, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer odds_${"0".repeat(48)}` }, body: "{}" }) : handle(new Request(`${URL_}/functions/v1/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer odds_${"0".repeat(48)}` }, body: "{}" }), { url: URL_, anonKey: anon, serviceKey: service }))
    expect(wrong.status).toBe(401)
  })

  test("lists the new tools, writes marked as writes", async () => {
    const out = await rpc(a, "tools/list")
    const byName = new Map<string, Json>(out.result.tools.map((t: Json) => [t.name, t]))
    for (const n of ["my_application_answers", "my_people", "my_outreach", "outreach_to_send"]) expect(byName.get(n)?.annotations.readOnlyHint).toBe(true)
    for (const n of ["save_application_answers", "save_cv", "save_outreach", "approve_outreach", "mark_contacted"]) expect(byName.get(n)?.annotations.readOnlyHint).toBe(false)
    for (const t of out.result.tools) expect(t.inputSchema.type).toBe("object")
  })

  describe("standard answers", () => {
    test("start empty, save, merge, clear, and ignore what is not a field", async () => {
      const first = await tool(a, "my_application_answers")
      expect(first.data.answers).toEqual({})
      expect(first.data.not_answered_yet).toContain("phone")
      const saved = await tool(a, "save_application_answers", { answers: { phone: "+31 6 12345678", work_authorization: "I need a work permit; the employer sponsors it.", invented: "x" } })
      expect(saved.data.answers).toEqual({ phone: "+31 6 12345678", work_authorization: "I need a work permit; the employer sponsors it." })
      const more = await tool(a, "save_application_answers", { answers: { expected_salary: "EUR 600 a month", phone: "" } })
      expect(more.data.answers).toEqual({ work_authorization: "I need a work permit; the employer sponsors it.", expected_salary: "EUR 600 a month" })
      expect((await tool(a, "my_application_answers")).data.answers.expected_salary).toBe("EUR 600 a month")
      expect((await tool(a, "save_application_answers", { answers: {} })).ok).toBe(false)
      expect((await tool(a, "save_application_answers", { answers: { notes: "x".repeat(2000) } })).data.answers.notes.length).toBe(600)
    })
    test("are one person's own", async () => {
      expect((await tool(b, "my_application_answers")).data.answers).toEqual({})
    })
  })

  describe("application kit", () => {
    test("puts no CV on a job by itself: it offers the main one and says how to choose", async () => {
      const kit = await tool(a, "application_kit", { job_id: jobs[0].id })
      expect(kit.ok).toBe(true)
      expect(kit.data.cv).toBeNull()
      expect(kit.data.cv_note).toContain("Main CV")
      expect(kit.data.standard_answers.phone).toBeUndefined()
      expect(kit.data.standard_answers.expected_salary).toBe("EUR 600 a month")
      expect(kit.data.not_answered_yet).toContain("phone")
      expect(kit.data.how_to_apply).toContain("STOP")
      expect(kit.data.how_to_apply).toContain("sign in")
      expect(kit.data.how_to_apply).toContain("never type their password".replace("never type their password", "Never type their password"))
      expect(kit.data.apply_at === null || typeof kit.data.apply_at === "string").toBe(true)
    })
    test("uses the CV once one is attached", async () => {
      const main = (await tool(a, "my_documents")).data.documents.find((d: Json) => d.main_cv)
      expect((await tool(a, "attach_document", { job_id: jobs[0].id, document_id: main.document_id })).ok).toBe(true)
      const kit = await tool(a, "application_kit", { job_id: jobs[0].id })
      expect(kit.data.cv.from).toBe("attached to this job")
      expect(kit.data.cv.text).toBe("MAIN CV TEXT")
      expect(kit.data.cv_note).toBeUndefined()
    })
  })

  describe("save_cv", () => {
    test("makes a PDF in the standard format, saves it, attaches it, and the kit then uses it", async () => {
      const r = await tool(a, "save_cv", { name: "CV Test One", job_id: jobs[1].id, cv: CV })
      expect(r.message).toBeTruthy()
      expect(r.ok).toBe(true)
      expect(r.data.attached_to).toBe(jobs[1].id)
      const [row] = (await db(`documents?id=eq.${r.data.document_id}&select=kind,mime,file_name,body,size_bytes,is_main,path`)) as Json[]
      expect(row).toMatchObject({ kind: "cv", mime: "application/pdf", file_name: "CV Test One.pdf", is_main: false })
      expect(row.body).toContain("EXPERIENCE")
      expect(row.body).toContain("Finance Intern")
      const file = await fetch(`${URL_}/storage/v1/object/documents/${row.path}`, { headers: { apikey: service, Authorization: `Bearer ${service}` } })
      const bytes = new Uint8Array(await file.arrayBuffer())
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-")
      expect(bytes.length).toBe(row.size_bytes)
      expect((await PDFLib.PDFDocument.load(bytes)).getPageCount()).toBe(1)
      const kit = await tool(a, "application_kit", { job_id: jobs[1].id })
      expect(kit.data.cv.name).toBe("CV Test One")
      expect(kit.data.cv.file_url).toContain("/mcp/file?key=")
    })
    test("the file link serves the PDF to its owner and to nobody else", async () => {
      const docs = (await tool(a, "my_documents")).data.documents
      const mine = docs.find((d: Json) => d.name === "CV Test One")
      const get = (key: string): Promise<Response> => {
        const url = mine.file_url.replace(/key=[^&]+/, `key=${key}`)

        return REMOTE ? fetch(url) : handle(new Request(url), { url: URL_, anonKey: anon, serviceKey: service })
      }
      const ok = await get(a.key)
      expect(ok.status).toBe(200)
      expect(ok.headers.get("content-type")).toBe("application/pdf")
      expect(new TextDecoder().decode(new Uint8Array(await ok.arrayBuffer()).slice(0, 5))).toBe("%PDF-")
      expect((await get(b.key)).status).toBe(404)
    })
    test("refuses a bad CV in words Claude can act on, and a name already used", async () => {
      expect((await tool(a, "save_cv", { name: "x", cv: { name: "A" } })).message).toContain("email")
      expect((await tool(a, "save_cv", { name: "x", cv: { ...CV, experience: [], education: [] } })).message).toContain("at least one")
      expect((await tool(a, "save_cv", { name: "", cv: CV })).ok).toBe(false)
      expect((await tool(a, "save_cv", { name: "x", job_id: "nope", cv: CV })).message).toContain("No open job")
      expect((await tool(a, "save_cv", { name: "CV Test One", cv: { ...CV, summary: "Another." } })).message).toContain("already in their Documents")
    })
    test("a long CV and names with accents still make a PDF", async () => {
      const long = { ...CV, name: "Hà Hoàng Đào", experience: Array.from({ length: 8 }, (_, i) => ({ title: `Role ${i}`, company: `Company ${i}`, start: "2020", end: "2021", bullets: Array(8).fill("A long bullet that goes on and needs wrapping over more than one line. ".repeat(2)) })) }
      const r = await tool(a, "save_cv", { name: "CV Long Accents", cv: long })
      expect(r.ok).toBe(true)
    })
    test("cover letters still save, with the shared code", async () => {
      const r = await tool(a, "save_cover_letter", { name: "Letter Test", job_id: jobs[1].id, text: "Dear team, I would like to apply." })
      expect(r.ok).toBe(true)
      expect((await tool(a, "application_kit", { job_id: jobs[1].id })).data.cover_letter.text).toContain("Dear team")
      expect((await tool(a, "save_cover_letter", { name: "Letter Test", text: "Another letter." })).message).toContain("already in their Documents")
    })
  })

  describe("people and outreach", () => {
    test("my_people lists their people, one job's, and the people found there that are not added yet", async () => {
      const all = await tool(a, "my_people")
      expect(all.data.people.map((p: Json) => p.person_id).sort()).toEqual(["p-1", "p-2"])
      const one = await tool(a, "my_people", { job_id: jobs[0].id })
      expect(one.data.people.map((p: Json) => p.name)).toEqual(["Ada Lovelace"])
      expect(one.data.suggested.map((p: Json) => p.name)).toEqual(["Cy Newperson"])
      expect((await tool(b, "my_people")).data.people).toEqual([])
    })
    test("saves drafts for a person on the list and for someone not on it, with the rules of each channel", async () => {
      const note = await tool(a, "save_outreach", { person_id: "p-1", job_id: jobs[0].id, channel: "linkedin_note", body: "Hi Ada, I am applying to the finance internship and would value your view." })
      expect(note.ok).toBe(true)
      expect(note.data.for).toBe("Ada Lovelace")
      expect(note.data.how_to_send).toContain("approves")
      expect((await tool(a, "save_outreach", { person_id: "p-1", channel: "linkedin_note", body: "x".repeat(301) })).message).toContain("300")
      expect((await tool(a, "save_outreach", { person_id: "p-1", channel: "email", body: "Hello" })).message).toContain("subject")
      expect((await tool(a, "save_outreach", { person_id: "p-9", channel: "linkedin_message", body: "Hello" })).message).toContain("No person")
      expect((await tool(a, "save_outreach", { channel: "linkedin_message", body: "Hello" })).message).toContain("who it is for")
      expect((await tool(a, "save_outreach", { person_id: "p-1", channel: "email", body: "Hello" , subject: "Hi", job_id: "nope" })).message).toContain("No open job")
      const stranger = await tool(a, "save_outreach", { to_name: "Cy Newperson", to_url: "https://www.linkedin.com/in/cy", job_id: jobs[0].id, channel: "email", subject: "Finance internship", body: "Dear Cy, a short note." })
      expect(stranger.ok).toBe(true)
      expect((await tool(a, "my_people", { job_id: jobs[0].id })).data.people[0].drafts).toHaveLength(1)
    })
    test("my_outreach lists them, narrows by job and status, and mark_contacted moves one to sent", async () => {
      const all = (await tool(a, "my_outreach")).data.drafts
      expect(all).toHaveLength(2)
      expect(all.every((d: Json) => d.status === "draft")).toBe(true)
      expect((await tool(a, "my_outreach", { job_id: jobs[1].id })).data.drafts).toHaveLength(0)
      const draft = all.find((d: Json) => d.channel === "linkedin_note")
      expect((await tool(a, "mark_contacted", { draft_id: draft.draft_id })).ok).toBe(true)
      expect((await tool(a, "my_outreach", { draft_status: "sent" })).data.drafts.map((d: Json) => d.draft_id)).toEqual([draft.draft_id])
      expect((await tool(a, "my_outreach", { draft_status: "draft" })).data.drafts).toHaveLength(1)
      expect((await tool(a, "mark_contacted", { draft_id: "not-an-id" })).ok).toBe(false)
      expect((await tool(a, "mark_contacted", { draft_id: crypto.randomUUID() })).message).toContain("No draft")
    })
    test("another person cannot see or mark these drafts", async () => {
      expect((await tool(b, "my_outreach")).data.drafts).toEqual([])
      const draft = (await tool(a, "my_outreach", { draft_status: "draft" })).data.drafts[0]
      expect((await tool(b, "mark_contacted", { draft_id: draft.draft_id })).message).toContain("No draft")
      expect((await tool(a, "my_outreach", { draft_status: "draft" })).data.drafts).toHaveLength(1)
    })
  })

  describe("sending approved messages", () => {
    const newDraft = async (n: number): Promise<string> => (await tool(a, "save_outreach", { person_id: "p-2", channel: "linkedin_message", body: `Hello Bo, message ${n}.` })).data.draft_id

    test("nothing is sent that was not approved; approving is per draft and only for their own", async () => {
      const [d1, d2] = [await newDraft(1), await newDraft(2)]
      expect((await tool(a, "outreach_to_send")).data.to_send).toEqual([])
      const approved = await tool(a, "approve_outreach", { draft_ids: [d1, crypto.randomUUID(), "not-an-id"] })
      expect(approved.data.approved).toEqual([d1])
      expect(approved.data.not_approved).toHaveLength(1)
      expect((await tool(a, "approve_outreach", { draft_ids: [] })).ok).toBe(false)
      expect((await tool(b, "approve_outreach", { draft_ids: [d2] })).data.approved).toEqual([])
      const send = (await tool(a, "outreach_to_send")).data
      expect(send.to_send.map((x: Json) => x.draft_id)).toEqual([d1])
      expect(send.to_send[0]).toMatchObject({ channel: "linkedin_message", message: "Hello Bo, message 1.", to_url: "https://www.linkedin.com/in/bo" })
      expect(send.to_send[0].steps).toContain("Message")
      expect(send.remaining_today).toBe(9)
      expect(send.rules).toContain("30 to 90 seconds")
      expect((await tool(b, "outreach_to_send")).data.to_send).toEqual([])
      // Approving again does nothing; the other draft is still only a draft.
      expect((await tool(a, "approve_outreach", { draft_ids: [d1] })).data.approved).toEqual([])
      expect((await tool(a, "my_outreach", { draft_status: "approved" })).data.drafts.map((d: Json) => d.draft_id)).toEqual([d1])
      expect((await tool(b, "mark_contacted", { draft_id: d1 })).message).toContain("No draft")
      expect((await tool(a, "mark_contacted", { draft_id: d1 })).ok).toBe(true)
      expect((await tool(a, "outreach_to_send")).data).toMatchObject({ to_send: [], sent_last_24h: 2, remaining_today: 8 })
    })

    test("a daily limit holds back the rest until tomorrow", async () => {
      const ids: string[] = []
      for (let i = 0; i < 9; i++) ids.push(await newDraft(10 + i))
      await db("outreach_drafts?user_id=eq." + a.id + "&id=in.(" + ids.slice(0, 8).join(",") + ")", { method: "PATCH", body: { status: "sent", sent_at: new Date().toISOString() }, prefer: "return=minimal" })
      await tool(a, "approve_outreach", { draft_ids: [ids[8], await newDraft(30)] })
      const send = (await tool(a, "outreach_to_send")).data
      expect(send.sent_last_24h).toBe(10)
      expect(send.remaining_today).toBe(0)
      expect(send.to_send).toEqual([])
      expect(send.waiting_for_tomorrow).toBe(2)
    })
  })

  describe("the browser extension", () => {
    let xkey = ""
    const call = async (key: string, route: string, body?: Json): Promise<{ status: number; data: Json }> => {
      const init = { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: body === undefined ? undefined : JSON.stringify(body) }
      const res = REMOTE ? await fetch(`${REMOTE}/ext/${route}`, init) : await handle(new Request(`${URL_}/functions/v1/mcp/ext/${route}`, init), { url: URL_, anonKey: anon, serviceKey: service })

      return { status: res.status, data: await res.json() }
    }
    const made = new Map<string, string>()
    const makeKey = async (userId: string): Promise<string> => {
      const had = made.get(userId)
      if (had) return had
      const k = `oddsx_${hex(crypto.getRandomValues(new Uint8Array(24)))}`
      await db("extension_keys", { method: "POST", body: { user_id: userId, key_hash: await sha(k), hint: k.slice(-4) }, prefer: "return=minimal" })
      made.set(userId, k)

      return k
    }

    test("only its own key opens it: not Claude's key, not none, not a wrong one", async () => {
      xkey = await makeKey(a.id)
      expect((await call(xkey, "me")).status).toBe(200)
      expect((await call(a.key, "me")).status).toBe(401)
      expect((await call("", "me")).status).toBe(401)
      expect((await call(`oddsx_${"0".repeat(48)}`, "me")).status).toBe(401)
      expect((await call(xkey, "nope", {})).status).toBe(404)
    })

    test("a job odds already holds is kept for the person with their chance, at no cost, and again is the same", async () => {
      const [held] = (await db("postings?select=id,url,title&url=like.https://www.linkedin.com/jobs/view/*&closed_at=is.null&limit=1")) as Array<{ id: string; url: string; title: string }>
      const before = ((await db(`extension_reads?user_id=eq.${a.id}&select=id`)) as unknown[]).length
      const one = await call(xkey, "add", { url: `${held.url}?trackingId=abc&utm=x` })
      expect(one.status).toBe(200)
      expect(one.data.status).toBe("exists")
      expect(one.data.saved).toBe(true)
      expect(one.data.job.id).toBe(held.id)
      expect(one.data.odds_link).toBe(`https://odds.beeblast.co/job/${held.id}`)
      expect(typeof one.data.chance_pct === "number" || one.data.chance_pct === null).toBe(true)
      expect(((await db(`saved_jobs?user_id=eq.${a.id}&posting_id=eq.${held.id}&select=posting_id`)) as unknown[]).length).toBe(1)
      expect(((await db(`extension_reads?user_id=eq.${a.id}&select=id`)) as unknown[]).length).toBe(before)
      const two = await call(xkey, "add", { url: held.url })
      expect(two.data.status).toBe("exists")
      expect(((await db(`saved_jobs?user_id=eq.${a.id}&posting_id=eq.${held.id}&select=posting_id`)) as unknown[]).length).toBe(1)
    })

    test("peek gives the chance for a job odds holds without saving it, and says so for one it does not hold", async () => {
      const [held] = (await db("postings?select=id,url&url=like.https://www.linkedin.com/jobs/view/*&closed_at=is.null&limit=1&order=id.desc")) as Array<{ id: string; url: string }>
      await db(`saved_jobs?user_id=eq.${a.id}&posting_id=eq.${held.id}`, { method: "DELETE", prefer: "return=minimal" })
      const seen = await call(xkey, "peek", { url: `${held.url}?trackingId=x` })
      expect(seen.status).toBe(200)
      expect(seen.data).toMatchObject({ known: true, id: held.id, saved: false })
      expect(typeof seen.data.chance_pct === "number" || seen.data.chance_pct === null).toBe(true)
      expect(((await db(`saved_jobs?user_id=eq.${a.id}&posting_id=eq.${held.id}&select=posting_id`)) as unknown[]).length).toBe(0)
      expect((await call(xkey, "add", { url: held.url })).data.saved).toBe(true)
      expect((await call(xkey, "peek", { url: held.url })).data.saved).toBe(true)
      expect((await call(xkey, "peek", { url: "https://www.linkedin.com/jobs/view/1999999998" })).data).toEqual({ known: false })
      expect((await call(xkey, "peek", { url: "https://www.glassdoor.com/job-listing/x" })).status).toBe(422)
      expect((await call(a.key, "peek", { url: held.url })).status).toBe(401)
      const reads = (await db(`extension_reads?user_id=eq.${a.id}&select=id`)) as unknown[]
      expect(reads.length).toBe(0)
    })

    test("a sign-in for the app in the panel: a real session of the person's own, from the extension key alone", async () => {
      const got = await call(xkey, "session", {})
      expect(got.status).toBe(200)
      expect(typeof got.data.access_token).toBe("string")
      expect(typeof got.data.refresh_token).toBe("string")
      const who = await fetch(`${URL_}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${got.data.access_token}` } })
      expect(who.status).toBe(200)
      expect(((await who.json()) as Json).id).toBe(a.id)
      // It reads their own rows and nobody else's.
      const saved = await fetch(`${URL_}/rest/v1/saved_jobs?select=user_id`, { headers: { apikey: anon, Authorization: `Bearer ${got.data.access_token}` } })
      expect(((await saved.json()) as Json[]).every((r) => r.user_id === a.id)).toBe(true)
      expect((await call(a.key, "session", {})).status).toBe(401)
      expect((await call("", "session", {})).status).toBe(401)
    })

    test("the pool is the person's saved jobs, newest first, and no one else's", async () => {
      const mine = await call(xkey, "pool")
      expect(mine.status).toBe(200)
      expect(mine.data.jobs.length).toBeGreaterThan(0)
      expect(mine.data.jobs[0]).toHaveProperty("title")
      expect(mine.data.jobs[0].link).toMatch(/^https:\/\/odds\.beeblast\.co\/job\//)
      expect(mine.data.total).toBeGreaterThanOrEqual(mine.data.jobs.length)
      const bKey = await makeKey(b.id)
      expect((await call(bKey, "pool")).data.jobs).toEqual([])
      expect((await call(a.key, "pool")).status).toBe(401)
    })

    test("a link that is not a LinkedIn job, or no link, is refused before anything is paid", async () => {
      expect((await call(xkey, "add", { url: "https://www.glassdoor.com/job-listing/x-JV_IC1.htm?jl=123" })).status).toBe(422)
      expect((await call(xkey, "add", { url: "https://www.linkedin.com/feed/" })).status).toBe(422)
      expect((await call(xkey, "add", {})).status).toBe(422)
      expect((await call(xkey, "add", { url: "x".repeat(5000) })).status).toBe(413)
    })

    test("at thirty new jobs in a day the next unknown one is refused before it is read", async () => {
      await db("extension_reads", { method: "POST", body: Array.from({ length: 30 }, () => ({ user_id: a.id, url: "https://www.linkedin.com/jobs/view/1000000001" })), prefer: "return=minimal" })
      const r = await call(xkey, "add", { url: "https://www.linkedin.com/jobs/view/1999999999" })
      expect(r.status).toBe(429)
      expect(r.data.message).toContain("30 new jobs a day")
      // Another person is not held back by it.
      const bKey = await makeKey(b.id)
      expect((await call(bKey, "me")).status).toBe(200)
    })
  })

  test("the existing tools still work for them", async () => {
    expect((await tool(a, "my_profile")).data.name).toBe("Test Person")
    expect((await tool(a, "my_jobs")).data.jobs.map((j: Json) => j.id)).toContain(jobs[0].id)
    expect((await tool(a, "export_my_odds")).data.documents.length).toBeGreaterThan(2)
    expect((await tool(a, "mark_applied", { job_id: jobs[0].id })).ok).toBe(true)
    expect((await tool(a, "search_jobs", { query: "finance", limit: 3 })).ok).toBe(true)
  })
})
