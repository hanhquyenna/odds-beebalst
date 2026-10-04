/**
 * Pure Shoo helpers: no network, no storage, no env, so unit tests can reach
 * them without a Supabase project. The orchestration lives in shoo.ts.
 */

/** The path Shoo redirects back to after Google. */
export const SHOO_CALLBACK_PATH = "/auth/callback"

/** True on the path Shoo redirects back to after Google. */
export function isShooCallback(pathname: string): boolean {
  return pathname === SHOO_CALLBACK_PATH || pathname.startsWith(`${SHOO_CALLBACK_PATH}/`)
}

/**
 * Supabase hides the one-time token inside the magic-link URL the bridge
 * hands back; the app signs in with it directly, no email round-trip.
 */
export function tokenHashOf(actionLink: string): string | null {
  for (const part of actionLink.split("#")[0].split(/[?&]/)) {
    const [key, value] = part.split("=")
    if ((key === "token_hash" || key === "token") && value) {
      return decodeURIComponent(value)
    }
  }

  return null
}
