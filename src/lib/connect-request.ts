import { readStored } from "@/lib/remembered"

/**
 * An app (Claude) asking to be connected to someone's odds: it sends the person to /connect/claude with its request in the
 * address (supabase/functions/mcp/oauth.ts). Kept here across the Google sign-in; the card that answers it is loaded only then
 * (src/components/ConnectApproval.tsx, src/lib/connect-answer.ts).
 */
export const CONNECT_KEY = "odds:oauth-connect"
const KEEP_MS = 15 * 60 * 1000

export interface ConnectRequest {
  client_id: string
  redirect_uri: string
  state: string
  code_challenge: string
  code_challenge_method: string
  until: number
}

/** On load: /connect/claude?... becomes a kept request and the address goes back to the front page. */
export function takeConnectFromUrl(): void {
  if (window.location.pathname !== "/connect/claude") return
  const p = new URLSearchParams(window.location.search)
  const request = { client_id: p.get("client_id") ?? "", redirect_uri: p.get("redirect_uri") ?? "", state: p.get("state") ?? "", code_challenge: p.get("code_challenge") ?? "", code_challenge_method: p.get("code_challenge_method") ?? "" }
  window.history.replaceState(window.history.state, "", "/")
  try {
    if (request.client_id && request.redirect_uri && request.code_challenge) window.localStorage.setItem(CONNECT_KEY, JSON.stringify({ ...request, until: Date.now() + KEEP_MS }))
  } catch {
    // fine without it: the person can start again from Claude
  }
}

/** Whether a request is waiting (read once when the app opens; the card that answers it keeps track after that). */
export const connectWaiting = (): boolean => readStored(CONNECT_KEY) !== null
