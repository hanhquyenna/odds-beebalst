import { useEffect, useState } from "react"
import { readStored } from "@/lib/remembered"
import { supabase } from "@/lib/supabase"

/**
 * The odds browser extension asking to be connected: its popup opens /connect/extension. Kept here across the Google sign-in (the address
 * goes back to the front page, like /connect/claude). The page and the extension find each other with window messages, because the
 * extension's script runs on this site (extension/content-site.js); the key goes to the extension that way and nowhere else.
 */
export const EXTENSION_KEY = "odds:extension-connect"
const KEEP_MS = 15 * 60 * 1000

export function takeExtensionFromUrl(): void {
  if (window.location.pathname !== "/connect/extension") return
  window.history.replaceState(window.history.state, "", "/")
  try {
    window.localStorage.setItem(EXTENSION_KEY, JSON.stringify({ until: Date.now() + KEEP_MS }))
  } catch {
    // fine without it: the person can press Connect in the extension again
  }
}

export const extensionWaiting = (): boolean => {
  const raw = readStored(EXTENSION_KEY)
  try {
    return raw !== null && Number((JSON.parse(raw) as { until?: number }).until) > Date.now()
  } catch {
    return false
  }
}

export function dropExtensionRequest(): void {
  try {
    window.localStorage.removeItem(EXTENSION_KEY)
  } catch {
    // nothing to drop
  }
}

/** Ask the content script if the extension is in this browser (and whether it has a key). */
export function pingExtension(): void {
  window.postMessage({ source: "odds-site", type: "ping" }, window.location.origin)
}

export type ExtensionLinkState = {
  present: "looking" | "yes" | "no"
  /** True when the extension answered and has a saved Odds key (Connect finished). */
  linked: boolean
  /** Non-secret “signed in recently in this Chrome” timestamps from the extension (Connect chips only). */
  boards: { linkedin?: number; indeed?: number; glassdoor?: number }
}

/**
 * Whether the extension answered the page, and whether Connect already stored a key.
 * Re-checks when the tab is focused again (after Install).
 */
export function useExtensionLink(): ExtensionLinkState {
  const [present, setPresent] = useState<"looking" | "yes" | "no">("looking")
  const [linked, setLinked] = useState(false)
  const [boards, setBoards] = useState<ExtensionLinkState["boards"]>({})
  useEffect(() => {
    let timer = 0
    const on = (event: MessageEvent): void => {
      const data = event.data as { source?: string; type?: string; linked?: boolean; boards?: ExtensionLinkState["boards"] } | null
      if (event.source !== window || event.origin !== window.location.origin || data?.source !== "odds-extension") return
      if (data.type === "present" || data.type === "connected") {
        setPresent("yes")
        if (typeof data.linked === "boolean") setLinked(data.linked)
        if (data.type === "connected") setLinked(true)
        if (data.boards && typeof data.boards === "object") setBoards(data.boards)
      }
    }
    const look = (): void => {
      setPresent((s) => (s === "yes" ? "yes" : "looking"))
      pingExtension()
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setPresent((s) => (s === "looking" ? "no" : s)), 1500)
    }
    window.addEventListener("message", on)
    window.addEventListener("focus", look)
    document.addEventListener("visibilitychange", look)
    look()

    return () => {
      window.removeEventListener("message", on)
      window.removeEventListener("focus", look)
      document.removeEventListener("visibilitychange", look)
      window.clearTimeout(timer)
    }
  }, [])

  return { present, linked, boards }
}

/** Whether the extension answered the page: "no" after a moment without an answer. */
export function useExtensionPresent(): "looking" | "yes" | "no" {
  return useExtensionLink().present
}

/** Chrome Web Store listing, when published. Until then Connect offers a zip to load unpacked. */
export const chromeStoreUrl = (): string | null => {
  const raw = (import.meta.env.VITE_CHROME_EXTENSION_URL as string | undefined)?.trim()
  return raw || null
}

/** Makes the person's extension key and hands it to the extension; resolves when the extension says it has it. */
export async function connectExtension(): Promise<void> {
  const { data, error } = await supabase.rpc("create_extension_key")
  if (error || typeof data !== "string") throw new Error("Could not connect. Try again.")
  await new Promise<void>((resolve, reject) => {
    const done = (event: MessageEvent): void => {
      const message = event.data as { source?: string; type?: string } | null
      if (event.source !== window || event.origin !== window.location.origin || message?.source !== "odds-extension") return
      if (message.type === "connected") finish(resolve)
      if (message.type === "failed") finish(() => reject(new Error("The extension did not accept it. Reload this page and try again.")))
    }
    const timer = window.setTimeout(() => finish(() => reject(new Error("The extension did not answer. Reload this page and try again."))), 4000)
    function finish(next: () => void): void {
      window.removeEventListener("message", done)
      window.clearTimeout(timer)
      next()
    }
    window.addEventListener("message", done)
    window.postMessage({ source: "odds-site", type: "key", key: data }, window.location.origin)
  })
}

/** Start / focus Apply in the installed extension. Resolves as soon as the extension ACKs (tab focus is fire-and-forget on the SW). */
export function prepareInExtension(url: string, opts?: { reveal?: boolean; postingId?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    let done = false
    const finish = (error?: string): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      window.removeEventListener("message", receive)
      if (error) reject(new Error(error)); else resolve()
    }
    const receive = (event: MessageEvent): void => {
      const data = event.data as { source?: string; type?: string; requestId?: string; ok?: boolean; message?: string } | null
      if (event.source !== window || event.origin !== location.origin || data?.source !== "odds-extension" || data.type !== "application-started" || data.requestId !== requestId) return
      finish(data.ok ? undefined : data.message || "Reconnect Odds on Connect and try again.")
    }
    // Wait for Chrome to confirm it opened or recovered the application tab.
    const timer = window.setTimeout(
      () => finish("Odds in Chrome did not answer. Open Connect and reconnect, then try again."),
      10000,
    )
    window.addEventListener("message", receive)
    // reveal:true only when the person pressed Open application tab — never default to focus-steal.
    window.postMessage({ source: "odds-site", type: "prepare-application", requestId, url, reveal: opts?.reveal === true, postingId: opts?.postingId }, location.origin)
  })
}
