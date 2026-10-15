import { useState } from "react"
import { Button } from "@/components/ui/button"
import { isGuestEmail } from "@/lib/auth"
import { useData } from "@/lib/data"
import { connectExtension, useExtensionPresent } from "@/lib/extension-connect"
import { markExtensionOnboardDone } from "@/lib/extension-onboard"
import { beginShooSignIn, rememberShooNext } from "@/lib/shoo"

function Card({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div role="presentation" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={label} className="relative z-[101] flex w-full max-w-sm flex-col gap-3 rounded-xl border-[1.5px] bg-card p-5 shadow-lg">
        {children}
      </div>
    </div>
  )
}

/** The odds browser extension sent the person here: sign in, then one tap connects it. */
export function ExtensionConnect({ onDismiss }: { onDismiss: () => void }): React.JSX.Element | null {
  const data = useData()
  const present = useExtensionPresent()
  const [state, setState] = useState<"ask" | "busy" | "done">("ask")
  const [error, setError] = useState<string | null>(null)
  const session = data.session && !isGuestEmail(data.session.user.email) ? data.session : null
  if (data.status !== "ready" || !data.sessionChecked) return null

  if (present === "no") {
    return (
      <Card label="odds extension not found">
        <h2 className="text-lg font-semibold tracking-tight">The odds extension is not installed here</h2>
        <p className="text-sm text-muted-foreground">Install it in this browser, then press Connect in its window.</p>
        <Button type="button" onClick={onDismiss} className="cursor-pointer">
          OK
        </Button>
      </Card>
    )
  }

  if (!session) {
    return (
      <Card label="Sign in to connect the extension">
        <h2 className="text-lg font-semibold tracking-tight">Connect the odds extension</h2>
        <p className="text-sm text-muted-foreground">Sign in first.</p>
        <Button
          type="button"
          disabled={state === "busy"}
          onClick={() => {
            setState("busy")
            rememberShooNext("account")
            beginShooSignIn().catch((e: unknown) => {
              setError(e instanceof Error ? e.message : "Could not sign in.")
              setState("ask")
            })
          }}
          className="cursor-pointer"
        >
          {state === "busy" ? "Continuing…" : "Continue with Google"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button type="button" onClick={onDismiss} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
          Not now
        </button>
      </Card>
    )
  }

  if (state === "done") {
    return (
      <Card label="Extension connected">
        <h2 className="text-lg font-semibold tracking-tight">Connected</h2>
        <p className="text-sm text-muted-foreground">Browse jobs on LinkedIn. Click an Odds percentage to open that job in the side panel.</p>
        <Button type="button" onClick={onDismiss} className="cursor-pointer">
          OK
        </Button>
      </Card>
    )
  }

  return (
    <Card label="Connect the odds extension">
      <h2 className="text-lg font-semibold tracking-tight">Connect the odds extension?</h2>
      <p className="text-sm text-muted-foreground">It sends Odds the URLs of visible LinkedIn jobs to show your interview chances. New jobs are read automatically, up to 30 a day. Clicking a percentage saves that job and opens it in the side panel.</p>
      <Button
        type="button"
        disabled={state === "busy" || present === "looking"}
        onClick={() => {
          setState("busy")
          setError(null)
          connectExtension().then(
            () => {
              markExtensionOnboardDone()
              setState("done")
            },
            (e: unknown) => {
              setError(e instanceof Error ? e.message : "Could not connect.")
              setState("ask")
            },
          )
        }}
        className="cursor-pointer disabled:cursor-not-allowed"
      >
        {state === "busy" ? "Connecting…" : "Connect"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button type="button" onClick={onDismiss} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
        Not now
      </button>
    </Card>
  )
}
