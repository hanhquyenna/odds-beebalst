import { useEffect, useState } from "react"
import { BellIcon, CheckIcon, XIcon } from "@/components/icons"
import { AndroidPhone, IosPhone } from "@/components/PhoneMock"
import { Button } from "@/components/ui/button"
import { isInstalled, openInstallGuide, platformOf, promptInstall, usePush } from "@/lib/push"

const HIDDEN_UNTIL = "odds:phone-prompt-until"
/** "Not now" keeps it away for three days, then it asks once more. */
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

function snoozed(): boolean {
  try {
    return Number(window.localStorage.getItem(HIDDEN_UNTIL) ?? 0) > Date.now()
  } catch {
    return false
  }
}

function snooze(): void {
  try {
    window.localStorage.setItem(HIDDEN_UNTIL, String(Date.now() + SNOOZE_MS))
  } catch {
    // Blocked storage: it asks again next visit, which is fine.
  }
}

const POINTS = ["New jobs that fit you, every morning at 8", "Opens in one tap, like an app", "Free, no App Store needed"] as const

/**
 * On a phone in the browser, right after landing in the app signed in: a big card that shows what odds on the Home Screen
 * looks like (the morning message on the lock screen) and opens the steps in one tap. Never in the Home Screen app itself.
 */
export function AddToPhonePrompt({ active }: { active: boolean }): React.JSX.Element | null {
  const platform = platformOf()
  const push = usePush()
  const [open, setOpen] = useState<boolean>(false)

  useEffect(() => {
    if (!active || platform === "desktop" || isInstalled() || snoozed()) return
    // A moment after the app shows, so it lands on the jobs rather than on a blank page.
    const id = window.setTimeout(() => setOpen(true), 900)

    return () => window.clearTimeout(id)
  }, [active, platform])

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close()
    }
    window.addEventListener("keydown", key)

    return () => window.removeEventListener("keydown", key)
  }, [open])

  if (!open) return null

  function close(): void {
    snooze()
    setOpen(false)
  }

  async function add(): Promise<void> {
    setOpen(false)
    snooze()
    // Android Chrome can install in one tap; everywhere else the drawn steps show the way.
    if (platform === "android" && push.canPrompt && (await promptInstall())) return
    openInstallGuide()
  }

  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()} className="phone-prompt-fade fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-labelledby="phone-prompt-title" className="phone-prompt-sheet relative w-full max-w-md overflow-hidden rounded-t-3xl bg-card shadow-2xl">
        <button type="button" aria-label="Close" onClick={close} className="absolute top-3 right-3 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full bg-black/25 text-white hover:bg-black/40">
          <XIcon className="size-5" aria-hidden="true" />
        </button>

        {/* The picture: the lock screen with the morning message, cropped to its top half, on the brand colour. */}
        <div className="relative h-[15.5rem] overflow-hidden bg-[radial-gradient(120%_90%_at_50%_0%,oklch(0.78_0.17_60),var(--brand)_55%,var(--brand-ink))]">
          <span aria-hidden="true" className="absolute top-7 left-6 flex size-11 rotate-[-12deg] items-center justify-center rounded-2xl bg-white/95 shadow-lg">
            <BellIcon weight="fill" className="bell-shake size-6 text-brand" />
          </span>
          <div aria-hidden="true" className="absolute top-6 left-1/2 w-[228px] -translate-x-1/2">
            <div className="phone-prompt-rise origin-top scale-[0.92]">{platform === "android" ? <AndroidPhone screen="lock" /> : <IosPhone screen="lock" />}</div>
          </div>
          {/* The morning message itself, big enough to read, floating over the phone. */}
          <div aria-hidden="true" className="absolute inset-x-5 bottom-4 flex flex-col">
            <div className="phone-prompt-pop mx-3 -mb-9 h-14 rounded-2xl bg-white/60 shadow-md" style={{ animationDelay: "0.55s" }} />
            <div className="phone-prompt-pop flex items-center gap-3 rounded-2xl bg-white p-3 shadow-xl" style={{ animationDelay: "0.4s" }}>
              <img src="/icons/apple-touch-icon.png" alt="" className="size-10 shrink-0 rounded-[22%]" />
              <span className="min-w-0 flex-1">
                <span className="flex justify-between text-xs font-semibold text-neutral-500">
                  odds<span className="font-normal">8:00</span>
                </span>
                <span className="block font-semibold text-black">5 new jobs fit you</span>
                <span className="block truncate text-sm text-neutral-600">Marketing Intern at Picnic and 4 more</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-1.5">
            <h2 id="phone-prompt-title" className="font-heading text-2xl leading-tight font-semibold tracking-tight">
              Put odds on your phone
            </h2>
            <p className="text-muted-foreground">Never miss a job that fits you. odds tells you the moment one opens.</p>
          </div>

          <ul className="flex flex-col gap-2">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2.5 text-[0.95rem]">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-good text-good-foreground">
                  <CheckIcon weight="bold" className="size-3" aria-hidden="true" />
                </span>
                {p}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1">
            <Button type="button" size="lg" onClick={() => void add()} className="h-12 w-full cursor-pointer rounded-full text-base">
              Add to my phone
            </Button>
            <button type="button" onClick={close} className="cursor-pointer py-2 text-sm text-muted-foreground">
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
