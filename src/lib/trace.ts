import { loadSession } from "@/lib/auth"
import { ANON_KEY, SUPABASE_URL } from "@/lib/supabase"

/**
 * Temporary, while install and notifications are tested on real phones: records each step the app takes (client-log
 * edge function, table client_events) so a failure on a phone can be seen from the computer. No personal data.
 */
function device(): string {
  try {
    let id = window.localStorage.getItem("odds:device")
    if (!id) {
      id = Math.random().toString(36).slice(2, 10)
      window.localStorage.setItem("odds:device", id)
    }
    return id
  } catch {
    return "no-storage"
  }
}

export function trace(event: string, detail?: Record<string, unknown>): void {
  try {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    const ua = navigator.userAgent
    const facts = {
      standalone,
      browser: /CriOS/.test(ua) ? "chrome-ios" : /FxiOS/.test(ua) ? "firefox-ios" : /iPhone|iPad/.test(ua) ? (/Safari/.test(ua) ? "safari" : "ios-webview") : /Android/.test(ua) ? "android" : "desktop",
      ios: (ua.match(/OS (\d+)_(\d+)/) ?? []).slice(1, 3).join(".") || null,
      permission: "Notification" in window ? Notification.permission : "none",
      push: "PushManager" in window,
      ...detail,
    }
    void fetch(`${SUPABASE_URL}/functions/v1/client-log`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ event, device: device(), user: loadSession()?.user.id ?? null, detail: facts }),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // never let logging break the app
  }
}
