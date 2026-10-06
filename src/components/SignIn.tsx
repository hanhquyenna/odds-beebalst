import { useState } from "react"
import { ChevronLeftIcon } from "@/components/icons"
import logoUrl from "@/logo.svg"
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
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col py-6 md:my-auto md:flex-none md:rounded-3xl md:border-[1.5px] md:bg-card md:p-10 md:shadow-sm" aria-busy={busy}>
      <button type="button" onClick={onCancel} disabled={busy} className="flex w-fit cursor-pointer items-center gap-0.5 text-[0.95rem] font-semibold text-brand-ink disabled:cursor-not-allowed">
        <ChevronLeftIcon weight="bold" className="size-5" aria-hidden="true" />
        Back
      </button>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 py-10 text-center md:flex-none">
        <div className="flex flex-col items-center gap-4">
          <span className="flex size-20 items-center justify-center rounded-[1.4rem] bg-brand shadow-lg shadow-brand/30">
            <img src={logoUrl} alt="" aria-hidden="true" className="size-12 drop-shadow-sm" />
          </span>
          <span className="text-[2.5rem] leading-none font-bold tracking-[-0.05em]">odds</span>
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="max-w-72 text-[0.95rem] text-muted-foreground">Sign in to keep your jobs, people and odds on every device.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        <button
          type="button"
          disabled={busy}
          onClick={start}
          className="flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-full border-[1.5px] border-[#dadce0] bg-white px-5 text-[0.95rem] font-semibold text-[#1f1f1f] shadow-sm transition-colors hover:bg-[#f8f9fa] active:bg-[#f1f3f4] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GoogleMark />
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
        <p className="text-center text-xs text-muted-foreground">We only ask Google for your name, email and photo. You stay signed in on this device until you sign out.</p>
      </div>
    </div>
  )
}

/** Google's "G", as its sign-in button guidelines ask the button to carry. */
function GoogleMark(): React.JSX.Element {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
