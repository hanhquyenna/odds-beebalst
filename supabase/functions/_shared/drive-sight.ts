/**
 * Sight for the drive agent. Broods passes no image to the model (not inside a tool result, not in a user message: tested with a
 * known image, every format came back "I can't see the screenshot"), while 9router reads the same image fine in an ordinary chat
 * message. So the server shows each read_page screenshot to the model itself and hands Broods the description as text.
 */

export const SIGHT_PROMPT = `You are the eyes of a form-filling agent that cannot see the screen. You get one screenshot of a job application page.
Describe only what helps it act, in at most 8 short lines, plain text, no preamble:
- OPEN: any pop-up, dialog, cookie banner, overlay, or dropdown list that is open, and the options it shows.
- ERRORS: every red or warning message, with the field it belongs to.
- BUTTONS: the main action buttons you see (Next, Continue, Review, Submit, Apply…) and where (top, bottom, inside a box).
- CHECK: a captcha, "verify you are human", or a sign-in wall, if visible.
- ODD: anything that looks unfinished or wrong (an empty required field, a box still showing a placeholder, a spinner, a blank page).
Never repeat personal details you can read (names, e-mails, phone numbers): say "filled" instead. Leave out a line when nothing applies.`

export type SightEnv = { baseUrl: string; apiKey: string; model: string }

/** The 9router address and key the server holds (kept in step with the tunnel), or null when sight is not set up. */
export function sightEnv(get: (name: string) => string | undefined): SightEnv | null {
  const baseUrl = (get("NINE_ROUTER_BASE_URL") ?? "").trim().replace(/\/+$/, "")
  const apiKey = (get("NINE_ROUTER_API_KEY") ?? "").trim()
  if (!baseUrl || !apiKey) return null
  // Sonnet 5 by default: luna on the ChatGPT plan hit "usage limit" (429) and the page went undescribed. ODDS_SIGHT_MODEL overrides it.
  return { baseUrl, apiKey, model: (get("ODDS_SIGHT_MODEL") ?? "").trim() || "cc/claude-sonnet-5" }
}

/** At most 8 lines, no e-mail addresses or phone numbers even if the model wrote them. */
export function cleanSight(text: string): string {
  return String(text ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "(filled)")
    .replace(/\+?\d[\d ().-]{7,}\d/g, "(filled)")
    .split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 8).join("\n")
    .slice(0, 1200)
}

/** What happened to one look, for the trace (the guard row): never the image, never a key. */
export type SightDiag = { bytes: number; skipped?: string; status?: number; error?: string; ms?: number; model?: string }

/**
 * Smallest picture worth describing. The extension already refuses a blank tab by its pixels (shotSpread in background.js), so this
 * only stops an empty or broken string: a plain white form at 1024 px, JPEG quality 50, can be under 8 KB and still be the page.
 */
export const MIN_SHOT_BYTES = 1_500

/** What the screenshot shows, as text for an agent that cannot see, with why it gave what it gave ("" text when sight is off, slow or fails). */
export async function describeShotDetailed(env: SightEnv | null, image: string, timeoutMs = 12_000, fetcher: typeof fetch = fetch, trouble: string[] = []): Promise<{ text: string; diag: SightDiag }> {
  const data = String(image ?? "").replace(/^data:image\/[a-z+]+;base64,/i, "")
  const bytes = Math.round((data.length * 3) / 4)
  if (!env) return { text: "", diag: { bytes, skipped: "sight not set up (no 9router address or key on the server)" } }
  if (bytes < MIN_SHOT_BYTES) return { text: "", diag: { bytes, skipped: `picture too small (${bytes} bytes)` } }
  const mime = data.startsWith("iVBOR") ? "image/png" : data.startsWith("UklG") ? "image/webp" : "image/jpeg"
  const t0 = Date.now()
  try {
    const res = await fetcher(`${env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.model,
        // 9router streams a Claude (cc/) model unless told not to, and a stream is not JSON: the description came back empty.
        stream: false,
        max_tokens: 400,
        messages: [
          { role: "system", content: SIGHT_PROMPT },
          { role: "user", content: [{ type: "text", text: trouble.length ? `Screenshot of the application tab, taken because ${trouble.join(" and ")}. Start with one line that explains it (which value a box really shows, the exact error, what is open or covering the form).` : "Screenshot of the application tab." }, { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } }] },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const raw = await res.text().catch(() => "")
    const ms = Date.now() - t0
    if (!res.ok) return { text: "", diag: { bytes, status: res.status, error: safeError(raw), ms, model: env.model } }
    let body: { choices?: Array<{ message?: { content?: unknown } }> } | null = null
    try { body = JSON.parse(raw) } catch { return { text: "", diag: { bytes, status: res.status, error: `not JSON: ${safeError(raw)}`, ms, model: env.model } } }
    const content = body?.choices?.[0]?.message?.content
    const text = typeof content === "string" ? cleanSight(content) : Array.isArray(content) ? cleanSight(content.map((c: { text?: unknown }) => (typeof c?.text === "string" ? c.text : "")).join("\n")) : ""
    return { text, diag: { bytes, status: res.status, ms, model: env.model, ...(text ? {} : { error: `no text in the answer: ${safeError(raw)}` }) } }
  } catch (e) {
    return { text: "", diag: { bytes, error: safeError(String((e as Error)?.name === "TimeoutError" ? `timed out after ${timeoutMs} ms` : (e as Error)?.message ?? e)), ms: Date.now() - t0, model: env.model } }
  }
}

/** A short error text for the trace, with anything key-like taken out. */
function safeError(text: string): string {
  return String(text ?? "").replace(/(sk|key|token|bearer)[-_ :=]*[A-Za-z0-9._-]{8,}/gi, "$1 (hidden)").replace(/\s+/g, " ").slice(0, 240)
}

/** Sight descriptions per run at most when something went wrong (a new page's first look does not count). */
export const TROUBLE_SIGHT_MAX = 8

/** One look per page: the address without its #fragment, plus the title (a single-page form that changes step keeps its URL). */
export function sightKey(page: { url?: unknown; title?: unknown } | null | undefined): string {
  const url = typeof page?.url === "string" ? page.url.split("#")[0]! : ""
  return url ? `${url}|${typeof page?.title === "string" ? page.title.slice(0, 120) : ""}` : ""
}

/**
 * Unusually few fields: the same page as before now lists far fewer fields (a form that lost its fields behind an overlay, a
 * widget the reader cannot see into). A page that never had fields (a job description) is not trouble.
 */
export function fewerFields(page: { url?: unknown; fields?: unknown } | null | undefined, before: { url?: unknown; fields?: unknown } | null | undefined): boolean {
  if (!page || !before || !Array.isArray(page.fields) || !Array.isArray(before.fields)) return false
  if (sightKey({ url: page.url }) !== sightKey({ url: before.url })) return false
  const was = before.fields.length, now = page.fields.length
  return was >= 4 && now * 2 < was
}
