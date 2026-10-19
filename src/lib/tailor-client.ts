/**
 * Tailoring from the app's side: what to ask for (the keywords the posting insists on, from the same checklist the chance uses), the call to the
 * `tailor` function, a second check of what comes back, and saving the accepted version as a new document on the job. The main CV is never touched:
 * the copy is a new document, attached to this job.
 */
import { currentAccessToken, ANON_KEY, SUPABASE_URL } from "@/lib/supabase"
import { SKILLS, skillLabel } from "@/lib/skills"
import type { Standing } from "@/lib/engine"
import type { Posting, Profile } from "@/lib/types"
import { cleanCv, cvText, renderCvOnePage, renderLetterPdf, type Cv } from "../../supabase/functions/_shared/cv-template"
import { leaks, type Change, type Facts, type Tailored, type Wanted } from "../../supabase/functions/_shared/tailor-cv"

export type { Change, Tailored }

/** The keywords this posting wants, with how much it insists on each, found by the same rules the chance uses. */
export function wantedFor(post: Pick<Posting, "tiers">, st: Pick<Standing, "checklist">): Wanted[] {
  return st.checklist.flatMap(({ skill }) => {
    const name = skill.toLowerCase()
    // A skill the rules know is found by its own pattern; any other is found by its own words.
    const pattern = SKILLS[name]?.source ?? `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`

    return name ? [{ name, label: skillLabel(name), tier: post.tiers?.[skill] ?? post.tiers?.[name] ?? "must", pattern }] : []
  })
}

/** What else is true of the person besides the CV text: skills, roles, schooling and languages from the profile, and how to reach them. */
export function factsFor(profile: Profile): Facts {
  const part = (rows: Array<Record<string, string>>, keys: string[]): string[] => rows.map((r) => keys.map((k) => r[k] ?? "").filter(Boolean).join(" ")).filter(Boolean)
  const extra = [
    ...part(profile.skills, ["Name"]),
    ...part(profile.positions, ["Title", "Company Name", "Description"]),
    ...part(profile.education, ["School Name", "Degree Name", "Field Of Study", "Notes"]),
    ...part(profile.languages, ["Name"]),
  ].join("\n")
  const name = profile.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ")

  return { extra, name: name || undefined, email: profile.email || undefined, phone: profile.phone || undefined, place: profile.place || undefined, linkedin: profile.linkedin || undefined }
}

export class TailorError extends Error {}

export type CvDraft = { kind: "cv"; result: Tailored }
export interface LetterResult {
  letter: string
  changes: Change[]
  added_keywords: string[]
  missing: Array<{ name: string; label: string; tier: string }>
}
export type LetterDraft = { kind: "cover_letter"; result: LetterResult }

export async function requestDraft(body: Record<string, unknown>): Promise<CvDraft | LetterDraft> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/tailor/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${currentAccessToken() ?? ANON_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(150_000),
  }).catch(() => null)
  if (!res) throw new TailorError("Odds could not be reached. Check your connection and try again.")
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok || !data || data.error) throw new TailorError(data?.error ?? "That did not work. Try again.")

  return data as unknown as CvDraft | LetterDraft
}

/** The same rule again on this side: a draft that names a keyword nothing backs is never shown. */
export function assertHonest(draft: CvDraft | LetterDraft, wanted: Wanted[]): void {
  const missing = wanted.filter((w) => draft.result.missing.some((m) => m.name === w.name))
  const text = draft.kind === "cv" ? cvText(draft.result.cv) : draft.result.letter
  if (leaks(text, missing).length > 0) throw new TailorError("Odds could not rewrite this safely. Nothing was changed.")
}

/** Puts a line the person edited in place of the one Odds wrote, wherever it stands in the CV. */
export function replaceLine(cv: Cv, from: string, to: string): Cv {
  const swap = (t: string | undefined): string | undefined => (t === from ? to : t)

  return {
    ...cv,
    headline: swap(cv.headline),
    summary: swap(cv.summary),
    experience: cv.experience.map((j) => ({ ...j, bullets: j.bullets.map((b) => (b === from ? to : b)) })),
    education: cv.education.map((e) => ({ ...e, details: swap(e.details) })),
    projects: cv.projects.map((p) => ({ ...p, bullets: p.bullets.map((b) => (b === from ? to : b)) })),
  }
}

/** Makes the PDF (one page, Odds's one CV format; the letter in its letter format) and keeps it as a new document attached to the job. */
export async function savePdf(kind: "cv" | "cover_letter", content: Cv | string, name: string, who: string): Promise<File> {
  const lib = await import("pdf-lib")
  let bytes: Uint8Array
  if (kind === "cv") {
    const checked = cleanCv(content)
    if ("error" in checked) throw new TailorError("This CV is missing something: " + checked.error)
    const made = await renderCvOnePage(lib as never, checked.cv)
    if (made.pages > 1) throw new TailorError("This CV does not fit one page. Shorten a line or two and save again.")
    bytes = made.bytes
  } else {
    bytes = await renderLetterPdf(lib as never, who, typeof content === "string" ? content : "")
  }

  return new File([bytes.slice().buffer as ArrayBuffer], `${name.replace(/[^\w .-]+/g, "").trim() || (kind === "cv" ? "CV" : "Cover letter")}.pdf`, { type: "application/pdf" })
}
