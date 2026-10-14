import { lazy, Suspense, useState } from "react"
import { CheckIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { useSetup } from "@/lib/setup"
import { SETUP_QUESTIONS } from "@/lib/setup-questions"

const SetupPanel = lazy(() => import("@/components/SetupPanel").then((m) => ({ default: m.SetupPanel })))

/** What is left before applying takes one click, on one card, and the way to finish it. Gone once everything is done. */
export function SetupCard({ onJobs }: { onJobs: () => void }): React.JSX.Element | null {
  const setup = useSetup()
  const [open, setOpen] = useState<boolean>(false)
  if (!setup.ready || (setup.complete && !open)) return null
  const asked = SETUP_QUESTIONS.length - setup.missing.length

  return (
    <section aria-label="Ready to apply" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-xl border-[1.5px] bg-card p-4 sm:p-5">
      <div className="flex min-w-0 flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Ready to apply <span className="font-normal text-muted-foreground tabular-nums">{setup.done}/{setup.total}</span>
        </h2>
        <ul className="flex flex-wrap gap-1.5">
          {setup.steps.map((s) => (
            <li key={s.key} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${s.done ? "bg-good text-good-foreground" : "border-[1.5px] border-dashed text-muted-foreground"}`}>
              {s.done ? <CheckIcon weight="bold" className="size-3.5" aria-hidden="true" /> : null}
              {s.key === "answers" && !s.done ? `Answers ${asked}/${SETUP_QUESTIONS.length}` : s.title}
            </li>
          ))}
        </ul>
      </div>
      <Button type="button" onClick={() => setOpen(true)} className="h-10 cursor-pointer rounded-lg px-4">
        Finish setup
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <SetupPanel setup={setup} onClose={() => setOpen(false)} onJobs={() => { setOpen(false); onJobs() }} />
        </Suspense>
      ) : null}
    </section>
  )
}
