/** First-run Connect tour: dismissed after the extension is linked in this browser. */
export const EXTENSION_ONBOARD_DONE_KEY = "odds:extension-onboard-done"

export function extensionOnboardDone(): boolean {
  try {
    return globalThis.localStorage.getItem(EXTENSION_ONBOARD_DONE_KEY) === "1"
  } catch {
    return false
  }
}

export function markExtensionOnboardDone(): void {
  try {
    globalThis.localStorage.setItem(EXTENSION_ONBOARD_DONE_KEY, "1")
  } catch {
    // Blocked storage: tour may show again; Connect still works.
  }
}

/** Optional guided video (Vite). Empty = poster + steps only — never a fake player. */
export function extensionOnboardVideoUrl(): string | null {
  const raw = (import.meta.env.VITE_EXTENSION_ONBOARD_VIDEO_URL as string | undefined)?.trim()
  return raw || null
}

/** Show the tour until Connect succeeds (or the person already linked). */
export function shouldShowExtensionOnboard(opts: {
  present: "looking" | "yes" | "no"
  linked: boolean
  force?: boolean
}): boolean {
  if (opts.force) return true
  if (opts.linked) return false
  if (extensionOnboardDone()) return false
  return opts.present !== "looking"
}
