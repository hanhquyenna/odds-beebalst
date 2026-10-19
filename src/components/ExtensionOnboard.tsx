import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { isGuestEmail } from "@/lib/auth"
import { useData } from "@/lib/data"
import {
  chromeStoreUrl,
  connectExtension,
  pingExtension,
  useExtensionLink,
} from "@/lib/extension-connect"
import {
  extensionOnboardVideoUrl,
  markExtensionOnboardDone,
} from "@/lib/extension-onboard"

const STEPS = [
  { n: 1, title: "Get the extension", body: "Press Download below and unzip the file you get." },
  { n: 2, title: "Add it to Chrome", body: "Open chrome://extensions in a new tab. Switch on Developer mode (top right), press Load unpacked, and choose the unzipped folder." },
  { n: 3, title: "Come back and reload this page", body: "So Odds can find the extension. Already did this? Just reload this page." },
  { n: 4, title: "Press Connect", body: "That links Chrome to your Odds account. Odds never keeps your job-site passwords: Chrome keeps you signed in." },
] as const

/**
 * First-run Connect tour: steps + optional video slot. Used on Connect and when Apply is pressed without a linked extension.
 */
export function ExtensionOnboard({
  open,
  onClose,
  onConnected,
}: {
  open: boolean
  onClose: () => void
  onConnected?: () => void
}): React.JSX.Element | null {
  const data = useData()
  const { present, linked } = useExtensionLink()
  const session = data.session && !isGuestEmail(data.session.user.email) ? data.session : null
  const store = chromeStoreUrl()
  const video = extensionOnboardVideoUrl()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && linked) markExtensionOnboardDone()
  }, [open, linked])

  if (!open) return null

  function install(): void {
    if (store) {
      window.open(store, "_blank", "noopener,noreferrer")
      return
    }
    const a = document.createElement("a")
    a.href = "/odds-for-chrome.zip"
    a.download = "odds-for-chrome.zip"
    a.click()
  }

  async function link(): Promise<void> {
    if (!session) {
      setError("Sign in to Odds first, then press Connect.")
      return
    }
    if (present !== "yes") {
      setError("Add Odds to Chrome first, then press I added it / reload this page.")
      pingExtension()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await connectExtension()
      markExtensionOnboardDone()
      onConnected?.()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not connect.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect Odds in Chrome"
        className="relative z-[101] flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl border-[1.5px] bg-card p-5 shadow-lg"
      >
        <header className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold tracking-tight">Connect Odds in Chrome</h2>
          <p className="text-sm text-muted-foreground">
            One-time setup so Apply with Odds can fill forms in this browser.
          </p>
        </header>

        {video ? (
          <div className="overflow-hidden rounded-lg border-[1.5px] border-line bg-muted/40 aspect-video">
            <iframe
              title="How to connect Odds for Chrome"
              src={video}
              className="size-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : null}

        <ol className="flex flex-col gap-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3 text-sm">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-semibold text-brand-ink">
                {s.n}
              </span>
              <div className="min-w-0">
                <p className="font-medium">{s.title}</p>
                <p className="text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {present !== "yes" ? (
            <>
              <Button type="button" onClick={install} className="cursor-pointer">
                {store ? "Add to Chrome" : "Download"}
              </Button>
              <Button type="button" variant="outline" onClick={() => pingExtension()} className="cursor-pointer">
                I added it
              </Button>
            </>
          ) : null}
          {linked ? (
            <Button
              type="button"
              onClick={() => {
                markExtensionOnboardDone()
                onConnected?.()
                onClose()
              }}
              className="cursor-pointer"
            >
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={busy || present === "looking"} onClick={() => void link()} className="cursor-pointer disabled:cursor-not-allowed">
              {busy ? "Connecting…" : present === "looking" ? "Checking Chrome…" : "Connect"}
            </Button>
          )}
          <button type="button" onClick={onClose} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}
