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

export interface ApplicationState { status: "filling" | "needs_input" | "ready" | "failed" | "submitted"; message: string; at: number }
export interface ApplicationSignal { type?: string; url?: string; state?: ApplicationState | null; ok?: boolean; message?: string }
const applicationListeners = new Set<(signal: ApplicationSignal) => void>()
/** What the extension says about an application in a tab: its state, and whether a press opened (or found) its tab. */
export function onApplicationSignal(listener: (signal: ApplicationSignal) => void): () => void {
  applicationListeners.add(listener)
  return () => { applicationListeners.delete(listener) }
}

/** The page in front of the person, from the extension's side panel: the form on it, the job Odds knows it as, and how filling it goes. */
export type PageKind = "job" | "create_account" | "sign_in" | "captcha" | "form" | null
export interface PanelInfo {
  /** kind: what the page is (a job's page, an account to make, a sign-in, a captcha, the form); account: Odds made one on this site. */
  page: { tabId: number; url: string; title: string; form: boolean; kind?: PageKind; account?: boolean } | null
  connected?: boolean
  job?: { title: string; employer: string | null } | null
  job_id?: string | null
  cv?: string | null
  letter?: string | null
  missing?: string[]
  status?: { state: string; message: string } | null
  /** At review: the answers on the form Autofill does not have yet. */
  answers?: Array<{ question: string; answer: string; long?: boolean }>
  /** Rises each time the person opens a job from the page, including the same job again. */
  selection?: number
}
let panelInfo: PanelInfo | null = null
const panelListeners = new Set<(info: PanelInfo | null) => void>()
export function onPanelInfo(listener: (info: PanelInfo | null) => void): () => void {
  panelListeners.add(listener)
  listener(panelInfo)
  return () => { panelListeners.delete(listener) }
}
/** Ask the extension to act on the page in front: fill it, add its job, keep answers in Autofill. */
export function toExtension(message: Record<string, unknown>): void {
  const parent = extensionParent()
  if (parent) window.parent.postMessage({ source: "odds-site", ...message }, parent)
}

let pendingJob: string | null = null
const jobListeners = new Set<(id: string) => void>()
/** Deliver a selection to the mounted app without reloading its profile, CV library and job pool. */
export function onEmbeddedJob(listener: (id: string) => void): () => void {
  jobListeners.add(listener)
  if (pendingJob) { listener(pendingJob); pendingJob = null }
  return () => { jobListeners.delete(listener) }
}

/** In the panel: ask the extension for a sign-in when there is none, take what it sends, and answer its request to open a job. */
export function startEmbed(): void {
  const parent = extensionParent()
  if (!embedded || !parent) return
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== parent) return
    const data = event.data as { source?: string; type?: string; session?: unknown; id?: unknown; url?: string; state?: ApplicationState | null; ok?: boolean; message?: string } | null
    if (data?.source !== "odds-extension") return
    if (data.type === "session" && validSession(data.session)) {
      storeSession(data.session)
      // The app reads its sign-in when it opens: open it again, once, now that there is one.
      if (window.sessionStorage.getItem("odds:embedded-reloaded") !== "1") {
        window.sessionStorage.setItem("odds:embedded-reloaded", "1")
        window.location.reload()
      }
    }
    if (data.type === "panel-info") {
      panelInfo = ((data as { info?: PanelInfo | null }).info ?? null)
      panelListeners.forEach((listener) => listener(panelInfo))
    }
    if (data.type === "application-status" || data.type === "application-started") applicationListeners.forEach((listener) => listener(data as ApplicationSignal))
    if (data.type === "open-job" && typeof data.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(data.id)) {
      if (jobListeners.size) for (const listener of jobListeners) listener(data.id)
      else pendingJob = data.id
    }
  })
  const now = Math.floor(Date.now() / 1000)
  const mine = loadSession()
  if (!mine || mine.expires_at < now - 60) window.parent.postMessage({ source: "odds-site", type: "need-session" }, parent)
  else window.parent.postMessage({ source: "odds-site", type: "ready" }, parent)
}
