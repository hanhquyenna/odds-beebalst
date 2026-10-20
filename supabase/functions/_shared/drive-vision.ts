/**
 * Real vision, only when a step shows trouble. Broods keeps no image that arrives as bytes (session.ts sanitizeUserMessage /
 * storableToolResultOutput drop them before the turn is built: docs/broods-issues/11), but it downloads an image given as a link and
 * hands it to the model. So when a step goes wrong, the screenshot goes to a private bucket and its signed link is steered into the
 * live conversation; the model sees the real tab at its next step. Text sight stays on every page read; this is the rare extra.
 */

/** Real screenshots kept per run: older ones are overwritten with a tiny grey picture, so their links stay valid but cost nothing. */
export const VISION_KEEP = 2
/** Screenshots pushed per run at most (each is ~1-1.5k tokens on every later step). */
export const VISION_MAX = 8
/** Link lifetime: longer than any run and resume window (copilot resumes up to 3 h), so a link never breaks mid-run. */
export const VISION_LINK_SECONDS = 24 * 3600

/** 32x32 grey JPEG put over an old screenshot: the link Broods replays still answers, with almost nothing to read. */
export const PLACEHOLDER_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABQODxIPDRQSEBIXFRQYHjIhHhwcHj0sLiQySUBMS0dARkVQWnNiUFVtVkVGZIhlbXd7gYKBTmCNl4x9lnN+gXz/2wBDARUXFx4aHjshITt8U0ZTfHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHz/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDdooooAKKKKACiiigAooooA//Z"

// deno-lint-ignore no-explicit-any
type Json = any

/**
 * A picture with nothing in it: a tab Chrome did not paint (queued applications fill in a background tab) comes back pure white, a
 * ~4 KB JPEG, where a real application page is 40-70 KB. Pushed, it made Broods stop with "the screen is completely blank".
 */
export function looksBlank(base64: string): boolean {
  return !base64 || (base64.length * 3) / 4 < 8_000
}

/** What a page looks like for "did that click change anything": address, every field's value, the buttons and the errors. */
export function pageSignature(page: Json): string {
  if (!page || typeof page !== "object") return ""
  const fields = Array.isArray(page.fields) ? page.fields.map((f: Json) => `${f?.id}=${f?.value ?? ""}:${f?.filled ? 1 : 0}`).join("|") : ""
  const buttons = Array.isArray(page.buttons) ? page.buttons.map((b: Json) => b?.text ?? "").join("|") : ""
  const errors = Array.isArray(page.errors) ? page.errors.join("|") : ""
  return `${page.url ?? ""}#${fields}#${buttons}#${errors}#${page.dialog ? "dialog" : ""}`
}

/**
 * Why this step needs Broods to see the tab, or [] when it went fine. `page` is the page the step returned (or read), `before` the
 * last page Broods saw before it.
 */
export function troubleReasons(tool: string, result: Json, page: Json, before: Json): string[] {
  const out: string[] = []
  const r = result ?? {}
  if (tool === "fill" && Array.isArray(r.results)) {
    const lost = r.results.filter((x: Json) => x && x.ok === false && !/^not tried/.test(String(x.error ?? "")))
    if (lost.length) out.push(`a fill did not take (${lost.length} field${lost.length > 1 ? "s" : ""})`)
  }
  if ((tool === "click" || tool === "click_at") && page && before && pageSignature(page) === pageSignature(before)) out.push("the click changed nothing on the page")
  // Only a new error or a newly opened pop-up: the same message left on the page (SmartRecruiters keeps its error text) spent the
  // whole screenshot budget on the same picture.
  const errorsOf = (p: Json) => (Array.isArray(p?.errors) ? p.errors.map(String) : [])
  const seen = new Set(errorsOf(before))
  if (errorsOf(page).some((e: string) => !seen.has(e))) out.push("the page shows an error")
  if (page?.dialog && !before?.dialog) out.push("a pop-up is open")
  return out
}

export type VisionDeps = {
  /** Upload bytes (base64 JPEG) to the private sight bucket at `path` (overwrite allowed). */
  put: (path: string, base64: string) => Promise<boolean>
  /** A signed link to `path`, valid for `seconds`. */
  sign: (path: string, seconds: number) => Promise<string | null>
  /** The paths already pushed for this run, oldest first. */
  pushed: () => Promise<string[]>
  /** Remember a push (path and why). */
  remember: (path: string, reason: string) => Promise<void>
  /** Steer a user message holding the text and the image link into the run's live Broods conversation. */
  steer: (text: string, imageUrl: string) => Promise<boolean>
}

/**
 * Put the screenshot in front of the model: stored privately, older ones beyond VISION_KEEP greyed out (their links keep working),
 * then steered in as an image link. False when it could not (over the cap, storage or steer failed): text sight remains.
 */
export async function pushScreenshot(deps: VisionDeps, runId: string, image: string, reasons: string[], now = Date.now()): Promise<boolean> {
  if (!image || !reasons.length || looksBlank(image)) return false
  const done = await deps.pushed().catch(() => [] as string[])
  if (done.length >= VISION_MAX) return false
  const path = `${runId}/${now}.jpg`
  if (!(await deps.put(path, image).catch(() => false))) return false
  const url = await deps.sign(path, VISION_LINK_SECONDS).catch(() => null)
  if (!url) return false
  for (const old of done.slice(0, Math.max(0, done.length + 1 - VISION_KEEP))) await deps.put(old, PLACEHOLDER_JPEG).catch(() => false)
  const text = `This is the tab right now, because ${reasons.join(" and ")}. Look at the picture before your next step: what is open, what the error says, which value the box really shows, where the button is. Older screenshots in this conversation are greyed out on purpose.`
  if (!(await deps.steer(text, url).catch(() => false))) return false
  await deps.remember(path, reasons.join("; ")).catch(() => undefined)
  return true
}
