import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { adoptGuest, loadSession, type Session } from "@/lib/auth"
import { completeShooSignIn, takeShooNext } from "@/lib/shoo"
import { useData } from "@/lib/data"

interface ShooCallbackProps {
  onDone: (next: "account" | "jobs" | "signin", search: string) => void
}

/** Landing spot for Shoo's /auth/callback redirect: trades the Google code for a session, then hands back control. */
export function ShooCallback({ onDone }: ShooCallbackProps): React.JSX.Element {
  const data = useData()
  const ran = useRef<number>(-1)
  const before = useRef<Session | null>(null)
  const [round, setRound] = useState<number>(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [stranded, setStranded] = useState<Session | null>(null)
  const [moving, setMoving] = useState<boolean>(false)

  useEffect(() => {
    // Guarded by round: the data object changes identity, and StrictMode
    // remounts in dev. A retry bumps the round and runs exactly once more.
    if (ran.current === round) {
      return
    }
    ran.current = round
    const run = async (): Promise<void> => {
      try {
        // A guest account (made after a LinkedIn import or by the Home Screen app) is still the stored session here; its
        // profile, phones and applications move into the Google account before that account is used.
        before.current = loadSession()
        const real = await completeShooSignIn()
        try {
          await adoptGuest(before.current, real)
        } catch {
          // Signed in, but the guest data did not move: ask before abandoning it.
          setStranded(real)

          return
        }
        data.setSession(real)
        // Read once, on the way that worked: a failure above leaves the
        // destination stored, so a retry still lands where the trip started.
        const taken = takeShooNext()
        onDone(taken?.next === "jobs" ? "jobs" : "account", taken?.search ?? "")
      } catch (caught) {
        setFailure(caught instanceof Error ? caught.message : "Google sign-in failed.")
      }
    }
    void run()
  }, [data, onDone, round])

  // The guest move failed after a good sign-in: retry it, or continue and leave the guest data behind.
  async function moveAgain(): Promise<void> {
    if (!stranded) {
      return
    }
    setMoving(true)
    try {
      await adoptGuest(before.current, stranded)
      data.setSession(stranded)
      const taken = takeShooNext()
      onDone(taken?.next === "jobs" ? "jobs" : "account", taken?.search ?? "")
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : "Could not move the guest account.")
      setStranded(null)
    }
    setMoving(false)
  }

  function keepGoing(): void {
    if (!stranded) {
      return
    }
    data.setSession(stranded)
    const taken = takeShooNext()
    onDone(taken?.next === "jobs" ? "jobs" : "account", taken?.search ?? "")
  }

  if (stranded) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Signed in, but your guest data did not move.</h1>
        <p className="text-sm text-muted-foreground">Your Google sign-in worked. The profile and applications from this device are still waiting.</p>
        <Button type="button" disabled={moving} onClick={moveAgain} className="w-full cursor-pointer disabled:cursor-not-allowed">
          {moving ? "Moving…" : "Move it again"}
        </Button>
        <Button type="button" variant="ghost" disabled={moving} onClick={keepGoing} className="w-full cursor-pointer text-muted-foreground disabled:cursor-not-allowed">
          Continue without it
        </Button>
      </div>
    )
  }

  if (failure) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col gap-4 py-20 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign-in did not finish.</h1>
        <p className="text-sm text-destructive">{failure}</p>
        <Button
          type="button"
          onClick={() => {
            setFailure(null)
            setRound((n) => n + 1)
          }}
          className="w-full cursor-pointer"
        >
          Try again
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone("signin", "")} className="w-full cursor-pointer text-muted-foreground">
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <p role="status" className="py-20 text-center text-muted-foreground">
      Signing you in…
    </p>
  )
}
