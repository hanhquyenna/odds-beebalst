import { useState } from "react"
import { Button } from "@/components/ui/button"
import { startGuestSession } from "@/lib/auth"
import { beginShooSignIn } from "@/lib/shoo"

interface SignInProps {
  onCancel: () => void
  onSignedIn: () => void
}

/** The way back into an account: Google only, then the saved profile comes down with it. */
export function SignIn({ onCancel, onSignedIn }: SignInProps): React.JSX.Element {
  const [busy, setBusy] = useState<boolean>(false)
  const [testBusy, setTestBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  // Leaves for Google; the way back lands on /auth/callback, which signs in.
  async function start(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await beginShooSignIn()
      onSignedIn()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.")
      setBusy(false)
    }
  }

  // Local testing only: a guest session signs straight in, no Google round-trip.
  // import.meta.env.DEV is false in production builds, so the button never ships.
  async function test(): Promise<void> {
    setTestBusy(true)
    setError(null)
    try {
      const session = await startGuestSession()
      if (!session) {
        throw new Error("Could not start a test session.")
      }
      onSignedIn()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign in.")
      setTestBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 py-8 md:my-auto md:flex-none md:border-[1.5px] md:bg-card md:p-10">
      <button type="button" onClick={onCancel} className="cursor-pointer self-start text-sm font-medium text-primary">
        &larr; Back
      </button>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back.</h1>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" disabled={busy || testBusy} onClick={start} className="w-full cursor-pointer disabled:cursor-not-allowed">
          {busy ? "Leaving…" : "Continue with Google"}
        </Button>
        {import.meta.env.DEV ? (
          <Button type="button" variant="secondary" disabled={busy || testBusy} onClick={test} className="w-full cursor-pointer disabled:cursor-not-allowed">
            {testBusy ? "Signing in…" : "Test login (local only)"}
          </Button>
        ) : null}
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
      <Button type="button" variant="ghost" onClick={onCancel} className="w-full cursor-pointer text-muted-foreground">
        No account yet? Start
      </Button>
    </div>
  )
}
