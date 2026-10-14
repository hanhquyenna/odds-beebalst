import { useState } from "react"
import { CheckIcon } from "@/components/icons"
import { SheetFrame } from "@/components/PromoSheet"
import { Button } from "@/components/ui/button"
import { loadAnswers, saveAnswers } from "@/lib/application-answers"
import { useData } from "@/lib/data"
import type { Setup } from "@/lib/setup"

const RING = 2 * Math.PI * 46

/** The picture: a ring that fills as the steps are done, with the steps floating round it. */
function RingGraphic({ done, total, steps }: { done: number; total: number; steps: Setup["steps"] }): React.JSX.Element {
  const spots = ["top-8 left-5", "top-24 right-5", "bottom-9 left-7", "bottom-6 right-9"] as const

  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute top-1/2 left-1/2 flex size-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <svg viewBox="0 0 112 112" className="absolute inset-0 -rotate-90">
          <circle cx="56" cy="56" r="46" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="9" />
          <circle cx="56" cy="56" r="46" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(RING * done) / total} ${RING}`} className="transition-[stroke-dasharray] duration-500" />
        </svg>
        <span className="relative text-4xl font-semibold tracking-tight text-white tabular-nums">{done}/{total}</span>
      </div>
      {steps.slice(0, 4).map((s, i) => (
        <span
          key={s.key}
          className={`phone-prompt-pop absolute ${spots[i]} flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold shadow-md ${s.done ? "bg-white text-neutral-900" : "bg-neutral-900 text-white"}`}
          style={{ animationDelay: `${0.2 + i * 0.2}s` }}
        >
          {s.done ? <CheckIcon weight="bold" className="size-3.5 text-good-foreground" /> : null}
          {s.title}
        </span>
      ))}
    </div>
  )
}

/**
 * Finish setup: the questions every form asks, one at a time, tapped or typed, kept for every application. Opens from Home and from Autofill.
 * When none are left it says so and goes to the jobs.
 */
export function SetupPanel({ setup, onClose, onJobs }: { setup: Setup; onClose: () => void; onJobs: () => void }): React.JSX.Element {
  const data = useData()
  const userId = data.session?.user.id ?? null
  // The questions as they were when it opened, so the panel does not move under a person while they answer.
  const [questions] = useState(() => (setup.missing.length ? setup.missing : []))
  const [at, setAt] = useState<number>(0)
  const [value, setValue] = useState<string>("")
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const finished = at >= questions.length
  const q = finished ? null : questions[at]
  const answersLeft = questions.length - at
  // The answers step counts once the last question is kept.
  const base = setup.steps.filter((s) => s.key !== "answers" && s.done).length
  const done = Math.min(setup.total, base + (finished ? 1 : 0))
  const steps = setup.steps.map((s) => (s.key === "answers" ? { ...s, done: finished } : s))

  async function keep(): Promise<void> {
    if (!q || !userId || !value.trim()) return
    setBusy(true)
    setError(null)
    try {
      const current = await loadAnswers()
      await saveAnswers(userId, { ...current, [q.key]: value.trim() })
      setValue("")
      setAt((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetFrame titleId="setup-title" graphic={<RingGraphic done={done} total={setup.total} steps={steps} />} onClose={onClose}>
      <div className="flex gap-1.5" aria-hidden="true">
        {Array.from({ length: Math.max(questions.length, 1) }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < at || finished ? "bg-brand" : "bg-secondary"}`} />
        ))}
      </div>
      <h2 id="setup-title" className="font-heading text-2xl leading-tight font-semibold tracking-tight">
        {q ? q.title : "Applying takes one click"}
      </h2>
      {q ? (
        <>
          {q.choices ? (
            <div role="radiogroup" aria-labelledby="setup-title" className="flex flex-col gap-2">
              {q.choices.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={value === c.value}
                  onClick={() => setValue(c.value)}
                  className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl border-[1.5px] px-4 text-left text-base font-medium transition-colors duration-150 ${value === c.value ? "border-brand bg-accent" : "hover:bg-secondary"}`}
                >
                  {c.label}
                  <span className={`size-5 rounded-full border-[1.5px] ${value === c.value ? "border-brand bg-brand ring-[3px] ring-inset ring-accent" : ""}`} />
                </button>
              ))}
            </div>
          ) : (
            <input
              autoFocus
              aria-labelledby="setup-title"
              value={value}
              placeholder={q.placeholder}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void keep()}
              className="h-12 w-full rounded-xl border-[1.5px] bg-background px-4 text-base focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/40"
            />
          )}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <div className="flex flex-col gap-1">
            <Button type="button" size="lg" disabled={busy || !value.trim()} onClick={() => void keep()} className="h-12 w-full cursor-pointer rounded-full text-base">
              {answersLeft === 1 ? "Save" : "Save and next"}
            </Button>
            <button type="button" onClick={() => { setValue(""); setAt((n) => n + 1) }} className="cursor-pointer py-2.5 text-sm text-muted-foreground">
              Skip
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <Button type="button" size="lg" onClick={() => { setup.reload(); onJobs() }} className="h-12 w-full cursor-pointer rounded-full text-base">
            See jobs
          </Button>
          <button type="button" onClick={onClose} className="cursor-pointer py-2.5 text-sm text-muted-foreground">
            Close
          </button>
        </div>
      )}
    </SheetFrame>
  )
}
