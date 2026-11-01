/** The unfinished sign-up form. lib/draft.ts reads and writes it; clearing lives here so sign out needs no schema. */
export const DRAFT_KEY = "careersim.draft"

/** Forgets the draft once the answers are saved, or the person signs out. */
export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch {
    return
  }
}
