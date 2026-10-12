import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { isGuestEmail } from "@/lib/auth"
import { answerConnect, dropConnectRequest, useConnectRequest, whoIsAsking } from "@/lib/connect-answer"
import { useData } from "@/lib/data"
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

/**
 * Claude (or another app) sent the person here to connect to their odds: sign in, then one question. Nothing is shared until they
 * tap Allow, and the page they are sent back to is the one the app named in its own request (checked by the server).
 */
export function ConnectApproval(): React.JSX.Element | null {
  const data = useData()
  const request = useConnectRequest()
  const [who, setWho] = useState<{ client_name: string; host: string } | null>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const session = data.session && !isGuestEmail(data.session.user.email) ? data.session : null
  const token = session?.access_token

  useEffect(() => {
    if (!request || !session) return
    let live = true
    whoIsAsking(session, request).then(
      (found) => live && setWho(found),
      (e: unknown) => live && setError(e instanceof Error ? e.message : "That did not work. Start again from Claude."),
    )

    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.client_id, request?.code_challenge, token])

  if (!request || data.status !== "ready" || !data.sessionChecked) return null

  if (!session) {
    return (
      <Card label="Sign in to connect Claude">
        <h2 className="text-lg font-semibold tracking-tight">Connect Claude to your odds</h2>
        <p className="text-sm text-muted-foreground">Sign in first. Then you choose what Claude can do.</p>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            rememberShooNext("account")
            beginShooSignIn().catch((e: unknown) => {
              setError(e instanceof Error ? e.message : "Could not sign in.")
              setBusy(false)
            })
          }}
          className="cursor-pointer"
        >
          {busy ? "Continuing…" : "Continue with Google"}
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <button type="button" onClick={dropConnectRequest} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
          Not now
        </button>
      </Card>
    )
  }

  const answer = (allow: boolean): void => {
    setBusy(true)
    setError(null)
    answerConnect(session, request, allow).then(
      (to) => {
        dropConnectRequest()
        window.location.assign(to)
      },
      (e: unknown) => {
        setError(e instanceof Error ? e.message : "That did not work. Start again from Claude.")
        setBusy(false)
      },
    )
  }

  return (
    <Card label="Connect Claude to your odds">
      <h2 className="text-lg font-semibold tracking-tight">Let {who?.client_name ?? "Claude"} use your odds?</h2>
      <p className="text-sm text-muted-foreground">It will be able to:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>search jobs and read your profile</li>
        <li>see your CVs, cover letters, saved and applied jobs</li>
        <li>save a cover letter or mark a job applied, when you ask</li>
      </ul>
      <p className="text-sm text-muted-foreground">It never sends an application: you do that. Turn it off any time on the Claude page.</p>
      {who ? <p className="text-xs text-muted-foreground">You will be taken back to {who.host}.</p> : null}
      <Button type="button" disabled={busy || !who} onClick={() => answer(true)} className="cursor-pointer disabled:cursor-not-allowed">
        {busy ? "Connecting…" : "Allow"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button type="button" disabled={busy} onClick={() => answer(false)} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4">
        Not now
      </button>
    </Card>
  )
}
