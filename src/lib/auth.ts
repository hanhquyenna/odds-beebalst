import { ANON_KEY, SUPABASE_URL, setAccessToken } from "@/lib/supabase"

export interface Session {
  access_token: string
  refresh_token: string
  expires_at: number
  user: { id: string; email: string }
}

const STORE = "careersim.session"

export function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(STORE)

    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function keep(session: Session | null): void {
  setAccessToken(session?.access_token ?? null)
  try {
    if (session) {
      window.localStorage.setItem(STORE, JSON.stringify(session))
    } else {
      window.localStorage.removeItem(STORE)
    }
  } catch {
    return
  }
}

interface AuthResponse {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  user?: { id: string; email?: string }
  id?: string
  email?: string
  msg?: string
  error_description?: string
  error?: string
  message?: string
}

async function call(path: string, body: unknown): Promise<AuthResponse> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = (await response.json().catch(() => ({}))) as AuthResponse
  if (!response.ok) {
    throw new Error(data.error_description ?? data.msg ?? data.message ?? data.error ?? "Sign in failed")
  }

  return data
}

function toSession(data: AuthResponse): Session | null {
  if (!data.access_token || !data.refresh_token) {
    return null
  }
  const id = data.user?.id ?? ""

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    user: { id, email: data.user?.email ?? "" },
  }
}

const DEV_OUT = "careersim.devSignedOut"

/**
 * Local development only: signs in with the account named in .env.local (VITE_DEV_EMAIL and VITE_DEV_PASSWORD), so
 * testing needs no form. Vite removes this branch from a production build. Signing out stays signed out until the tab closes.
 */
async function devSignIn(): Promise<Session | null> {
  if (!import.meta.env.DEV) {
    return null
  }
  const email = import.meta.env.VITE_DEV_EMAIL as string | undefined
  const password = import.meta.env.VITE_DEV_PASSWORD as string | undefined
  try {
    if (!email || !password || window.sessionStorage.getItem(DEV_OUT)) {
      return null
    }
    const session = toSession(await call("token?grant_type=password", { email, password }))
    keep(session)

    return session
  } catch {
    return null
  }
}

/** A one-time code that signs a phone in: "qr" for the QR code on a computer, "home" for an iPhone's Home Screen app. */
export async function createPhoneLink(session: Session, kind: "qr" | "home"): Promise<{ code: string; expires_at: string }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/phone-link`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", kind }),
  })
  const data = (await response.json().catch(() => ({}))) as { code?: string; expires_at?: string; error?: string }
  if (!response.ok || !data.code || !data.expires_at) {
    throw new Error(data.error ?? "Could not make a link")
  }

  return { code: data.code, expires_at: data.expires_at }
}

/**
 * Opened from a phone link (?link=…): trades the code for a session. An iPhone in Safari leaves a Home Screen code
 * (marked &notify=1) for the Home Screen app to use, so that one is only spent once odds runs from the Home Screen.
 */
async function phoneLinkSession(): Promise<Session | null> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get("link")
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (!code || (params.get("notify") === "1" && !standalone)) {
    if (code) void import("@/lib/trace").then(({ trace }) => trace("link_kept_for_home_screen"))
    return null
  }
  params.delete("link")
  window.history.replaceState(null, "", `${window.location.pathname}${params.size > 0 ? `?${params}` : ""}${window.location.hash}`)
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/phone-link`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "redeem", code }),
    })
    void import("@/lib/trace").then(({ trace }) => trace("link_redeem", { ok: response.ok, status: response.status }))
    if (!response.ok) {
      return null
    }
    const session = toSession((await response.json()) as AuthResponse)
    keep(session)

    return session
  } catch {
    return null
  }
}

/**
 * A guest account for someone who imported LinkedIn without making one: no email, no password. It keeps their profile,
 * moves them to their phone and gets them the morning message until real sign-in exists.
 */
export async function startGuestSession(): Promise<Session | null> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/phone-link`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "guest" }),
    })
    if (!response.ok) {
      return null
    }
    const session = toSession((await response.json()) as AuthResponse)
    keep(session)

    return session
  } catch {
    return null
  }
}

/** A guest account's placeholder address, never shown as the person's email. */
export function isGuestEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.endsWith("@guest.odds.invalid"))
}

/** Restores the stored session, refreshing it when it is about to expire. */
export async function restoreSession(): Promise<Session | null> {
  const linked = await phoneLinkSession()
  if (linked) {
    return linked
  }
  const stored = loadSession()
  if (!stored) {
    return devSignIn()
  }
  if (stored.expires_at - 60 > Math.floor(Date.now() / 1000)) {
    keep(stored)

    return stored
  }
  try {
    const next = toSession(await call("token?grant_type=refresh_token", { refresh_token: stored.refresh_token }))
    keep(next)

    return next
  } catch {
    keep(null)

    return null
  }
}

export async function signInWithPassword(email: string, password: string): Promise<Session> {
  const session = toSession(await call("token?grant_type=password", { email, password }))
  if (!session) {
    throw new Error("Sign in failed")
  }
  keep(session)
  try {
    window.sessionStorage.removeItem(DEV_OUT)
  } catch {
    // nothing to clear
  }

  return session
}

/** Returns the session, or null when the project wants the email confirmed first. */
export async function signUp(email: string, password: string): Promise<Session | null> {
  const session = toSession(await call("signup", { email, password }))
  keep(session)

  return session
}

export function signOut(): void {
  keep(null)
  try {
    window.sessionStorage.setItem(DEV_OUT, "1")
  } catch {
    return
  }
}
