/**
 * Whether this page is the odds app shown inside the odds browser extension's panel on another site (extension/panel.html frames it). There it is the
 * phone app in a narrow column, with no install or notification cards. Kept apart from the sign-in handshake (embed.ts) so the first page carries only this.
 */
const FLAG = "odds:embedded"

function framed(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** The extension that framed this page, as its origin ("chrome-extension://<id>"), or null when this page is not framed by one. */
export function extensionParent(): string | null {
  const origins = window.location.ancestorOrigins
  const first = origins && origins.length > 0 ? origins[0] : ""

  return /^chrome-extension:\/\/[a-p]{32}$/.test(first) ? first : null
}

export const embedded: boolean = (() => {
  if (!framed()) return false
  try {
    if (new URLSearchParams(window.location.search).get("embed") === "ext") window.sessionStorage.setItem(FLAG, "1")

    return window.sessionStorage.getItem(FLAG) === "1" && extensionParent() !== null
  } catch {
    return false
  }
})()
