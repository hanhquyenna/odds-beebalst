/**
 * The CV someone uploaded on the way in (before they have an account). It is kept in memory until the guest account exists and the
 * documents are loaded, then saved to Documents as their main CV (use-documents.ts), so the CV they just gave us is there when they
 * open Documents. Lost on a reload, which is fine: the text is already in the profile and they can add the file again.
 */
let pending: File | null = null

export const rememberPendingCv = (file: File): void => {
  pending = file
}

export const takePendingCv = (): File | null => {
  const file = pending
  pending = null

  return file
}
