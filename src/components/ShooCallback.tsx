import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { adoptGuest, loadSession } from "@/lib/auth"
import { completeShooSignIn, takeShooNext } from "@/lib/shoo"
import { useData } from "@/lib/data"

interface ShooCallbackProps {
  onDone: (next: "account" | "jobs" | "signin") => void
}

/** Landing spot for Shoo's /auth/callback redirect: trades the Google code for a session, then hands back control. */
export function ShooCallback({ onDone }: ShooCallbackProps): React.JSX.Element {
  const data = useData()
  const ran = useRef<boolean>(false)

  useEffect(() => {
    // Guarded: the data object changes identity, and StrictMode remounts in dev.
    if (ran.current) {
      return
    }
    ran.current = true
    const run = async (): Promise<void> => {
      try {
        // A guest account (made after a LinkedIn import or by the Home Screen app) is still the stored session here; its
        // profile, phones and applications move into the Google account before that account is used.
        const before = loadSession()
        const real = await completeShooSignIn()
        await adoptGuest(before, real).catch(() => null)
        data.setSession(real)
        onDone(takeShooNext() === "jobs" ? "jobs" : "account")
      } catch (caught) {
        toast.error(caught instanceof Error ? caught.message : "Google sign-in failed.")
        onDone("signin")
      }
    }
    void run()
  }, [data, onDone])

  return <p className="py-20 text-center text-muted-foreground">Signing you in…</p>
}
