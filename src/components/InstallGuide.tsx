import { useEffect, useMemo, useState } from "react"
import { encode } from "uqr"
import { ChevronLeftIcon, ChevronRightIcon, CircleCheckIcon, XIcon } from "@/components/icons"
import { AndroidPhone, IosPhone, type AndroidScreen, type IosScreen } from "@/components/PhoneMock"
import { Button } from "@/components/ui/button"
import { createPhoneLink, type Session } from "@/lib/auth"
import { useHomeScreenCode } from "@/components/NotifyPrompt"
import { iosOtherBrowser, platformOf, promptInstall, usePhoneCounts, usePush } from "@/lib/push"
import { cn } from "cn"

type Phone = "ios" | "android"

const IOS: ReadonlyArray<{ screen: IosScreen; text: React.ReactNode; note?: string }> = [
  { screen: "safari", text: <>Tap <b>Share</b> at the bottom of Safari: the square with an arrow.</>, note: "Don’t see it? Tap ··· next to the address, then Share." },
  { screen: "share", text: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
  { screen: "add", text: <>Keep <b>Open as Web App</b> on and tap <b>Add</b>.</> },
  { screen: "home", text: <>Open <b>odds</b> from your Home Screen.</> },
  { screen: "allow", text: <>Tap <b>Turn on notifications</b>, then <b>Allow</b>.</> },
]

const ANDROID: ReadonlyArray<{ screen: AndroidScreen; text: React.ReactNode; note?: string }> = [
  { screen: "chrome", text: <>In Chrome, tap <b>⋮</b> at the top right.</> },
  { screen: "menu", text: <>Tap <b>Add to Home screen</b>.</>, note: "On some phones it says Install app." },
  { screen: "install", text: <>Tap <b>Install</b>.</> },
  { screen: "home", text: <>Open <b>odds</b> from your Home Screen.</> },
  { screen: "allow", text: <>Tap <b>Turn on notifications</b>, then <b>Allow</b>.</> },
]

/**
 * Where the phone opens odds. The site's own address, except while testing on a computer's local address, which a phone
 * cannot reach: then VITE_PUBLIC_URL (a temporary https link to this computer, in .env.local).
 */
const PHONE_ORIGIN = /^(localhost|127\.|\[::1\])/.test(window.location.hostname) && import.meta.env.VITE_PUBLIC_URL ? String(import.meta.env.VITE_PUBLIC_URL).replace(/\/$/, "") : window.location.origin

/** The QR code, drawn as squares so it stays sharp at any size. */
function QrCode({ text }: { text: string }): React.JSX.Element {
  const { data, size } = useMemo(() => encode(text, { border: 2 }), [text])

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label="QR code that opens odds on your phone" className="size-44 rounded-lg bg-white" shapeRendering="crispEdges">
      {data.flatMap((row, y) => row.map((on, x) => (on ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#1c1a19" /> : null)))}
    </svg>
  )
}

/** On a computer: a QR code that opens odds on the phone, signed in, at these same steps. Renewed before it runs out. */
function ScanToPhone({ session }: { session: Session }): React.JSX.Element {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [round, setRound] = useState<number>(0)

  useEffect(() => {
    let live = true
    let timer: number | undefined
    createPhoneLink(session, "qr")
      .then(({ code, expires_at }) => {
        if (!live) return
        setLink(`${PHONE_ORIGIN}/?link=${encodeURIComponent(code)}&install=1`)
        setError(null)
        timer = window.setTimeout(() => setRound((r) => r + 1), Math.max(Date.parse(expires_at) - Date.now() - 30_000, 30_000))
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Could not make the code."))

    return () => {
      live = false
      if (timer) window.clearTimeout(timer)
    }
  }, [session, round])

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border-[1.5px] p-4 text-center">
      {link ? <QrCode text={link} /> : <div className="size-44 animate-pulse rounded-lg bg-muted" aria-hidden="true" />}
      <p className="text-base font-medium">Scan with your phone’s camera</p>
      <p className="text-sm text-muted-foreground">odds opens on your phone, signed in, with the steps below. On iPhone, open it in Safari.</p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

/**
 * An iPhone that opened odds in Chrome or another browser: only Safari can add odds to the Home Screen with
 * notifications. One tap opens this page in Safari, signed in (a fresh one-time code); copying the link is the fallback.
 */
function OpenInSafari({ session, browser }: { session: Session | null; browser: string }): React.JSX.Element {
  const [copied, setCopied] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  async function linkForSafari(): Promise<string> {
    const base = `${window.location.origin}/?install=1`
    if (!session) return base
    const { code } = await createPhoneLink(session, "qr")
    return `${base}&link=${encodeURIComponent(code)}`
  }

  function open(): void {
    void linkForSafari()
      .then((url) => {
        window.location.href = url.replace(/^https:/, "x-safari-https:").replace(/^http:/, "x-safari-http:")
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not open Safari."))
  }

  // A QR code opens in the phone's default browser. When that is not Safari, go to Safari at once, signed in; the
  // button below stays for when the browser asks first. Once per tab, so coming back here does not loop.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("odds:safari-jump")) return
      window.sessionStorage.setItem("odds:safari-jump", "1")
    } catch {
      return
    }
    open()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-2 rounded-xl border-[1.5px] border-brand p-4 text-center">
      <p className="text-base font-semibold">Open odds in Safari</p>
      <p className="text-sm text-muted-foreground">You’re in {browser}. On iPhone, only Safari can add odds to your Home Screen with notifications.</p>
      <Button
        type="button"
        size="lg"
        onClick={open}
        className="cursor-pointer"
      >
        Open in Safari
      </Button>
      <button
        type="button"
        onClick={() => {
          void linkForSafari()
            .then((url) => navigator.clipboard.writeText(url))
            .then(() => setCopied(true))
            .catch(() => setError("Could not copy. Open Safari and go to this page."))
        }}
        className="cursor-pointer text-sm underline underline-offset-4"
      >
        {copied ? "Copied. Paste it in Safari." : "Or copy the link for Safari"}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

/**
 * How to get odds on a phone with its notifications on, as few steps as each phone allows. A computer shows a QR code;
 * Android installs with one tap where Chrome offers it; an iPhone gets drawn steps, and its Home Screen app opens signed in.
 */
export function InstallGuide({ session, onClose }: { session: Session | null; onClose: () => void }): React.JSX.Element {
  const platform = platformOf()
  const desktop = platform === "desktop"
  const push = usePush()
  const phones = usePhoneCounts(session, desktop ? 4000 : undefined)
  useHomeScreenCode(session)
  // Only a phone that turns notifications on while this is open counts as done; one set up before does not end the steps.
  const done = desktop && phones.now !== null && phones.first !== null && phones.now > phones.first
  const [phone, setPhone] = useState<Phone>(platform === "android" ? "android" : "ios")
  const [step, setStep] = useState<number>(0)
  const steps = phone === "ios" ? IOS : ANDROID
  const current = steps[Math.min(step, steps.length - 1)]
  const last = step >= steps.length - 1

  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, steps.length - 1))
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0))
    }
    window.addEventListener("keydown", key)

    return () => window.removeEventListener("keydown", key)
  }, [onClose, steps.length])

  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()} className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center sm:p-4">
      <div role="dialog" aria-modal="true" aria-label={desktop ? "Get odds on your phone" : "Add odds to your Home Screen"} className="flex w-full flex-col gap-4 overflow-y-auto bg-card p-5 sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-xl sm:border-[1.5px] sm:shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">{desktop ? "Get odds on your phone" : "Add odds to your Home Screen"}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="-m-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-muted">
            <XIcon className="size-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CircleCheckIcon className="size-12 text-[#16A34A]" aria-hidden="true" />
            <p className="text-base font-medium">Done. Your phone gets the new jobs that fit you at 8 every morning.</p>
            <Button type="button" onClick={onClose} className="cursor-pointer">
              Close
            </Button>
          </div>
        ) : (
          <>
            {desktop && session ? <ScanToPhone session={session} /> : null}

            {iosOtherBrowser() ? <OpenInSafari session={session} browser={iosOtherBrowser()!} /> : null}

            {platform === "android" && push.canPrompt ? (
              <div className="flex flex-col gap-2 rounded-xl border-[1.5px] p-4 text-center">
                <Button type="button" size="lg" onClick={() => void promptInstall()} className="cursor-pointer">
                  Install odds
                </Button>
                <p className="text-sm text-muted-foreground">Then open odds and tap Turn on notifications.</p>
              </div>
            ) : null}

            <div role="tablist" aria-label="Your phone" className="grid grid-cols-2 rounded-lg border-[1.5px] p-0.5 text-sm font-medium">
              {(["ios", "android"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={phone === p}
                  onClick={() => {
                    setPhone(p)
                    setStep(0)
                  }}
                  className={cn("cursor-pointer rounded-md py-1.5", phone === p ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                >
                  {p === "ios" ? "iPhone" : "Android"}
                </button>
              ))}
            </div>

            {phone === "ios" ? <p className="text-center text-sm font-semibold">On iPhone, do this in Safari, not Chrome.</p> : null}

            {phone === "ios" ? <IosPhone screen={current.screen as IosScreen} /> : <AndroidPhone screen={current.screen as AndroidScreen} />}

            <div aria-live="polite" className="flex min-h-[4.5rem] flex-col gap-1 text-center">
              <p className="text-xs font-medium text-muted-foreground tabular-nums">
                Step {step + 1} of {steps.length}
              </p>
              <p className="text-base">{current.text}</p>
              {current.note ? <p className="text-sm text-muted-foreground">{current.note}</p> : null}
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => Math.max(s - 1, 0))} className="cursor-pointer">
                <ChevronLeftIcon aria-hidden="true" />
                Back
              </Button>
              <span aria-hidden="true" className="flex gap-1.5">
                {steps.map((s, i) => (
                  <span key={s.screen} className={cn("size-1.5 rounded-full", i === step ? "bg-brand" : "bg-border")} />
                ))}
              </span>
              {last ? (
                <Button type="button" onClick={onClose} className="cursor-pointer">
                  Got it
                </Button>
              ) : (
                <Button type="button" onClick={() => setStep((s) => Math.min(s + 1, steps.length - 1))} className="cursor-pointer">
                  Next
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
