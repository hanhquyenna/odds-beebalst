import { useEffect, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "@/components/icons"
import { AndroidPhone, IosPhone, type AndroidScreen, type IosScreen } from "@/components/PhoneMock"
import { Button } from "@/components/ui/button"
import { platformOf } from "@/lib/push"
import { cn } from "cn"

type Phone = "ios" | "android"

const IOS: ReadonlyArray<{ screen: IosScreen; text: React.ReactNode; note?: string }> = [
  { screen: "safari", text: <>In Safari, tap <b>···</b> next to the address bar.</>, note: "Older iPhone? Tap the Share button at the bottom of the screen and go to step 3." },
  { screen: "menu", text: <>Tap <b>Share</b>.</> },
  { screen: "share", text: <>Scroll down and tap <b>Add to Home Screen</b>.</> },
  { screen: "add", text: <>Keep <b>Open as Web App</b> on and tap <b>Add</b>.</> },
  { screen: "home", text: <>Open <b>odds</b> from your Home Screen.</> },
  { screen: "allow", text: <>Tap the bell, then <b>Turn on notifications</b>, then <b>Allow</b>.</> },
  { screen: "lock", text: <>Done. Every morning at 8 you get the new jobs that fit you.</> },
]

const ANDROID: ReadonlyArray<{ screen: AndroidScreen; text: React.ReactNode; note?: string }> = [
  { screen: "chrome", text: <>In Chrome, tap <b>⋮</b> at the top right.</> },
  { screen: "menu", text: <>Tap <b>Add to Home screen</b>.</>, note: "On some phones it says Install app." },
  { screen: "install", text: <>Tap <b>Install</b>.</> },
  { screen: "home", text: <>Open <b>odds</b> from your Home Screen.</> },
  { screen: "allow", text: <>Tap the bell, then <b>Turn on notifications</b>, then <b>Allow</b>.</> },
  { screen: "lock", text: <>Done. Every morning at 8 you get the new jobs that fit you.</> },
]

/** Step by step, with a drawing of the phone for each step, how to put odds on the Home Screen and turn on its notifications. */
export function InstallGuide({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [phone, setPhone] = useState<Phone>(platformOf() === "android" ? "android" : "ios")
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
      <div role="dialog" aria-modal="true" aria-label="Add odds to your Home Screen" className="flex w-full flex-col gap-4 overflow-y-auto bg-card p-5 sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-xl sm:border-[1.5px] sm:shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Add odds to your Home Screen</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="-m-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-muted">
            <XIcon className="size-5" />
          </button>
        </div>

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
      </div>
    </div>
  )
}
