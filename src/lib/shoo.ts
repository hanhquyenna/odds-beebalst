import { ANON_KEY, SUPABASE_URL } from "@/lib/supabase"
import { signInWithTokenHash, storeSession, type Session } from "@/lib/auth"
import { SHOO_CALLBACK_PATH, isShooCallback, pictureOfIdToken, tokenHashOf } from "@/lib/shoo-url"
import type { ShooAuthClient } from "@shoojs/auth"

export { SHOO_CALLBACK_PATH, isShooCallback }
const NEXT_KEY = "careersim.shooNext"

/**
 * Google sign-in through Shoo (shoo.dev): a free Google-OAuth broker with no
 * signup and no keys. Google is the only door: the bridge edge function
 * (supabase/functions/verify-shoo) turns the Shoo token into a Supabase
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

/** Leaves the page for Google; Shoo sends the browser back to /auth/callback. */
export async function beginShooSignIn(): Promise<void> {
  await (await shoo()).startSignIn()
}

interface BridgeReply {
  action_link?: string
  error?: string
}

async function bridgeActionLink(idToken: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-shoo`, {
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

/** Runs on /auth/callback: trades the Shoo code for a Supabase session. */
export async function completeShooSignIn(): Promise<Session> {
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
    throw new Error(`Google sign-in failed talking to Google: ${messageOf(caught)}`)
  }
  let tokenHash: string | null
  try {
    tokenHash = tokenHashOf(await bridgeActionLink(idToken))
  } catch (caught) {
    throw new Error(`Google sign-in failed talking to our server: ${messageOf(caught)}`)
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

/** Remembers where the Shoo trip started ("jobs" for a fresh sign-up), across the redirect. */
export function rememberShooNext(next: string): void {
  try {
    window.sessionStorage.setItem(NEXT_KEY, next)
  } catch {
    return
  }
}

/** Reads and clears what rememberShooNext stored (null outside a Shoo trip). */
export function takeShooNext(): string | null {
  try {
    const next = window.sessionStorage.getItem(NEXT_KEY)
    window.sessionStorage.removeItem(NEXT_KEY)

    return next
  } catch {
    return null
  }
}
