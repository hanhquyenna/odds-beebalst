import { useState } from "react"
import { Button } from "@/components/ui/button"
import { isGuestEmail } from "@/lib/auth"
import { useData } from "@/lib/data"
import { connectExtension, dropExtensionRequest, useExtensionPresent } from "@/lib/extension-connect"
import { beginShooSignIn, rememberShooNext } from "@/lib/shoo"

function Card({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={label} className="flex w-full max-w-sm flex-col gap-3 rounded-xl border-[1.5px] bg-card p-5 shadow-lg">
        {children}
      </div>
    </div>
  )
}

/** The odds browser extension sent the person here: sign in, then one tap connects it. */
export function ExtensionConnect(): React.JSX.Element | null {
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
        <Button type="button" onClick={dropExtensionRequest} className="cursor-pointer">
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
        <button type="button" onClick={dropExtensionRequest} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
          Not now
        </button>
      </Card>
    )
  }

  if (state === "done") {
    return (
      <Card label="Extension connected">
        <h2 className="text-lg font-semibold tracking-tight">Connected</h2>
        <p className="text-sm text-muted-foreground">Open a job on LinkedIn and press Add to odds.</p>
        <Button type="button" onClick={dropExtensionRequest} className="cursor-pointer">
          OK
        </Button>
      </Card>
    )
  }

  return (
    <Card label="Connect the odds extension">
      <h2 className="text-lg font-semibold tracking-tight">Connect the odds extension?</h2>
      <p className="text-sm text-muted-foreground">It can add the job you are looking at to your odds and show your interview chance for it. It sends odds the address of the page only when you press its button.</p>
      <Button
        type="button"
        disabled={state === "busy" || present === "looking"}
        onClick={() => {
          setState("busy")
          setError(null)
          connectExtension().then(
            () => setState("done"),
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
      <button type="button" onClick={dropExtensionRequest} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
        Not now
      </button>
    </Card>
  )
}
