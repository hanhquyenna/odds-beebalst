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

/** Whether the extension answered the page: "no" after a moment without an answer. */
export function useExtensionPresent(): "looking" | "yes" | "no" {
  const [state, setState] = useState<"looking" | "yes" | "no">("looking")
  useEffect(() => {
    const on = (event: MessageEvent): void => {
      if (event.source === window && event.origin === window.location.origin && (event.data as { source?: string } | null)?.source === "odds-extension") setState("yes")
    }
    window.addEventListener("message", on)
    window.postMessage({ source: "odds-site", type: "ping" }, window.location.origin)
    const timer = window.setTimeout(() => setState((s) => (s === "looking" ? "no" : s)), 1500)

    return () => {
      window.removeEventListener("message", on)
      window.clearTimeout(timer)
    }
  }, [])

  return state
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
