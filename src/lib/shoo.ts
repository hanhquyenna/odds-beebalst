import { startPairing } from "@/lib/pairing"
import { isInstalled } from "@/lib/push"
import { ANON_KEY, SUPABASE_URL } from "@/lib/supabase"
import { signInWithTokenHash, storeSession, type Session } from "@/lib/auth"
import { SHOO_CALLBACK_PATH, isShooCallback, pictureOfIdToken, tokenHashOf } from "@/lib/shoo-url"
import type { ShooAuthClient } from "@shoojs/auth"

export { SHOO_CALLBACK_PATH, isShooCallback }
const NEXT_KEY = "careersim.shooNext"

/**
 * Google sign-in through Shoo (shoo.dev): a free Google-OAuth broker with no
 * signup and no keys. Google is the only door: the bridge edge function
 * (supabase/functions/account/shoo.ts) turns the Shoo token into a Supabase
 * session, and the Supabase session stays the authority, so every row-level
 * policy keeps working unchanged. This file never trusts the browser token
 * on its own.
 */

let client: ShooAuthClient | null = null

async function shoo(): Promise<ShooAuthClient> {
  if (!client) {
    // Lazy so pages that never touch sign-in never load the SDK.
    const { createShooAuth } = await import("@shoojs/auth")
    // PII on: the bridge links accounts by verified email, so sign-in asks
    // for it once on Shoo's consent screen.
    client = createShooAuth({ callbackPath: SHOO_CALLBACK_PATH, requestPii: true })
  }

  return client
}

/**
 * Leaves the page for Google; Shoo sends the browser back to /auth/callback ("redirect"). A Home Screen app cannot
 * finish that trip (it comes back in another browser context, without the PKCE secret), so there the sign-in happens in
 * the browser and the app collects it ("browser", see src/lib/pairing.ts).
 */
export async function beginShooSignIn(): Promise<"redirect" | "browser"> {
  if (isInstalled()) {
    await startPairing()
    return "browser"
  }
  await (await shoo()).startSignIn()
  return "redirect"
}

interface BridgeReply {
  action_link?: string
  error?: string
}

async function bridgeActionLink(idToken: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/account/shoo`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ idToken }),
  })
  // Undeployed function: the gateway answers 404 (as JSON), so there is no content-type sniffing here.
  if (res.status === 404) {
    throw new Error("Google sign-in is not switched on yet.")
  }
  const body = (await res.json().catch(() => ({}))) as BridgeReply
  if (!res.ok || !body.action_link) {
    throw new Error(body.error ?? "Google sign-in failed.")
  }

  return body.action_link
}

let finishing: Promise<Session> | null = null

/**
 * Runs on /auth/callback: trades the Shoo code for a Supabase session. The code works once, so a second call while the first is
 * running (a remount, or a dev hot reload) shares it instead of finding the code gone and reporting a cancelled sign-in.
 */
export function completeShooSignIn(): Promise<Session> {
  finishing ??= finishShooSignIn().finally(() => {
    finishing = null
  })

  return finishing
}

async function finishShooSignIn(): Promise<Session> {
  const auth = await shoo()
  let idToken: string
  try {
    const out = await auth.finishSignIn({ clearCallbackParams: true, redirectAfter: false })
    if (!out?.id_token) {
      throw new Error("Google sign-in was cancelled.")
    }
    idToken = out.id_token
  } catch (caught) {
    if (caught instanceof Error && caught.message === "Google sign-in was cancelled.") {
      throw caught
    }
    throw new Error(`Google sign-in failed talking to Google: ${messageOf(caught)}`, { cause: caught })
  }
  let tokenHash: string | null
  try {
    tokenHash = tokenHashOf(await bridgeActionLink(idToken))
  } catch (caught) {
    throw new Error(`Google sign-in failed talking to our server: ${messageOf(caught)}`, { cause: caught })
  }
  auth.clearIdentity()
  if (!tokenHash) {
    throw new Error("Google sign-in failed talking to our server: empty answer.")
  }
  const session = await signInWithTokenHash(tokenHash)
  // The photo is fresh every sign-in and rides in the session, so the header
  // shows it without touching the saved profile (and its sync).
  const picture = pictureOfIdToken(idToken)
  if (!picture) {
    return session
  }
  const withPhoto: Session = { ...session, user: { ...session.user, avatar: picture } }
  storeSession(withPhoto)

  return withPhoto
}

function messageOf(caught: unknown): string {
  return caught instanceof Error && caught.message ? caught.message : "no answer"
}

/** Where a Shoo trip started and what address it left: survives new tabs and failed attempts, unlike the redirect itself. */
export interface ShooNext {
  next: "jobs" | "account"
  search: string
}

/** Remembers where the Shoo trip started ("jobs" for a fresh sign-up, "account" for a plain sign-in), across the redirect. */
export function rememberShooNext(next: "jobs" | "account"): void {
  try {
    window.localStorage.setItem(NEXT_KEY, JSON.stringify({ next, search: window.location.search }))
  } catch {
    return
  }
}

/** Reads and clears what rememberShooNext stored (null outside a Shoo trip, or for anything unexpected). */
export function takeShooNext(): ShooNext | null {
  try {
    const raw = window.localStorage.getItem(NEXT_KEY)
    window.localStorage.removeItem(NEXT_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<ShooNext>
    if (parsed.next !== "jobs" && parsed.next !== "account") {
      return null
    }

    return { next: parsed.next, search: typeof parsed.search === "string" && parsed.search.startsWith("?") ? parsed.search : "" }
  } catch {
    return null
  }
}

/** Drops a remembered destination without reading it (sign-out). */
export function clearShooNext(): void {
  try {
    window.localStorage.removeItem(NEXT_KEY)
  } catch {
    return
  }
}

/** Forgets the Shoo broker identity, so the next trip starts clean (sign-out). */
export async function forgetShooIdentity(): Promise<void> {
  ;(await shoo()).clearIdentity()
}

/** False when the browser blocks site data: a sign-in could never persist, so say so instead of looping. */
export function storageAvailable(): boolean {
  try {
    const key = "careersim.storageTest"
    window.localStorage.setItem(key, "1")
    window.localStorage.removeItem(key)
    window.sessionStorage.setItem(key, "1")
    window.sessionStorage.removeItem(key)

    return true
  } catch {
    return false
  }
}

/** Watches a redirect handoff: when the page is still here after a while, the redirect was blocked. Returns its cancel. */
export function redirectWatch(onStuck: () => void, ms = 10000): () => void {
  const id = window.setTimeout(onStuck, ms)

  return () => window.clearTimeout(id)
}
