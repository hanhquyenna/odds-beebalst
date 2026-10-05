import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { adoptGuest, approveDevicePair, claimDevicePair, isGuestEmail, loadSession } from "@/lib/auth"
import { useData } from "@/lib/data"
import { cancelPairing, clearApproval, openInBrowser, pairUrl, useApprovalId, useWaitingPair } from "@/lib/pairing"
import { isInstalled } from "@/lib/push"
import { beginShooSignIn, rememberShooNext } from "@/lib/shoo"

function Card({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={label} className="flex w-full max-w-sm flex-col gap-3 rounded-xl border-[1.5px] bg-card p-5 text-center shadow-lg">
        {children}
      </div>
    </div>
  )
}

function Code({ code }: { code: string }): React.JSX.Element {
  return <p className="font-mono text-3xl font-bold tracking-[0.3em] tabular-nums">{code}</p>
}

/** In the Home Screen app: waits for the browser sign-in and collects the session as soon as it is approved. */
function WaitingForBrowser(): React.JSX.Element | null {
  const data = useData()
  const pair = useWaitingPair()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pair) {
      return
    }
    let live = true
    let busy = false
    const check = async (): Promise<void> => {
      if (busy || !live) return
      busy = true
      try {
        const before = loadSession()
        const got = await claimDevicePair(pair.id, pair.secret)
        if (!live || got === "waiting") return
        cancelPairing()
        if (!got) {
          setError("That took too long. Try again.")
          return
        }
        // A guest account on this app (made by turning on notifications) moves into the account signed in with.
        await adoptGuest(before, got).catch(() => null)
        data.setSession(got)
      } finally {
        busy = false
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), 2000)
    const back = (): void => {
      if (document.visibilityState === "visible") void check()
    }
    document.addEventListener("visibilitychange", back)

    return () => {
      live = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", back)
    }
  }, [pair, data])

  if (error && !pair) {
    return (
      <Card label="Sign-in expired">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button type="button" onClick={() => setError(null)} className="cursor-pointer">
          OK
        </Button>
      </Card>
    )
  }
  if (!pair) {
    return null
  }

  return (
    <Card label="Finish signing in in Safari">
      <h2 className="text-lg font-semibold tracking-tight">Finish signing in in your browser</h2>
      <p className="text-sm text-muted-foreground">Sign in with Google there and type this code. Then come back here: you will be signed in.</p>
      <Code code={pair.code} />
      <Button type="button" variant="outline" onClick={() => openInBrowser(pairUrl(pair.id))} className="cursor-pointer">
        Open the browser again
      </Button>
      <button type="button" onClick={cancelPairing} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
        Cancel
      </button>
    </Card>
  )
}

/** In the browser opened by the app: sign in, confirm the code, and the app signs in by itself. */
function ApproveInBrowser(): React.JSX.Element | null {
  const data = useData()
  const id = useApprovalId()
  const [state, setState] = useState<"ask" | "busy" | "done">("ask")
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState<string>("")

  if (!id || data.status !== "ready") {
    return null
  }
  // A guest session here is not a sign-in: the app should get the account the person signs in with.
  const signedIn = data.session && !isGuestEmail(data.session.user.email) ? data.session : null

  if (state === "done") {
    return (
      <Card label="Connected">
        <h2 className="text-lg font-semibold tracking-tight">Done</h2>
        <p className="text-sm text-muted-foreground">Go back to the odds app on your Home Screen. It is signed in.</p>
        <Button type="button" onClick={clearApproval} className="cursor-pointer">
          OK
        </Button>
      </Card>
    )
  }

  if (!signedIn) {
    return (
      <Card label="Sign in to connect your odds app">
        <h2 className="text-lg font-semibold tracking-tight">Sign in to connect your odds app</h2>
        <Button
          type="button"
          disabled={state === "busy"}
          onClick={() => {
            setState("busy")
            setError(null)
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
        <button type="button" onClick={clearApproval} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
          Not now
        </button>
      </Card>
    )
  }

  return (
    <Card label="Connect your odds app">
      <h2 className="text-lg font-semibold tracking-tight">Connect your odds app?</h2>
      <p className="text-sm text-muted-foreground">Type the code your odds app shows. Only connect your own phone.</p>
      <Input aria-label="Code from your app" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} autoComplete="one-time-code" className="text-center font-mono text-2xl tracking-[0.3em]" />
      <Button
        type="button"
        disabled={state === "busy" || code.trim().length !== 6}
        onClick={() => {
          setState("busy")
          setError(null)
          approveDevicePair(signedIn, id, code)
            .then(() => setState("done"))
            .catch((e: unknown) => {
              setError(e instanceof Error ? e.message : "Could not connect the app.")
              setState("ask")
            })
        }}
        className="cursor-pointer disabled:cursor-not-allowed"
      >
        {state === "busy" ? "Connecting…" : "Yes, connect"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button type="button" onClick={clearApproval} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
        No, it is not mine
      </button>
    </Card>
  )
}

/** Both sides of signing a Home Screen app in through the browser; each shows only where it applies. */
export function DevicePairing(): React.JSX.Element {
  return isInstalled() ? <WaitingForBrowser /> : <ApproveInBrowser />
}
