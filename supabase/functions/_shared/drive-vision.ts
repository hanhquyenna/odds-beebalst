/**
 * When a step shows trouble: the reasons the server's sight model should look at the tab again (drive.ts sends them with the
 * screenshot, and Broods reads the text it gets back).
 */

// deno-lint-ignore no-explicit-any
type Json = any

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
