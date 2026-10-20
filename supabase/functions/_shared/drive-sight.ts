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
  return { baseUrl, apiKey, model: (get("ODDS_SIGHT_MODEL") ?? "").trim() || "cx/gpt-6-luna" }
}

/** At most 8 lines, no e-mail addresses or phone numbers even if the model wrote them. */
export function cleanSight(text: string): string {
  return String(text ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "(filled)")
    .replace(/\+?\d[\d ().-]{7,}\d/g, "(filled)")
    .split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 8).join("\n")
    .slice(0, 1200)
}

/**
 * What the screenshot shows, as text for an agent that cannot see; "" when sight is off, slow or fails (never holds a run up).
 * `image` is the base64 JPEG the extension took of the tab.
 */
export async function describeShot(env: SightEnv | null, image: string, timeoutMs = 12_000, fetcher: typeof fetch = fetch): Promise<string> {
  if (!env || !image) return ""
  try {
    const res = await fetcher(`${env.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.model,
        max_tokens: 400,
        messages: [
          { role: "system", content: SIGHT_PROMPT },
          { role: "user", content: [{ type: "text", text: "Screenshot of the application tab." }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }] },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return ""
    const body = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null
    const text = body?.choices?.[0]?.message?.content
    return typeof text === "string" ? cleanSight(text) : ""
  } catch {
    return ""
  }
}
