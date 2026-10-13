import { loadSession, storeSession, type Session } from "@/lib/auth"
import { embedded, extensionParent } from "@/lib/embedded"

/**
 * The sign-in handshake of the odds app inside the odds browser extension's panel (see embedded.ts): the app asks its parent for a session and the
 * extension answers with one made from its key (supabase/functions/mcp/server.ts, /ext/session). Loaded only when the page is framed by an extension.
 */
const validSession = (v: unknown): v is Session => {
  const s = v as Partial<Session> | null

  return Boolean(s && typeof s.access_token === "string" && typeof s.refresh_token === "string" && typeof s.expires_at === "number" && s.user && typeof s.user.id === "string")
}

/** In the panel: ask the extension for a sign-in when there is none, take what it sends, and answer its request to open a job. */
export function startEmbed(): void {
  const parent = extensionParent()
  if (!embedded || !parent) return
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== parent) return
    const data = event.data as { source?: string; type?: string; session?: unknown; id?: unknown } | null
    if (data?.source !== "odds-extension") return
    if (data.type === "session" && validSession(data.session)) {
      storeSession(data.session)
      // The app reads its sign-in when it opens: open it again, once, now that there is one.
      if (window.sessionStorage.getItem("odds:embedded-reloaded") !== "1") {
        window.sessionStorage.setItem("odds:embedded-reloaded", "1")
        window.location.reload()
      }
    }
    if (data.type === "open-job" && typeof data.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(data.id)) window.location.assign(`/job/${data.id}`)
  })
  const now = Math.floor(Date.now() / 1000)
  const mine = loadSession()
  if (!mine || mine.expires_at < now - 60) window.parent.postMessage({ source: "odds-site", type: "need-session" }, parent)
  else window.parent.postMessage({ source: "odds-site", type: "ready" }, parent)
}
