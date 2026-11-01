import { useCallback, useEffect, useState } from "react"
import { ShooCallback } from "@/components/ShooCallback"
import { SignIn } from "@/components/SignIn"
import { Button } from "@/components/ui/button"
import { keepSessionFresh, keepStorage, restoreSession, signOut, type Session } from "@/lib/auth"
import { forgetShooIdentity, isShooCallback } from "@/lib/shoo"

/** The app shell: Google sign-in, then the signed-in home. Everything else is built on this. */
export function App(): React.JSX.Element {
  const [session, setSession] = useState<Session | null>(null)
  const [checked, setChecked] = useState<boolean>(false)
  const callback = isShooCallback(window.location.pathname)

  useEffect(() => {
    if (callback) {
      return
    }
    void restoreSession().then((restored) => {
      setSession(restored)
      setChecked(true)
    })
  }, [callback])

  // A signed-in tab keeps its token valid; the browser is asked to keep the saved sign-in.
  useEffect(() => {
    if (!session) return
    keepStorage()

    return keepSessionFresh(setSession)
  }, [session])

  const finished = useCallback((signedIn: Session | null): void => {
    window.history.replaceState(null, "", "/")
    setSession(signedIn)
    setChecked(true)
    if (!signedIn) window.location.assign("/")
  }, [])

  if (callback) return <main className="flex min-h-svh flex-col p-6"><ShooCallback onDone={finished} /></main>
  if (!checked) return <main className="flex min-h-svh items-center justify-center text-muted-foreground" role="status">Loading…</main>
  if (!session) return <main className="flex min-h-svh flex-col p-6"><SignIn /></main>

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">You are signed in</h1>
      <p className="text-muted-foreground">{session.user.email}</p>
      <Button type="button" variant="outline" onClick={() => { signOut(); void forgetShooIdentity(); setSession(null) }} className="cursor-pointer">Sign out</Button>
    </main>
  )
}
