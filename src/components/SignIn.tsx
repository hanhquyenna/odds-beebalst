import { useState } from "react"
import { Button } from "@/components/ui/button"
import { beginShooSignIn, redirectWatch, rememberShooNext, storageAvailable } from "@/lib/shoo"

interface SignInProps {
  onCancel: () => void
}

const NO_STORAGE = "Sign-in needs site data to remember you. Allow cookies for this site, then try again."
const STUCK = "Still here? Your browser may have blocked the Google redirect. Try again."

/** The way back into an account: Google only, then the saved profile comes down with it. */
export function SignIn({ onCancel }: SignInProps): React.JSX.Element {
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Leaves for Google; the way back lands on /auth/callback, which signs in.
  // Nothing runs after a real redirect (the page is gone), so every path here
  // is either an error or a blocked handoff.
  async function start(): Promise<void> {
    if (!storageAvailable()) {
      setError(NO_STORAGE)

      return
    }
    setBusy(true)
    setError(null)
    const cancel = redirectWatch(() => {
      setBusy(false)
      setError(STUCK)
    })
    try {
      rememberShooNext("account")
      if ((await beginShooSignIn()) === "browser") {
        // A Home Screen app: the sign-in goes on in the browser and this app waits for it.
        cancel()
        setBusy(false)
      }
    } catch (caught) {
      cancel()
      setError(caught instanceof Error ? caught.message : "Could not sign in.")
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 py-8 md:my-auto md:flex-none md:border-[1.5px] md:bg-card md:p-10" aria-busy={busy}>
      <button type="button" onClick={onCancel} disabled={busy} className="cursor-pointer self-start text-sm font-medium text-primary disabled:cursor-not-allowed">
        &larr; Back
      </button>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back.</h1>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={start} className="w-full cursor-pointer disabled:cursor-not-allowed">
          {busy ? "Continuing…" : "Continue with Google"}
        </Button>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}
