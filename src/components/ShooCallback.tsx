import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { Session } from "@/lib/auth"
import { completeShooSignIn } from "@/lib/shoo"

interface ShooCallbackProps {
  onDone: (session: Session | null) => void
}

/** Landing spot for Shoo's /auth/callback redirect: trades the Google code for a session, then hands back control. */
export function ShooCallback({ onDone }: ShooCallbackProps): React.JSX.Element {
  const ran = useRef<number>(-1)
  const [round, setRound] = useState<number>(0)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    // Guarded by round: StrictMode remounts in dev. A retry bumps the round and runs exactly once more.
    if (ran.current === round) {
      return
    }
    ran.current = round
    completeShooSignIn().then(onDone, (caught: unknown) => setFailure(caught instanceof Error ? caught.message : "Google sign-in failed."))
  }, [onDone, round])

  if (failure) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in did not finish.</h1>
        <p className="text-sm text-destructive">{failure}</p>
        <Button type="button" onClick={() => { setFailure(null); setRound((n) => n + 1) }} className="w-full cursor-pointer">Try again</Button>
        <Button type="button" variant="ghost" onClick={() => onDone(null)} className="w-full cursor-pointer text-muted-foreground">Back to sign in</Button>
      </div>
    )
  }

  return <p role="status" className="py-20 text-center text-muted-foreground">Signing you in…</p>
}
