import { useEffect, useState, useSyncExternalStore } from "react"
import type { Session } from "@/lib/auth"
import { ANON_KEY, SUPABASE_URL, currentAccessToken, supabase } from "@/lib/supabase"

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

/** The browser an iPhone is using, when it is not Safari (Chrome, Firefox, an app's built-in browser…); null in Safari. */
export function iosOtherBrowser(ua: string = navigator.userAgent): string | null {
  if (platformOf(ua) !== "ios") return null
  if (/CriOS/.test(ua)) return "Chrome"
  if (/FxiOS/.test(ua)) return "Firefox"
  if (/EdgiOS/.test(ua)) return "Edge"
  if (/OPiOS|OPT\//.test(ua)) return "Opera"
  if (/GSA\//.test(ua)) return "the Google app"
  if (/Instagram|FBAN|FBAV|LinkedInApp|Line\//.test(ua)) return "this app"
  return null
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
  | "install" // a phone in a browser tab: add to the Home Screen first; a computer: get odds on the phone
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
  // Until odds runs from the Home Screen, the way forward is the phone: a computer sends people there, and a phone's
  // browser tab can only add odds. What this browser allows does not matter for that.
  if (!isInstalled()) {
    return "install"
  }
  if (!pushSupported()) {
    return "unsupported"
  }
  if (Notification.permission === "denied") {
    return "blocked"
  }
  if (subscribed && Notification.permission === "granted") {
    return "on"
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
export async function turnOnNotifications(account: string | (() => Promise<string | null>)): Promise<PushState> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    emit()
    return permission === "denied" ? "blocked" : "ask"
  }
  const reg = await navigator.serviceWorker.ready
  let sub: PushSubscription
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }))
  } catch {
    throw new Error("Your phone did not let odds turn on notifications.")
  }
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  // The account comes after the phone's yes: the question must follow the tap directly, so nothing slow goes before it.
  const userId = typeof account === "string" ? account : await account()
  if (!userId) {
    throw new Error("Could not save this phone. Try again.")
  }
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, platform: platformOf(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam" }, { onConflict: "endpoint" })
  if (error) {
    throw new Error(error.message)
  }
  subscribed = true
  emit()
  // A first message at once, so the person sees it works without waiting for the morning.
  void fetch(`${SUPABASE_URL}/functions/v1/morning-jobs?welcome=1`, { method: "POST", headers: { apikey: ANON_KEY, Authorization: `Bearer ${currentAccessToken() ?? ANON_KEY}` } })
    .catch(() => undefined)

  return "on"
}

let guideOpen = false
const guideListeners = new Set<() => void>()

/** Opens the "Add odds to your phone" steps from anywhere: the bell, or a phone that scanned the QR code. */
export function openInstallGuide(open = true): void {
  guideOpen = open
  guideListeners.forEach((l) => l())
}

export function useInstallGuide(): boolean {
  return useSyncExternalStore(
    (l) => {
      guideListeners.add(l)
      return () => guideListeners.delete(l)
    },
    () => guideOpen,
    () => false,
  )
}

/** How many of the person's devices get the morning message; null until known. Checks again every `everyMs` when given. */
export function usePhoneCount(session: Session | null, everyMs?: number): number | null {
  const [count, setCount] = useState<number | null>(null)
  const userId = session?.user.id

  useEffect(() => {
    if (!userId) {
      setCount(null)
      return
    }
    let live = true
    const check = (): void => {
      void supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .then(({ count: n, error }) => {
          if (live && !error) setCount(n ?? 0)
        })
    }
    check()
    const timer = everyMs ? window.setInterval(check, everyMs) : undefined

    return () => {
      live = false
      if (timer) window.clearInterval(timer)
    }
  }, [userId, everyMs])

  return count
}

/** Whether any of the person's devices already gets the morning message. */
export function useHasPhone(session: Session | null): boolean {
  const count = usePhoneCount(session)
  return (count ?? 0) > 0 || subscribed
}
