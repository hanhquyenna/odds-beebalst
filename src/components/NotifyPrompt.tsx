import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { createPhoneLink, startGuestSession, type Session } from "@/lib/auth"
import { useData } from "@/lib/data"
import { useWaitingPair } from "@/lib/pairing"
import { iosOtherBrowser, isInstalled, platformOf, turnOnNotifications, usePush } from "@/lib/push"

const HOME_CODE = "odds:home-code"

/**
 * An iPhone's Home Screen app keeps its own storage, apart from Safari. While the "Add to Home Screen" steps are open in
 * Safari, the address carries a one-time code (30 minutes, reused for the tab), so the app opens signed in as them. The
 * code leaves the address when the steps close, so a copied or shared link never carries it.
 */
export function useHomeScreenCode(session: Session | null): void {
  useEffect(() => {
    if (!session || platformOf() !== "ios" || isInstalled() || iosOtherBrowser()) {
      return
    }
    const clear = (): void => {
      const params = new URLSearchParams(window.location.search)
      if (params.get("notify") !== "1") return
      params.delete("link")
      params.delete("notify")
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${params.size > 0 ? `?${params}` : ""}${window.location.hash}`)
    }
    const put = (code: string): void => {
      const params = new URLSearchParams(window.location.search)
      params.set("link", code)
      params.set("notify", "1")
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}${window.location.hash}`)
    }
    try {
      const kept = JSON.parse(window.sessionStorage.getItem(HOME_CODE) ?? "null") as { code: string; expires_at: string; user: string } | null
      if (kept && kept.user === session.user.id && Date.parse(kept.expires_at) > Date.now() + 5 * 60 * 1000) {
        put(kept.code)
        return clear
      }
    } catch {
      // nothing kept
    }
    createPhoneLink(session, "home")
      .then(({ code, expires_at }) => {
        put(code)
        try {
          window.sessionStorage.setItem(HOME_CODE, JSON.stringify({ code, expires_at, user: session.user.id }))
        } catch {
          // fine without it
        }
      })
      .catch(() => undefined)

    return clear
  }, [session])
}

/**
 * odds opened from the Home Screen with notifications not on yet: one card, one tap. The phone only shows its question
 * in answer to a tap, so this is as short as it gets. "Not now" hides it until odds is opened again.
 */
export function NotifyPrompt({ session }: { session: Session | null }): React.JSX.Element | null {
  const data = useData()
  const push = usePush()
  const [hidden, setHidden] = useState<boolean>(false)
  const waitingPair = useWaitingPair()
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // While the app waits for a sign-in in the browser, that card is the one on screen.
  if (hidden || data.status !== "ready" || !isInstalled() || waitingPair) {
    return null
  }

  // Whether this phone gets notifications is about this phone only: another device of yours being on does not answer it.
  if (push.state !== "ask" || !push.checked) {
    return null
  }

  async function turnOn(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      // Signed in: this account. Not signed in (an icon added on its own): a guest account, made after the phone says yes.
      await turnOnNotifications(
        session
          ? session.user.id
          : async () => {
              const guest = await startGuestSession()
              if (guest) data.setSession(guest)
              return guest?.user.id ?? null
            },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not turn on notifications.")
    } finally {
      setBusy(false)
    }
  }


  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Turn on notifications" className="flex w-full max-w-sm flex-col gap-3 rounded-xl border-[1.5px] bg-card p-5 text-center shadow-lg">
        <h2 className="text-lg font-semibold tracking-tight">Turn on notifications</h2>
        <p className="text-sm text-muted-foreground">Get the new jobs that fit you at 8 every morning.</p>
        <Button type="button" size="lg" disabled={busy} onClick={() => void turnOn()} className="cursor-pointer">
          {busy ? "Turning on…" : "Turn on notifications"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button type="button" onClick={() => setHidden(true)} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
          Not now
        </button>
      </div>
    </div>
  )
}

/**
 * The way to notifications that is always there, at the foot of the profile on a phone: what they are on this phone,
 * and the one tap that turns them on. The question the phone asks only comes in answer to that tap.
 */
export function NotificationsRow({ session }: { session: Session | null }): React.JSX.Element | null {
  const data = useData()
  const push = usePush()
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  if (push.state === "unsupported") {
    return null
  }

  async function turnOn(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await turnOnNotifications(
        session
          ? session.user.id
          : async () => {
              const guest = await startGuestSession()
              if (guest) data.setSession(guest)
              return guest?.user.id ?? null
            },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not turn on notifications.")
    } finally {
      setBusy(false)
    }
  }

  const ios = platformOf() === "ios"
  const status =
    push.state === "on"
      ? "On for this phone. New jobs that fit you arrive at 8 every morning."
      : push.state === "blocked"
        ? ios
          ? "Off. Turn them on in Settings, Notifications, odds."
          : "Off. Turn them on in your phone's settings for odds."
        : push.state === "install"
          ? ios
            ? "Add odds to your Home Screen first: iPhones only send notifications to apps there."
            : "Install odds first, then turn them on here."
          : "Off on this phone."

  return (
    <section aria-label="Notifications" className="flex flex-col gap-2">
      <p className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Notifications</p>
      <div className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-card px-4 py-3.5">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[0.95rem] font-medium">New jobs every morning</span>
          <span className="text-sm text-muted-foreground">{status}</span>
          {error ? <span className="text-sm text-destructive">{error}</span> : null}
        </span>
        {push.state === "ask" ? (
          <Button type="button" size="sm" disabled={busy || !push.checked} onClick={() => void turnOn()} className="shrink-0 cursor-pointer rounded-full px-4">
            {busy ? "Turning on…" : "Turn on"}
          </Button>
        ) : push.state === "on" ? (
          <span className="shrink-0 rounded-full bg-good px-2.5 py-1 text-xs font-semibold text-good-foreground">On</span>
        ) : null}
      </div>
    </section>
  )
}
