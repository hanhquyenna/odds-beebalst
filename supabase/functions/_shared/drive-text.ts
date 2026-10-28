/**
 * No em dashes in what the agent writes for the person or into a form: "a — b" and "a—b" become "a, b". Choice values that are
 * one of the page's own options stay exactly as listed (an option may hold a dash, and fill must match it).
 */
const EM = /\s*\u2014\s*/g

export function noEmDash(text: string): string {
  return text.includes("\u2014") ? text.replace(EM, ", ").replace(/^, |, $/g, "").replace(/, ([.,;:!?])/g, "$1") : text
}

type Args = Record<string, unknown>

/** The tool's arguments with em dashes gone from every text the agent wrote; `options` = option texts on the page (kept as is). */
export function cleanAgentText(name: string, args: Args, options: ReadonlySet<string> = new Set()): Args {
  const out: Args = { ...args }
  for (const key of ["say", "message", "text", "reason_text"]) if (typeof out[key] === "string") out[key] = noEmDash(out[key] as string)
  if (Array.isArray(out.questions)) out.questions = out.questions.map((q) => (typeof q === "string" ? noEmDash(q) : q))
  if (name === "fill" && Array.isArray(out.fields)) {
    out.fields = out.fields.map((f) => {
      if (!f || typeof f !== "object") return f
      const value = (f as Args).value
      return typeof value === "string" && !options.has(value) ? { ...(f as Args), value: noEmDash(value) } : f
    })
  }
  return out
}

/** True when a fill holds a value with an em dash (only then are the page's options worth looking up). */
export function fillHasEmDash(args: Args): boolean {
  return Array.isArray(args.fields) && args.fields.some((f) => typeof (f as Args | null)?.value === "string" && ((f as Args).value as string).includes("\u2014"))
}

/** Every option text in a stored page snapshot (fields[].options as strings or {text|label|value}). */
export function optionTexts(page: unknown): Set<string> {
  const set = new Set<string>()
  const fields = (page as { fields?: unknown } | null)?.fields
  if (!Array.isArray(fields)) return set
  for (const f of fields) {
    const opts = (f as { options?: unknown } | null)?.options
    if (!Array.isArray(opts)) continue
    for (const o of opts) {
      if (typeof o === "string") set.add(o)
      else if (o && typeof o === "object") for (const k of ["text", "label", "value"]) { const v = (o as Args)[k]; if (typeof v === "string") set.add(v) }
    }
  }
  return set
}
