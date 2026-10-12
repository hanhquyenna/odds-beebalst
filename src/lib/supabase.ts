import { PostgrestClient } from "@supabase/postgrest-js"

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

const authedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers)
  headers.set("apikey", SUPABASE_ANON_KEY)
  headers.set("Authorization", `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`)
  const limit = AbortSignal.timeout(REQUEST_TIMEOUT_MS)

  return fetch(input, { ...init, headers, signal: init?.signal ? AbortSignal.any([init.signal, limit]) : limit })
}

/** PostgREST only. Auth is a handful of REST calls in auth.ts, so supabase-js stays out of the bundle. Anon key only. */
export const supabase: PostgrestClient = new PostgrestClient(`${SUPABASE_URL}/rest/v1`, {
  fetch: authedFetch,
})
