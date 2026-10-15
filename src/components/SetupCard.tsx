import { lazy, Suspense, useState } from "react"
import { CheckIcon, XIcon } from "@/components/icons"
import { BRAND_BACKDROP } from "@/components/PromoSheet"
import { SetupGraphic } from "@/components/SetupGraphic"
import { Button } from "@/components/ui/button"
import { useSetup } from "@/lib/setup"
import { SETUP_QUESTIONS } from "@/lib/setup-questions"

const SetupPanel = lazy(() => import("@/components/SetupPanel").then((m) => ({ default: m.SetupPanel })))

const HIDDEN = "odds:setup-hidden"
const hiddenNow = (): boolean => {
  try {
    return window.sessionStorage.getItem(HIDDEN) === "1"
  } catch {
    return false
  }
}

/**
 * What is left before applying takes one click, as a notice at the top of Home made like the app's other notices (a picture on the brand colour,
 * a title, the points, one big button): beside the content on a wide screen, above it on a phone. The X hides it for this visit only; it is back
 * the next time until everything is done, and then it never shows.
 */
export function SetupCard({ onJobs, onOpenTab }: { onJobs: () => void; onOpenTab?: (tab: "autofill" | "documents") => void }): React.JSX.Element | null {
  const setup = useSetup()
  const [open, setOpen] = useState<boolean>(false)
  const [hidden, setHidden] = useState<boolean>(hiddenNow)
  if (!setup.ready || (setup.complete && !open) || (hidden && !open)) return null
  const required = SETUP_QUESTIONS.filter((q) => !q.optional)
  const asked = required.length - setup.missing.filter((q) => !q.optional).length

  return (
    <section aria-label="Set up one-click applying" className="phone-prompt-pop relative grid overflow-hidden rounded-2xl border-[1.5px] bg-card shadow-sm md:grid-cols-[17rem_minmax(0,1fr)]">
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
        className="absolute top-3 right-3 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full max-md:bg-black/25 max-md:text-white max-md:hover:bg-black/40 md:text-muted-foreground md:hover:bg-secondary md:hover:text-foreground"
      >
        <XIcon className="size-5" aria-hidden="true" />
      </button>
      <div className={`relative h-44 md:h-auto md:min-h-64 ${BRAND_BACKDROP}`}>
        <SetupGraphic done={setup.done} total={setup.total} steps={setup.steps} compact />
      </div>
      <div className="flex flex-col justify-center gap-4 p-5 md:p-7">
        <h2 className="font-heading text-2xl leading-tight font-semibold tracking-tight">Set up one-click applying</h2>
        <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {setup.steps.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => (s.key === "answers" ? setOpen(true) : s.key === "cv" ? onOpenTab?.("documents") : s.key === "first" ? onJobs() : onOpenTab?.("autofill"))}
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md py-0.5 text-left text-[0.95rem] hover:underline hover:underline-offset-4"
              >
                <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${s.done ? "bg-good text-good-foreground" : "border-[1.5px] border-dashed"}`}>
                  {s.done ? <CheckIcon weight="bold" className="size-3" aria-hidden="true" /> : null}
                </span>
                <span className={s.done ? "text-muted-foreground" : "font-medium"}>{s.key === "answers" && !s.done ? `Answers ${asked} of ${required.length}` : s.title}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button type="button" size="lg" onClick={() => setOpen(true)} className="h-12 w-full cursor-pointer rounded-full text-base sm:w-fit sm:px-10">
          Finish setup
        </Button>
      </div>
      {open ? (
        <Suspense fallback={null}>
          <SetupPanel setup={setup} onClose={() => setOpen(false)} onJobs={() => { setOpen(false); onJobs() }} />
        </Suspense>
      ) : null}
    </section>
  )
}
