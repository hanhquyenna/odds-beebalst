import type { FormState } from "@/lib/journey"
import { DRAFT_KEY } from "@/lib/session"

/**
 * Bumped when the shape below changes. A draft from an older build is dropped
 * rather than migrated: it is one unfinished form, not something worth keeping.
 */
const VERSION = 2

const ENUMS: Record<string, readonly string[]> = {
  permit: ["eu", "orientation_year", "hsm", "other_non_eu"],
  origin: ["dutch", "eu_non_native", "non_eu", ""],
  dutch: ["none", "basic", "professional", "native", ""],
  studying: ["yes", "no", ""],
}
const TEXTS = ["birth", "abroad", "salary"]

export interface JourneyDraft {
  version: number
  step: string
  form: FormState
}

/** The unfinished journey from this browser, or null. A lost draft is a re-typed form, not an error worth showing. */
export function loadDraft(): JourneyDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null

    return isDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Keeps the half-filled journey so a reload or a sign-in round trip picks it back up. */
export function saveDraft(draft: Omit<JourneyDraft, "version">): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: VERSION, ...draft }))
  } catch {
    return
  }
}

/** True when a parsed value is a current-version draft with every field in range. */
function isDraft(value: unknown): value is JourneyDraft {
  if (typeof value !== "object" || value === null || !("version" in value) || !("step" in value) || !("form" in value)) {
    return false
  }
  const form = value.form
  if (value.version !== VERSION || typeof value.step !== "string" || typeof form !== "object" || form === null) {
    return false
  }
  const fields = new Map(Object.entries(form))

  return Object.entries(ENUMS).every(([key, allowed]) => allowed.includes(String(fields.get(key)))) && TEXTS.every((key) => typeof fields.get(key) === "string")
}
