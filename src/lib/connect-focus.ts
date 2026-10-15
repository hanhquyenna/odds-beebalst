const FOCUS_KEY = "odds:connect-focus"

export type ConnectFocus = "drive" | "gmail" | "extension"

/** Remember which Connect card to ring when opening that page (e.g. upload without Drive). */
export function rememberConnectFocus(which: ConnectFocus): void {
  try {
    sessionStorage.setItem(FOCUS_KEY, which)
  } catch {
    // Blocked storage: the page still opens, without the ring.
  }
}

export function takeConnectFocus(): ConnectFocus | null {
  try {
    const v = sessionStorage.getItem(FOCUS_KEY)
    sessionStorage.removeItem(FOCUS_KEY)
    return v === "drive" || v === "gmail" || v === "extension" ? v : null
  } catch {
    return null
  }
}
