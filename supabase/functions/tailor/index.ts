// Edge Function `tailor`: rewrites a copy of the person's CV or cover letter for one job. The model only proposes; every line it sends
// passes through ../_shared/tailor-cv.ts, which keeps out any keyword the CV and profile do not back, and any number, name, employer, school or date
// they do not contain. Nothing is saved here: the app shows the draft, the person accepts or edits it, and the app saves it as a new document on that job.
//   POST /tailor/draft  { kind: "cv" | "cover_letter", job: { title, employer }, document_id?, letter_id?, wanted: [{ name, label, tier, pattern }], facts }
// The model is called the way apply-agent calls its own (index.ts there): OPENAI_API_KEY first, else ANTHROPIC_API_KEY; TAILOR_MODEL overrides the model.
// Deploy:  supabase functions deploy tailor --project-ref gdavxkaioqlfvfunmtxd --use-api   (config.toml: verify_jwt = false, the sign-in is checked here)
import { reply, serveRoutes, userFromRequest } from "../_shared/http.ts"
import { CV_SYSTEM, LETTER_SYSTEM, analyse, assemble, checkLetter, cvUser, jsonOf, leaks, letterChanges, letterUser, mentions, type Ctx, type Facts, type Tailored, type Tier, type Wanted } from "../_shared/tailor-cv.ts"

const ID = /^[0-9a-f-]{36}$/
const TIERS: Tier[] = ["must", "strong", "optional", "nice"]
const ASK_MS = 90_000

async function svc<T>(path: string): Promise<T> {
  const url = Deno.env.get("SUPABASE_URL")!
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status}`)

  return (await r.json()) as T
}

/** One answer from the model: text. OpenAI first, else Anthropic, same keys as apply-agent. Empty on a miss. */
async function ask(system: string, user: string, maxTokens: number, json: boolean): Promise<string> {
  const openai = (Deno.env.get("OPENAI_API_KEY") ?? "").trim()
  const anthropic = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim()
  const override = (Deno.env.get("TAILOR_MODEL") ?? "").trim()
  try {
    if (openai) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openai}` },
        body: JSON.stringify({
          model: override || "gpt-6-luna",
          temperature: 0.3,
          max_completion_tokens: maxTokens,
          ...(json ? { response_format: { type: "json_object" } } : {}),
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
        signal: AbortSignal.timeout(ASK_MS),
      })
      if (!res.ok) return ""
      const data = await res.json()

      return String(data?.choices?.[0]?.message?.content ?? "")
    }
    if (anthropic) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropic, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: override || "claude-sonnet-5-5", max_tokens: maxTokens, temperature: 0.3, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(ASK_MS),
      })
      if (!res.ok) return ""
      const data = await res.json()

      return Array.isArray(data?.content) ? data.content.map((c: { text?: string }) => c.text ?? "").join("") : ""
    }
  } catch {
    return ""
  }

  return ""
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")

function wantedFrom(raw: unknown): Wanted[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 40).flatMap((w) => {
    const name = text(w?.name, 60)
    const label = text(w?.label, 60)
    const pattern = typeof w?.pattern === "string" ? w.pattern.slice(0, 400) : ""
    const tier = TIERS.includes(w?.tier) ? (w.tier as Tier) : "must"

    return name && label ? [{ name, label, tier, pattern }] : []
  })
}

function factsFrom(raw: unknown): Facts {
  const f = (raw ?? {}) as Record<string, unknown>
  const one = (k: string): string | undefined => text(f[k], 200) || undefined

  return { extra: typeof f.extra === "string" ? f.extra.slice(0, 12_000) : "", name: one("name"), email: one("email"), phone: one("phone"), place: one("place"), linkedin: one("linkedin"), website: one("website") }
}

async function draft(req: Request): Promise<Response> {
  const user = await userFromRequest(req)
  if (!user) return reply(401, { error: "Sign in to tailor your CV." })
  if (!Deno.env.get("OPENAI_API_KEY") && !Deno.env.get("ANTHROPIC_API_KEY")) return reply(503, { error: "Tailoring is not switched on yet." })
  const body = await req.json().catch(() => null)
  const kind = body?.kind === "cover_letter" ? "cover_letter" : body?.kind === "cv" ? "cv" : null
  if (!kind) return reply(400, { error: "Say whether it is the CV or the cover letter." })
  const job = { title: text(body?.job?.title, 200), employer: text(body?.job?.employer, 200) }
  if (!job.title) return reply(400, { error: "Which job?" })
  const wanted = wantedFrom(body?.wanted)
  const facts = factsFrom(body?.facts)

  // The person's own documents only: the rows are read with their id in the filter.
  const own = async (id: unknown): Promise<string | null> => {
    if (typeof id !== "string" || !ID.test(id)) return null
    const rows = await svc<Array<{ body: string }>>(`documents?user_id=eq.${user.id}&id=eq.${id}&select=body`)

    return rows[0]?.body ?? null
  }
  const cv = await own(body?.document_id).catch(() => null)
  if (!cv || cv.trim().length < 80) return reply(422, { error: "Odds has no text from that CV to work from. Pick a CV that reads (a text PDF or a Word file)." })
  const ctx: Ctx = { cv, facts, wanted, job }
  const { supported, missing } = analyse(cv, facts, wanted)
  const missingOut = missing.map(({ name, label, tier }) => ({ name, label, tier }))

  if (kind === "cv") {
    let best: Tailored | null = null
    let feedback: string[] = []
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await ask(CV_SYSTEM, cvUser(ctx, feedback), 6000, true)
      if (!out) break
      const built = assemble(jsonOf(out), ctx)
      if (!built.ok) {
        feedback = built.errors
        continue
      }
      if (!best || built.result.kept_original.length < best.kept_original.length) best = built.result
      if (best.kept_original.length === 0) break
      feedback = best.kept_original
    }
    if (!best) return reply(502, { error: "Odds could not rewrite this CV safely. Nothing was changed. Try again in a minute." })

    return reply(200, { kind, result: best })
  }

  const previous = await own(body?.letter_id).catch(() => null)
  let letter = ""
  let feedback: string[] = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = (await ask(LETTER_SYSTEM, letterUser(ctx, previous, feedback), 2000, false)).trim()
    if (!out) break
    const bad = checkLetter(out, ctx)
    if (bad.length === 0) {
      letter = out
      break
    }
    feedback = bad
  }
  if (!letter) return reply(502, { error: "Odds could not write this letter safely. Nothing was changed. Try again in a minute." })
  const added = supported.filter((w) => mentions(letter, w) && !(previous && mentions(previous, w))).map((w) => w.label)
  if (leaks(letter, missing).length > 0) return reply(502, { error: "Odds could not write this letter safely. Nothing was changed." })

  return reply(200, { kind, result: { letter, changes: letterChanges(letter, previous), added_keywords: added, missing: missingOut } })
}

serveRoutes({ draft })
