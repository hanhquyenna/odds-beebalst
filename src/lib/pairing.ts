import { useSyncExternalStore } from "react"
import { startDevicePair } from "@/lib/auth"
import { platformOf } from "@/lib/push"

/**
 * A Home Screen app cannot finish a Google sign-in itself: the trip to Google comes back in a different browser context,
 * without the secret the app kept (the "Missing PKCE verifier" error). So the app signs in through the browser instead:
 * it opens the browser at ?pair=<id>, the person signs in there and types the short code the app shows, and the
 * app collects its own session. This file keeps the two sides' state: the pair the app waits on, and the one the
 * browser was asked to approve.
 */

const WAITING_KEY = "odds:pair-waiting"
const APPROVE_KEY = "odds:pair-approve"

export interface WaitingPair {
  id: string
  secret: string
  code: string
  expires_at: string
}

const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // fine without it: the person can start again
  }
  emit()
}

/** Opens a page of this site in the phone's browser, out of the Home Screen app: Safari on an iPhone. */
export function openInBrowser(url: string): void {
  if (platformOf() === "ios") {
    window.location.href = url.replace(/^https:/, "x-safari-https:").replace(/^http:/, "x-safari-http:")
  } else {
    window.open(url, "_blank", "noopener")
  }
}

export function pairUrl(id: string): string {
  return `${window.location.origin}/?pair=${encodeURIComponent(id)}`
}

/** In the Home Screen app: start a pair and send the person to the browser to sign in. */
export async function startPairing(): Promise<void> {
  const pair = await startDevicePair()
  write(WAITING_KEY, JSON.stringify(pair))
  openInBrowser(pairUrl(pair.id))
}

export function cancelPairing(): void {
  write(WAITING_KEY, null)
}

let waitingRaw: string | null = null
let waitingValue: WaitingPair | null = null
function waitingSnapshot(): WaitingPair | null {
  const raw = read(WAITING_KEY)
  if (raw !== waitingRaw) {
    waitingRaw = raw
    try {
      const parsed = raw ? (JSON.parse(raw) as WaitingPair) : null
      waitingValue = parsed && Date.parse(parsed.expires_at) > Date.now() ? parsed : null
    } catch {
      waitingValue = null
    }
  }

  return waitingValue
}

/** The pair this Home Screen app is waiting on, or null. */
export function useWaitingPair(): WaitingPair | null {
  return useSyncExternalStore(subscribe, waitingSnapshot, () => null)
}

/** In the browser: a page opened at ?pair=<id> keeps the id (across the Google round trip) until it is approved. */
export function takePairFromUrl(): void {
  const params = new URLSearchParams(window.location.search)
  const id = params.get("pair")
  if (!id || !/^[A-Za-z0-9_-]{20,64}$/.test(id)) {
    return
  }
  params.delete("pair")
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size > 0 ? `?${params}` : ""}${window.location.hash}`)
  write(APPROVE_KEY, id)
}

export function clearApproval(): void {
  write(APPROVE_KEY, null)
}

/** The pair this browser was asked to approve, or null. */
export function useApprovalId(): string | null {
  return useSyncExternalStore(subscribe, () => read(APPROVE_KEY), () => null)
}
