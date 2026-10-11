/**
 * A CV as the way in, for anyone without a public LinkedIn (or when reading LinkedIn fails): read here in the browser, it fills
 * the roles, degrees and skills still empty, and its text is what the chance is worked out from. Nothing is sent anywhere to read it.
 */
import type { Profile } from "@/lib/types"

export const CV_ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"

/** The profile with this CV read into it. Throws an Error with a message a person can act on. */
export async function profileWithCv(profile: Profile, file: File): Promise<Profile> {
  const [{ readCvFile, CvReadError }, { fillFromCv }] = await Promise.all([import("@/lib/cv-file"), import("@/lib/cv-parse")])
  let text: string
  try {
    text = (await readCvFile(file)).text
  } catch (caught) {
    throw new Error(caught instanceof CvReadError ? caught.message : "We could not read that file. Try a PDF or Word file.", { cause: caught })
  }

  return { ...profile, ...fillFromCv(profile, text).patch, cv: text, cvName: file.name.replace(/\.[a-z0-9]{1,5}$/i, "") }
}
