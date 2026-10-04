import { useState } from "react"
import { Button } from "@/components/ui/button"
import { beginShooSignIn } from "@/lib/shoo"

interface SignInProps {
  onCancel: () => void
  onSignedIn: () => void
}

/** The way back into an account: Google only, then the saved profile comes down with it. */
export function SignIn({ onCancel, onSignedIn }: SignInProps): React.JSX.Element {
  const [busy, setBusy] = useState<boolean>(false)
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

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-8 py-8 md:my-auto md:flex-none md:border-[1.5px] md:bg-card md:p-10">
      <button type="button" onClick={onCancel} className="cursor-pointer self-start text-sm font-medium text-primary">
        &larr; Back
      </button>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome back.</h1>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={start} className="w-full cursor-pointer disabled:cursor-not-allowed">
          {busy ? "Leaving…" : "Continue with Google"}
        </Button>
        {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
      </div>
      <Button type="button" variant="ghost" onClick={onCancel} className="w-full cursor-pointer text-muted-foreground">
        No account yet? Start
      </Button>
    </div>
  )
}
