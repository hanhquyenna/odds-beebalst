import { loadDraft } from "@/lib/draft"
import type { DutchLevel, Origin, Permit, Profile } from "@/lib/types"

/**
 * Signing up is one question: the LinkedIn link ("linkedin"). The backend reads the profile from it and the person goes straight to the jobs;
 * permit, origin, birth year, months abroad, Dutch and studying keep their defaults until they are edited in the settings, which still ask every
 * one of them (the steps from "permit" on are the edit page's questions, plus "contact", the optional account, reached from the LinkedIn screen).
 */
export const STEPS = ["welcome", "intro", "linkedin", "permit", "origin", "birth", "abroad", "dutch", "studying", "import", "contact"] as const

/** Steps that show a progress line. Welcome and the intro sit outside the count. */
export const COUNTED_STEPS: ReadonlyArray<Step> = ["permit", "origin", "birth", "abroad", "dutch", "studying", "import", "contact"]

export type Step = (typeof STEPS)[number]

export interface FormState {
  permit: Permit
  origin: Origin | ""
  birth: string
  abroad: string
  dutch: DutchLevel | ""
  /** "yes" studying now, "no" not studying, "" not said (then read from the education dates). */
  studying: "yes" | "no" | ""
  salary: string
}

export const PERMIT_OPTIONS: ReadonlyArray<{ value: Permit; label: string }> = [
  { value: "eu", label: "I am an EU or EEA citizen" },
  { value: "orientation_year", label: "Orientation year (zoekjaar): the one-year permit after you graduate" },
  { value: "hsm", label: "Highly skilled migrant" },
  { value: "other_non_eu", label: "Outside the EU, no work permit yet (for example on a student permit)" },
]

export const ORIGIN_OPTIONS: ReadonlyArray<{ value: Origin; label: string }> = [
  { value: "dutch", label: "The Netherlands" },
  { value: "eu_non_native", label: "Another EU country" },
  { value: "non_eu", label: "Outside the EU" },
]

export const DUTCH_OPTIONS: ReadonlyArray<{ value: DutchLevel; label: string }> = [
  { value: "none", label: "None" },
  { value: "basic", label: "Basic (A1 to B1)" },
  { value: "professional", label: "Professional (B2 to C1)" },
  { value: "native", label: "Native" },
]

export const STUDYING_OPTIONS: ReadonlyArray<{ value: "yes" | "no"; label: string }> = [
  { value: "yes", label: "Yes, I am studying now" },
  { value: "no", label: "No, I have graduated" },
]

/** Editing shows every question at once; signing up shows one at a time. */
export function asks(question: Step, current: Step, review: boolean): boolean {
  return review || question === current
}

export function describeBirth(value: string): string | null {
  const year = Number(value)
  const now = new Date().getFullYear()
  if (!value.trim() || !Number.isInteger(year)) {
    return "Give us a year, like 1999. It sets your permit threshold."
  }
  if (year < now - 70 || year > now - 15) {
    return `Somewhere between ${now - 70} and ${now - 15}.`
  }

  return null
}

export function describeAbroad(value: string): string | null {
  const months = Number(value)
  if (value.trim() === "" || !Number.isInteger(months) || months < 0 || months > 24) {
    return "A number of months from 0 to 24."
  }

  return null
}

/** A saved profile wins over a local draft: it is the same person, further along. */
export function firstStep(existing: Profile | null): Step {
  if (existing?.onboarded) {
    return "permit"
  }
  const draft = loadDraft()
  if (!draft || !isStep(draft.step)) {
    return "welcome"
  }

  // A draft left halfway through the old one-question-a-screen sign-up restarts at the one question that is left.
  return draft.step === "welcome" || draft.step === "intro" || draft.step === "contact" ? draft.step : "linkedin"
}

/** The primary action says what it will do. */
export function nextLabel(step: Step, form: FormState): string {
  if (step === "contact") {
    return "Create account"
  }
  if (step === "origin" && !form.origin) {
    return "Prefer not to say"
  }
  if (step === "dutch" && !form.dutch) {
    return "Not sure yet"
  }
  if (step === "studying" && !form.studying) {
    return "Not sure yet"
  }
  if (step === "import") {
    return "Next"
  }

  return "Next"
}

export function toFormState(existing: Profile | null): FormState {
  if (!existing?.onboarded) {
    const draft = loadDraft()
    if (draft) {
      return draft.form
    }
  }
  const base = existing?.onboarded ? existing : null

  return {
    permit: base?.permit ?? "other_non_eu",
    origin: base?.origin ?? "",
    birth: base ? String(base.birth) : "",
    abroad: base ? String(base.abroad) : "0",
    dutch: base?.dutch ?? "",
    studying: base?.studying === true ? "yes" : base?.studying === false ? "no" : "",
    salary: base?.salary ?? "",
  }
}

/** The profile the answers make, on top of whatever was already imported. */
export function toProfile(form: FormState, existing: Profile): Profile {
  return {
    ...existing,
    permit: form.permit,
    origin: form.origin || "non_eu",
    birth: Number(form.birth) || existing.birth,
    abroad: Number(form.abroad) || 0,
    dutch: form.dutch || "basic",
    studying: form.studying === "yes" ? true : form.studying === "no" ? false : null,
    salary: form.salary,
    onboarded: true,
  }
}

function isStep(value: string): value is Step {
  return STEPS.some((step) => step === value)
}
