import { lazy, Suspense, useState } from "react"
import { CheckIcon, XIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { useSetup } from "@/lib/setup"

const SetupPanel = lazy(() => import("@/components/SetupPanel").then((m) => ({ default: m.SetupPanel })))

const HIDDEN = "odds:setup-hidden"
const hiddenNow = (): boolean => {
  try {
    return window.sessionStorage.getItem(HIDDEN) === "1"
  } catch {
    return false
  }
}

const LABEL: Record<string, string> = {
  details: "Your details",
  answers: "Saved answers",
  extension: "Chrome extension",
  cv: "Your CV",
}

/**
 * What is left before applying takes one click. Shown on Home (and Autofill) until complete.
 * The X hides it for this visit only; it returns next visit until everything is done.
 */
export function SetupCard({ onJobs, onOpenTab }: { onJobs: () => void; onOpenTab?: (tab: "autofill" | "documents") => void }): React.JSX.Element | null {
  const setup = useSetup()
  const [initialStep, setInitialStep] = useState(0)
  const [open, setOpen] = useState<boolean>(false)
  const [hidden, setHidden] = useState<boolean>(hiddenNow)
  if (!setup.ready || (setup.complete && !open) || (hidden && !open)) return null

  const left = setup.steps.filter((s) => !s.done).length

  return (
    <section aria-label="Set up one-click applying" className="relative border border-foreground/15 bg-card px-5 py-6 sm:px-7 sm:py-7">
      <button
        type="button"
        aria-label="Hide for now"
        onClick={() => {
          try {
            window.sessionStorage.setItem(HIDDEN, "1")
          } catch {
            // Blocked storage: it hides until the page is reloaded, which is fine.
          }
          setHidden(true)
        }}
        className="absolute top-3 right-3 z-10 flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>

      <div className="pr-8">
        <p className="font-heading text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">Apply with Odds</p>
        <h2 className="font-heading mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Finish setup</h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {left === 1 ? "One step left before forms fill themselves." : `${left} steps left before forms fill themselves.`}
        </p>
      </div>

      <ul className="mt-6 divide-y divide-foreground/10 border-y border-foreground/10">
        {setup.steps.map((s) => {
          const label = LABEL[s.key] ?? s.key
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => {
                  if (s.key === "details" || s.key === "answers") {
                    setInitialStep(s.key === "details" ? 0 : 1)
                    setOpen(true)
                  } else onOpenTab?.(s.key === "cv" ? "documents" : "autofill")
                }}
                aria-label={`${label}${s.done ? ": complete" : ": not complete"}`}
                className="flex w-full cursor-pointer items-center gap-3 py-3.5 text-left transition-colors hover:bg-foreground/[0.03]"
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center border border-foreground ${s.done ? "bg-foreground text-background" : "bg-transparent"}`}
                  aria-hidden="true"
                >
                  {s.done ? <CheckIcon weight="bold" className="size-3" /> : null}
                </span>
                <span className={`text-sm font-semibold tracking-tight ${s.done ? "text-muted-foreground line-through decoration-foreground/30" : "text-foreground"}`}>
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <Button
        type="button"
        size="lg"
        onClick={() => {
          setInitialStep(0)
          setOpen(true)
        }}
        className="mt-6 h-12 w-full cursor-pointer rounded-md bg-foreground text-base font-semibold tracking-tight text-background hover:bg-foreground/90"
      >
        Continue setup
      </Button>

      {open ? (
        <Suspense fallback={null}>
          <SetupPanel initialStep={initialStep} setup={setup} onClose={() => setOpen(false)} onJobs={() => { setOpen(false); onJobs() }} />
        </Suspense>
      ) : null}
    </section>
  )
}
