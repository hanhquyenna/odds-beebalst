import type { Session } from "@/lib/auth"
import { useSyncExternalStore } from "react"
import { CONNECT_KEY, type ConnectRequest } from "@/lib/connect-request"
import { readStored } from "@/lib/remembered"
import { ANON_KEY, SUPABASE_URL } from "@/lib/supabase"

// Loaded with the sign-in card only: the request being answered, what the person is asked, and the answer sent to the server
// (supabase/functions/mcp/oauth.ts).

const listeners = new Set<() => void>()
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

let raw: string | null = null
let value: ConnectRequest | null = null
function snapshot(): ConnectRequest | null {
  const now = readStored(CONNECT_KEY)
  if (now !== raw) {
    raw = now
    try {
      const parsed = now ? (JSON.parse(now) as ConnectRequest) : null
      value = parsed && parsed.until > Date.now() ? parsed : null
    } catch {
      value = null
    }
  }

  return value
}

export function useConnectRequest(): ConnectRequest | null {
  return useSyncExternalStore(subscribe, snapshot, () => null)
}

export function dropConnectRequest(): void {
  try {
    window.localStorage.removeItem(CONNECT_KEY)
  } catch {
    // fine without it
  }
  listeners.forEach((l) => l())
}

async function call(session: Session, request: ConnectRequest, action: "check" | "allow" | "deny"): Promise<Record<string, string>> {
  const { until: _until, ...asked } = request
  const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp/oauth/authorize`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...asked, action }),
  })
  const data = (await response.json().catch(() => ({}))) as Record<string, string>
  if (!response.ok) throw new Error(data.error_description ?? "That did not work. Start again from Claude.")

  return data
}

/** Who is asking, for the question the person is about to answer. */
export const whoIsAsking = (session: Session, request: ConnectRequest): Promise<{ client_name: string; host: string }> => call(session, request, "check") as Promise<{ client_name: string; host: string }>

/** Answers the app: where to send the person back to, with a code (allow) or a refusal (deny). */
export async function answerConnect(session: Session, request: ConnectRequest, allow: boolean): Promise<string> {
  const data = await call(session, request, allow ? "allow" : "deny")
  if (!data.redirect) throw new Error("That did not work. Start again from Claude.")

  return data.redirect
}
