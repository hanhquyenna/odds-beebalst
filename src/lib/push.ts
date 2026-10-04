import { useSyncExternalStore } from "react"
import { supabase } from "@/lib/supabase"

/** The public half of the push keys. The private half is an Edge Function secret (VAPID_KEYS). */
const VAPID_PUBLIC_KEY = "BGfltRiA2P9Sv9kfaONUOAf6i8Af1oh7i4J9rzFm2yoXYhb6I7tFNiHWp5Za_dxrM-EyfM1kNbhj7JUMTIyZb7o"

export type Platform = "ios" | "android" | "desktop"

export function platformOf(ua: string = navigator.userAgent, touchPoints: number = navigator.maxTouchPoints): Platform {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) {
    return "ios"
  }
  if (/Android/.test(ua)) {
    return "android"
  }

  return "desktop"
}

/** Opened from the Home Screen icon, not in a browser tab. */
export function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
}

/** Where this device stands with the morning message. */
export type PushState =
  | "install" // a phone in a browser tab: add to the Home Screen first
  | "ask" // can be turned on with one tap
  | "on" // this device gets the message
  | "blocked" // the person said no; only the phone's settings can undo it
  | "unsupported"

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let installPrompt: InstallPromptEvent | null = null
let subscribed = false
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((l) => l())

/** Called once at start: registers the background script and keeps Chrome's install offer for the Install button. */
export function startPush(): void {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    installPrompt = e as InstallPromptEvent
    emit()
  })
  window.addEventListener("appinstalled", () => {
    installPrompt = null
    emit()
  })
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager?.getSubscription())
      .then((sub) => {
        subscribed = Boolean(sub)
        emit()
      })
      .catch(() => undefined)
  }
}

function pushState(): PushState {
  if (!pushSupported()) {
    // An iPhone in a Safari tab has no push at all until odds is on the Home Screen.
    return platformOf() === "ios" && !isInstalled() ? "install" : "unsupported"
  }
  if (Notification.permission === "denied") {
    return "blocked"
  }
  if (subscribed && Notification.permission === "granted") {
    return "on"
  }
  // Phones get the app first, as the owner asked: the message lands on the odds icon.
  if (platformOf() !== "desktop" && !isInstalled()) {
    return "install"
  }

  return "ask"
}

let snapshot = ""
function read(): string {
  const next = `${pushState()}|${installPrompt ? 1 : 0}`
  snapshot = next

  return snapshot
}

/** The push state and whether the browser offers a one-tap install, kept fresh. */
export function usePush(): { state: PushState; canPrompt: boolean } {
  const raw = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    read,
    () => "unsupported|0",
  )
  const [state, prompt] = raw.split("|")

  return { state: state as PushState, canPrompt: prompt === "1" }
}

/** Chrome's own install dialog (Android and computers). False when the browser did not offer one. */
export async function promptInstall(): Promise<boolean> {
  if (!installPrompt) {
    return false
  }
  await installPrompt.prompt()
  const { outcome } = await installPrompt.userChoice
  installPrompt = null
  emit()

  return outcome === "accepted"
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4)
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i)
  }

  return out
}

/**
 * Asks the phone for permission and saves this device for the morning message. Must run straight from a tap:
 * iPhones only show the question in answer to one.
 */
export async function turnOnNotifications(userId: string): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    emit()
    return permission === "denied" ? "blocked" : "ask"
  }
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, platform: platformOf(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam" }, { onConflict: "endpoint" })
  if (error) {
    throw new Error(error.message)
  }
  subscribed = true
  emit()

  return "on"
}
