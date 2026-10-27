
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.")
}

export const ANON_KEY = SUPABASE_ANON_KEY

let accessToken: string | null = null

/** The signed-in user's JWT. Null means requests go out as the anonymous role. */
export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** The signed-in user's JWT, for calls outside PostgREST (edge functions). */
export function currentAccessToken(): string | null {
  return accessToken
}

/**
 * A request that never answers is cut off after this long. A Home Screen app is put to sleep while the person is elsewhere (the
 * browser, another app) and a request in flight then never settles, which left the page waiting for ever.
 */
export const REQUEST_TIMEOUT_MS = 30_000
