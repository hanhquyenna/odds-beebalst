import { useEffect } from "react"
import { CheckIcon, XIcon } from "@/components/icons"
import { AndroidPhone, IosPhone } from "@/components/PhoneMock"
import { Button } from "@/components/ui/button"
import type { Platform } from "@/lib/push"

/**
 * The one look for the two panels shown on a phone at first sign-in: "odds is now an app" (add it to the Home Screen) and "get your
 * jobs at 8 every morning" (turn notifications on). A bottom sheet with a picture on the brand colour, a title, three short points,
 * one big button and "Not now". The pictures are drawn from the same phone screens as the Home Screen steps (PhoneMock.tsx).
 */

const BRAND_BACKDROP = "bg-[radial-gradient(120%_90%_at_50%_0%,oklch(0.78_0.17_60),var(--brand)_55%,var(--brand-ink))]"

export function PromoSheet({
  titleId,
  graphic,
  title,
  body,
  points,
  action,
  busy = false,
  error,
  later = "Not now",
  onAction,
  onClose,
}: {
  titleId: string
  graphic: React.ReactNode
  title: string
  body: string
  points: ReadonlyArray<string>
  action: string
  busy?: boolean
  error?: string | null
  later?: string
  onAction: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <SheetFrame titleId={titleId} graphic={graphic} onClose={onClose}>
      <div className="flex flex-col gap-1.5">
        <h2 id={titleId} className="font-heading text-2xl leading-tight font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-muted-foreground">{body}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {points.map((p) => (
          <li key={p} className="flex items-center gap-2.5 text-[0.95rem]">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-good text-good-foreground">
              <CheckIcon weight="bold" className="size-3" aria-hidden="true" />
            </span>
            {p}
          </li>
        ))}
      </ul>

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-col gap-1">
        <Button type="button" size="lg" disabled={busy} onClick={onAction} className="h-12 w-full cursor-pointer rounded-full text-base">
          {action}
        </Button>
        <button type="button" onClick={onClose} className="cursor-pointer py-2.5 text-sm text-muted-foreground">
          {later}
        </button>
      </div>
    </SheetFrame>
  )
}

/** The sheet itself: dimmed page, a picture on the brand colour, and room under it for whatever the panel says. */
export function SheetFrame({ titleId, graphic, onClose, children }: { titleId: string; graphic: React.ReactNode; onClose: () => void; children: React.ReactNode }): React.JSX.Element {
  useEffect(() => {
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", key)

    return () => window.removeEventListener("keydown", key)
  }, [onClose])

  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()} className="phone-prompt-fade fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="phone-prompt-sheet relative w-full max-w-md overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 z-10 flex size-10 cursor-pointer items-center justify-center rounded-full bg-black/25 text-white hover:bg-black/40">
          <XIcon className="size-5" aria-hidden="true" />
        </button>

        <div className={`relative h-[15.5rem] overflow-hidden ${BRAND_BACKDROP}`}>{graphic}</div>

        <div className="flex flex-col gap-4 px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  )
}

/** Panel one's picture: the Home Screen with odds on it, and the line the phone shows when you add it. */
export function HomeScreenGraphic({ platform }: { platform: Platform }): React.JSX.Element {
  return (
    <>
      {/* Pushed up, so the row with the odds icon (the last one on the Home Screen) is above the card that floats at the bottom. */}
      <div aria-hidden="true" className="absolute top-[-2.4rem] left-1/2 w-[228px] -translate-x-1/2">
        <div className="phone-prompt-rise origin-top scale-[0.92]">{platform === "android" ? <AndroidPhone screen="home" /> : <IosPhone screen="home" />}</div>
      </div>
      <div aria-hidden="true" className="absolute inset-x-5 bottom-4 flex flex-col">
        <div className="phone-prompt-pop mx-3 -mb-9 h-14 rounded-2xl bg-white/60 shadow-md" style={{ animationDelay: "0.55s" }} />
        <div className="phone-prompt-pop flex items-center gap-3 rounded-2xl bg-white p-3 shadow-xl" style={{ animationDelay: "0.4s" }}>
          <img src="/icons/apple-touch-icon.png" alt="" className="size-10 shrink-0 rounded-[22%]" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-black">odds</span>
            <span className="block truncate text-sm text-neutral-600">{platform === "android" ? "Install app" : "Add to Home Screen"}</span>
          </span>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-lg leading-none font-semibold text-white">+</span>
        </div>
      </div>
    </>
  )
}

/** Panel two's picture: the lock screen with the morning message on it. */
export function LockScreenGraphic({ platform }: { platform: Platform }): React.JSX.Element {
  return (
    <>
      <div aria-hidden="true" className="absolute top-6 left-1/2 w-[228px] -translate-x-1/2">
        <div className="phone-prompt-rise origin-top scale-[0.92]">{platform === "android" ? <AndroidPhone screen="lock" /> : <IosPhone screen="lock" />}</div>
      </div>
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
    </>
  )
}
