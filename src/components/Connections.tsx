import { useEffect, useState } from "react"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ExtensionOnboard } from "@/components/ExtensionOnboard"
import { isGuestEmail } from "@/lib/auth"
import { takeConnectFocus, type ConnectFocus } from "@/lib/connect-focus"
import { useData } from "@/lib/data"
import { problemText } from "@/lib/document-model"
import { connectDrive, disconnectDrive, useDrive } from "@/lib/drive"
import { chromeStoreUrl, connectExtension, pingExtension, useExtensionLink } from "@/lib/extension-connect"
import { markExtensionOnboardDone, shouldShowExtensionOnboard } from "@/lib/extension-onboard"

/** What one-click applying runs on: Drive for files, Gmail for outreach, and Odds for Chrome that fills the forms. */
export function Connections({ onSignIn }: { onSignIn: () => void }): React.JSX.Element {
  const [problem, setProblem] = useState<string | null>(null)
  const [focus, setFocus] = useState<ConnectFocus | null>(() => takeConnectFocus())
  const { present, linked, boards } = useExtensionLink()
  const [tour, setTour] = useState<"initial" | "open" | "closed">(() => focus === "extension" ? "open" : "initial")
  const tourOpen = tour === "open" || tour === "initial" && shouldShowExtensionOnboard({ present: present, linked: linked })

  useEffect(() => {
    if (!focus) return
    const timer = window.setTimeout(() => setFocus(null), 4000)

    return () => window.clearTimeout(timer)
  }, [focus])

  useEffect(() => {
    if (linked) markExtensionOnboardDone()
  }, [linked])

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Connect</h1>
        <p className="text-sm text-muted-foreground">Hook these up once so applying and outreach can run in one click.</p>
      </header>

      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        <li>
          <DriveRow focused={focus === "drive" || focus === "gmail"} onProblem={setProblem} onSignIn={onSignIn} />
        </li>
        <li>
          <GmailRow focused={focus === "gmail"} onConnectDrive={() => document.getElementById("connect-google")?.scrollIntoView({ behavior: "smooth", block: "center" })} />
        </li>
        <li>
          <ExtensionRow
            focused={focus === "extension"}
            onSignIn={onSignIn}
            onProblem={setProblem}
            onOpenTour={() => setTour("open")}
            linked={linked}
            present={present}
            boards={boards}
          />
        </li>
      </ul>

      <ExtensionOnboard open={tourOpen && !linked} onClose={() => setTour("closed")} onConnected={() => setTour("closed")} />
    </div>
  )
}

function StatusDot({ on, label }: { on: boolean; label: string }): React.JSX.Element {
  return <span className={`size-2.5 shrink-0 rounded-full ${on ? "bg-good-foreground" : "bg-destructive"}`} role="img" aria-label={label} />
}

function ConnectRow({
  logo,
  name,
  detail,
  status,
  actions,
  focused,
}: {
  logo: string
  name: string
  detail: React.ReactNode
  status?: React.ReactNode
  actions?: React.ReactNode
  focused?: boolean
}): React.JSX.Element {
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border-[1.5px] bg-card p-4 transition-[box-shadow,border-color] duration-300 sm:p-5",
        focused ? "border-destructive shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_35%,transparent)]" : "border-line",
      )}
    >
      <div className="flex items-start gap-3.5">
        <img src={logo} alt="" className="size-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-base font-bold tracking-tight">{name}</p>
            {status}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{detail}</div>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </article>
  )
}

function DriveRow({ focused, onProblem, onSignIn }: { focused: boolean; onProblem: (text: string | null) => void; onSignIn: () => void }): React.JSX.Element | null {
  const drive = useDrive()
  const guest = isGuestEmail(useData().session?.user.email)
  const [busy, setBusy] = useState<boolean>(false)
  const [asking, setAsking] = useState<boolean>(false)
  if (drive.status === "unknown") return null

  async function run(action: () => Promise<void>): Promise<void> {
    onProblem(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      onProblem(problemText(err))
    } finally {
      setBusy(false)
    }
  }

  const on = drive.status === "on"

  return (
    <>
      <div id="connect-google">
        <ConnectRow
          focused={focused}
          logo="/sources/google-drive.svg"
          name="Google Drive"
          detail={on ? (drive.email ?? "Connected") : "CVs and cover letters stay in your Drive. Connecting also links Gmail."}
          status={<StatusDot on={on} label={on ? "Connected" : "Not connected"} />}
          actions={
            on ? (
              <>
                {drive.folder ? (
                  <a href={drive.folder} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer max-md:h-10")}>
                    Open folder
                  </a>
                ) : null}
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setAsking(true)} className="cursor-pointer text-destructive max-md:h-10">
                  Disconnect
                </Button>
              </>
            ) : guest ? (
              <Button type="button" onClick={onSignIn} className="cursor-pointer">
                Sign in with Google first
              </Button>
            ) : (
              <Button type="button" disabled={busy} onClick={() => void run(connectDrive)} className="cursor-pointer">
                {busy ? "Opening Google…" : "Connect Google Drive + Gmail"}
              </Button>
            )
          }
        />
      </div>
      {asking ? (
        <ConfirmDialog
          title="Disconnect Google?"
          body="Drive and Gmail both disconnect. Your files come back into odds, and copies stay in your Drive. New files are kept in odds until you connect again."
          confirm="Disconnect"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            void run(disconnectDrive)
          }}
        />
      ) : null}
    </>
  )
}

function GmailRow({ focused, onConnectDrive }: { focused: boolean; onConnectDrive: () => void }): React.JSX.Element | null {
  const drive = useDrive()
  if (drive.status === "unknown") return null
  const on = drive.status === "on"

  return (
    <ConnectRow
      focused={focused}
      logo="/sources/gmail.svg"
      name="Gmail"
      detail={on ? (drive.email ? `Outreach from ${drive.email}` : "Ready for follow-ups and outreach") : "Links automatically when you connect Google Drive"}
      status={<StatusDot on={on} label={on ? "Connected" : "Not connected"} />}
      actions={
        on ? undefined : (
          <Button type="button" variant="outline" size="sm" onClick={onConnectDrive} className="cursor-pointer max-md:h-10">
            Connect with Google Drive
          </Button>
        )
      }
    />
  )
}

function ExtensionRow({
  focused,
  onSignIn,
  onProblem,
  onOpenTour,
  linked,
  present,
  boards,
}: {
  focused: boolean
  onSignIn: () => void
  onProblem: (text: string | null) => void
  onOpenTour: () => void
  linked: boolean
  present: "looking" | "yes" | "no"
  boards: { linkedin?: number; indeed?: number; glassdoor?: number }
}): React.JSX.Element {
  const session = useData().session
  const guest = isGuestEmail(session?.user.email)
  const signedIn = Boolean(session) && !guest
  const store = chromeStoreUrl()
  const [busy, setBusy] = useState<boolean>(false)
  const installed = present === "yes"

  async function link(): Promise<void> {
    if (!signedIn) {
      onSignIn()
      return
    }
    if (!installed) {
      onProblem("Add Odds to Chrome first, then press Connect.")
      onOpenTour()
      pingExtension()
      return
    }
    onProblem(null)
    setBusy(true)
    try {
      await connectExtension()
      markExtensionOnboardDone()
    } catch (err) {
      onProblem(err instanceof Error ? err.message : "Could not connect the extension.")
    } finally {
      setBusy(false)
    }
  }

  function install(): void {
    if (store) {
      window.open(store, "_blank", "noopener,noreferrer")
      return
    }
    const a = document.createElement("a")
    a.href = "/odds-for-chrome.zip"
    a.download = "odds-for-chrome.zip"
    a.click()
  }

  const detail =
    present === "looking"
      ? "Checking this browser…"
      : linked
        ? "Connected. It shows your chances on job sites and fills in applications."
        : installed
          ? "Added to Chrome. Press Connect to finish."
          : store
            ? "Add it to Chrome, then come back and press Connect."
            : "Download and unzip it. In Chrome, open chrome://extensions, switch on Developer mode, press Load unpacked and pick the folder."

  return (
    <ConnectRow
      focused={focused}
      logo="/icons/icon-192.png"
      name="Odds for Chrome"
      detail={detail}
      status={
        present === "looking" ? (
          <span className="text-xs font-medium text-muted-foreground">Checking</span>
        ) : linked ? (
          <span className="rounded-full bg-good px-2.5 py-1 text-xs font-semibold text-good-foreground">Connected</span>
        ) : installed ? (
          <span className="rounded-full border-[1.5px] border-brand/40 bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-ink">Installed</span>
        ) : (
          <StatusDot on={false} label="Not connected" />
        )
      }
      actions={
        present === "looking" ? undefined : linked ? (
          <div className="flex w-full flex-col gap-1 text-sm text-muted-foreground">
            <span>Click the odds icon in Chrome to open it.</span>
            {(() => {
              const ok = [boards.linkedin && "LinkedIn", boards.indeed && "Indeed", boards.glassdoor && "Glassdoor"].filter(Boolean) as string[]
              return ok.length ? (
                <span className="text-xs">Signed in this Chrome: {ok.join(" · ")}. Odds never stores those passwords.</span>
              ) : (
                <span className="text-xs">Job-board sign-in stays in this Chrome profile — Odds never stores those passwords.</span>
              )
            })()}
          </div>
        ) : (
          <>
            {!installed ? (
              <Button type="button" onClick={install} className="cursor-pointer max-md:h-10">
                {store ? "Add to Chrome" : "Download"}
              </Button>
            ) : null}
            {!installed ? (
              <Button type="button" variant="outline" onClick={() => pingExtension()} className="cursor-pointer max-md:h-10">
                I added it
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onOpenTour} className="cursor-pointer max-md:h-10">
              Show steps
            </Button>
            <Button type="button" variant={installed ? "default" : "outline"} disabled={busy} onClick={() => void link()} className="cursor-pointer max-md:h-10">
              {busy ? "Connecting…" : !signedIn ? "Sign in to connect" : "Connect"}
            </Button>
            {!store && !installed ? (
              <p className="w-full text-xs text-muted-foreground">Done? Come back here and press Connect.</p>
            ) : null}
          </>
        )
      }
    />
  )
}
