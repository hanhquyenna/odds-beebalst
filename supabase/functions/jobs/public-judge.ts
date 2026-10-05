// What a job page says about whether the job is still open. Pure functions: no network, no clock of their own (the time is passed in).
// Used by the jobs Edge Function (/jobs/check-public, Deno) and by the tests (bun).
//
// A job is CLOSED only on hard evidence: the page answers 404 or 410, its own structured data names a deadline (validThrough) that has passed,
// or an EY careers page says "The Job is no longer available". A page that cannot be read at all is UNKNOWN and changes nothing.

export type Verdict = "open" | "closed" | "unknown"

export interface Judgement {
  verdict: Verdict
  why: string
  /** The deadline the page states, as YYYY-MM-DD, when it has one. Kept so the database can close the job by itself on that day. */
  validThrough: string | null
}

/** The JobPosting structured data of a page, or null. */
export function parseJobPosting(body: string): Record<string, unknown> | null {
  const m = /"@type"\s*:\s*"JobPosting"/.exec(body)
  if (!m) return null
  let start = body.lastIndexOf("{", m.index)
  while (start >= 0) {
    const obj = tryObject(body, start)
    if (obj && obj["@type"] === "JobPosting") return obj
    start = body.lastIndexOf("{", start - 1)
  }
  return null
}

/** Reads one balanced JSON object starting at `start`, or null if it does not parse. */
function tryObject(text: string, start: number): Record<string, unknown> | null {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === "\\") escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, i + 1))
          return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

const isoDay = (v: unknown): string | null => {
  const m = typeof v === "string" ? /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/.exec(v) : null
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

const stripTags = (html: string): string => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

/** `now` is a YYYY-MM-DD day. A deadline is passed on the day after it. */
export function judgePage(ats: string, status: number, body: string, now: string): Judgement {
  if (status === 404 || status === 410) return { verdict: "closed", why: `the page answers HTTP ${status}`, validThrough: null }
  if (status !== 200) return { verdict: "unknown", why: status ? `HTTP ${status}` : "no answer", validThrough: null }

  const ld = parseJobPosting(body)
  const deadline = ld ? isoDay(ld.validThrough) : null
  if (deadline && deadline < now) return { verdict: "closed", why: `its own deadline (${deadline}) has passed`, validThrough: deadline }

  if (ats === "successfactors") {
    const text = stripTags(body)
    if (/the job is no longer available/i.test(text)) return { verdict: "closed", why: 'the page says "The Job is no longer available"', validThrough: deadline }
    if (/apply now/i.test(text)) return { verdict: "open", why: "HTTP 200 with an Apply button and no closed message", validThrough: deadline }
    return { verdict: "unknown", why: "HTTP 200 but no Apply button and no closed message", validThrough: deadline }
  }
  if (ld) return { verdict: "open", why: `HTTP 200${deadline ? `, deadline ${deadline}` : ", no deadline stated"}`, validThrough: deadline }

  return { verdict: "unknown", why: "HTTP 200 but no job data on the page", validThrough: null }
}
