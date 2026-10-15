import { createPortal } from "react-dom"
import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, CheckIcon, XIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { loadAnswers, saveAnswers, type AnswerValues } from "@/lib/application-answers"
import { personalFromProfile } from "../../supabase/functions/_shared/application-personal"
import { useData } from "@/lib/data"
import { SETUP_QUESTIONS } from "@/lib/setup-questions"
import type { Setup } from "@/lib/setup"

/** One question at a time. Saved answers are the same account-owned values Autofill reads and edits. */
export function SetupPanel({ setup, onClose, onJobs }: { setup: Setup; onClose: () => void; onJobs: () => void }): React.JSX.Element {
  const data = useData()
  const userId = data.session?.user.id ?? null
  const [questions] = useState(() => [...SETUP_QUESTIONS])
  const [at, setAt] = useState(0)
  const [answers, setAnswers] = useState<AnswerValues>({})
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const frame = useRef<HTMLDivElement>(null)
  const finished = at >= questions.length
  const q = questions[at]
  const value = q ? answers[q.key] ?? "" : ""
  const selected = value.split("; ").filter(Boolean)
  const progress = Math.round(at / questions.length * 100)
  useEffect(() => {
    let live = true
    void loadAnswers().then((saved) => { if (live) { setAnswers({ ...personalFromProfile(data.profile, data.session?.user.email), ...saved }); setReady(true) } })
    return () => { live = false }
  }, [data.profile, data.session?.user.email])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    frame.current?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) onClose()
      if (event.key === "Tab" && frame.current) {
        const items = Array.from(frame.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]'))
        const first = items[0]; const last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener("keydown", key)
    return () => { window.removeEventListener("keydown", key); previous?.focus() }
  }, [onClose, busy])
  const change = (next: string): void => { if (q) setAnswers((old) => ({ ...old, [q.key]: next })) }
  async function keep(): Promise<void> {
    if (!q || !userId || !value.trim() || busy) return
    setBusy(true); setError("")
    try {
      const current = await loadAnswers()
      await saveAnswers(userId, { ...current, [q.key]: value.trim() })
      setAt((n) => n + 1)
      setup.reload()
    } catch { setError("Could not save your answer. Try again.") }
    finally { setBusy(false) }
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 sm:bg-black/40 sm:p-6">
      <div ref={frame} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="setup-title" className="flex h-dvh w-full max-w-2xl flex-col overflow-hidden bg-card outline-none sm:h-[min(760px,90dvh)] sm:rounded-3xl sm:shadow-xl">
        <header className="flex shrink-0 items-center gap-4 border-b px-5 py-4 sm:px-8">
          <span className="text-2xl font-bold tracking-tighter">odds<span className="text-brand">.</span></span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-brand transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} /></div>
          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 cursor-pointer items-center justify-center rounded-full hover:bg-secondary"><XIcon className="size-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-7 sm:px-12 sm:py-10">
          <p className="mb-3 text-center text-xs font-medium text-brand-ink">{finished ? "Your application profile" : `Let’s get started · ${at + 1} of ${questions.length}`}</p>
          <h2 id="setup-title" className="mx-auto max-w-md text-center text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">{finished ? "Your answers are ready to use" : q.title}</h2>
          <p className="mt-3 text-center text-sm text-muted-foreground">{finished ? "Saved answers are available to Autofill. You can review or change them any time." : q.maxSelections ? `Select up to ${q.maxSelections}` : q.optional ? "Optional · you can skip this question" : "Answer once. Reuse it on your applications."}</p>
          {!finished ? <div className="mx-auto mt-6 max-w-md rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">{value ? "We’ve pre-filled your saved details. Check them before continuing." : "Odds remembers your answers so you don’t have to enter them on every form."}</div> : null}
          <div className="mx-auto mt-7 max-w-md">
            {!ready ? <p role="status">Loading your saved answers…</p> : finished ? <div className="rounded-2xl border bg-brand/5 p-6 text-center"><CheckIcon className="mx-auto mb-3 size-10 text-brand-ink" /><p className="text-sm text-muted-foreground">Any unanswered questions stay available in Autofill. Odds will ask when a form needs something new.</p></div> : q.choices ? (
              <div role={q.maxSelections ? "group" : "radiogroup"} aria-labelledby="setup-title" className="flex flex-wrap justify-center gap-2.5">
                {q.choices.map((choice) => {
                  const checked = q.maxSelections ? selected.includes(choice.value) : value === choice.value
                  return <button key={choice.value} type="button" role={q.maxSelections ? "checkbox" : "radio"} aria-checked={checked} disabled={busy || Boolean(q.maxSelections && !checked && selected.length >= q.maxSelections)} onClick={() => change(q.maxSelections ? (checked ? selected.filter((v) => v !== choice.value) : [...selected, choice.value]).join("; ") : choice.value)} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border-[1.5px] px-4 py-2.5 text-sm transition-colors disabled:cursor-default disabled:opacity-40 ${checked ? "border-brand bg-brand/10 text-brand-ink" : "bg-card hover:border-brand/50 hover:bg-secondary"}`}>{checked ? <CheckIcon className="size-4 shrink-0" /> : null}{choice.label}</button>
                })}
              </div>
            ) : <input key={q.key} aria-labelledby="setup-title" value={value} disabled={busy} placeholder={q.placeholder} onChange={(e) => change(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void keep()} className="h-13 w-full rounded-xl border-[1.5px] bg-background px-4 text-base focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15" />}
          </div>
          {error ? <p role="alert" className="mt-4 text-center text-sm text-destructive">{error}</p> : null}
        </div>
        <footer className="shrink-0 border-t bg-card px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-12">
          {finished ? <Button type="button" onClick={() => { setup.reload(); onJobs() }} className="h-12 w-full rounded-xl bg-brand-ink text-base text-white hover:bg-brand-ink/90">See jobs</Button> : <>
            <Button type="button" disabled={!ready || busy || !value.trim()} onClick={() => void keep()} className="h-12 w-full cursor-pointer rounded-xl bg-brand-ink text-base text-white hover:bg-brand-ink/90">{busy ? "Saving…" : "Save and Continue"}</Button>
            <div className="mt-2 flex items-center justify-between text-sm"><button type="button" disabled={at === 0 || busy} onClick={() => { setError(""); setAt((n) => n - 1) }} className="flex cursor-pointer items-center gap-1 py-2 text-muted-foreground disabled:invisible"><ArrowLeftIcon className="size-4" />Back</button><span className="text-xs text-muted-foreground">Edit later in Autofill</span><button type="button" disabled={busy} onClick={() => { setError(""); setAt((n) => n + 1) }} className="cursor-pointer py-2 text-muted-foreground">Skip</button></div>
          </>}
        </footer>
      </div>
    </div>, document.body
  )
}
