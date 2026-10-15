import { createPortal } from "react-dom"
import { useEffect, useRef, useState } from "react"
import { ArrowLeftIcon, CheckIcon, XIcon } from "@/components/icons"
import { ProfileReview } from "@/components/ProfileReview"
import { PersonAvatar } from "@/components/PersonAvatar"
import { Button } from "@/components/ui/button"
import { ANSWER_FIELDS, loadAnswers, saveAnswers, type AnswerValues } from "@/lib/application-answers"
import { educationFromProfile, personalFromProfile } from "../../supabase/functions/_shared/application-personal"
import { useData } from "@/lib/data"
import { SETUP_QUESTIONS } from "@/lib/setup-questions"
import type { Setup } from "@/lib/setup"

/** One question at a time. Saved answers are the same account-owned values Autofill reads and edits. */
export function SetupPanel({ setup, onClose, onJobs, initialStep = 0 }: { setup: Setup; onClose: () => void; onJobs: () => void; initialStep?: number }): React.JSX.Element {
  const data = useData()
  const userId = data.session?.user.id ?? null
  const [draft, setDraft] = useState(() => data.profile)
  const [initialProfile] = useState(() => data.profile)
  const accountEmail = data.session?.user.email
  const steps = [
    { title: "Your details", keys: ["first_name", "last_name", "email", "phone"] },
    { title: "Do you need a visa or permit to work in the Netherlands?", keys: ["work_authorization"] },
    { title: "When are you available?", keys: ["start_date", "hours_per_week"] },
    { title: "Can your university sign an internship agreement?", keys: ["internship_agreement"] },
  ]
  const [at, setAt] = useState(initialStep)
  const [answers, setAnswers] = useState<AnswerValues>({})
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const frame = useRef<HTMLDivElement>(null)
  const finished = at >= steps.length
  const step = steps[at]
  const progress = Math.round((at / steps.length) * 100)
  useEffect(() => {
    let live = true
    void loadAnswers().then((saved) => {
      if (live) {
        const inferred = personalFromProfile(initialProfile, accountEmail)
        const parts = initialProfile.name.trim().split(/\s+/)
        setAnswers({
          ...inferred,
          ...saved,
          first_name: saved.first_name || inferred.first_name || (parts.length > 1 ? parts[0] : ""),
          last_name: saved.last_name || inferred.last_name || (parts.length > 1 ? parts.slice(1).join(" ") : ""),
        })
        setReady(true)
      }
    })
    return () => { live = false }
  }, [userId, initialProfile, accountEmail])
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    frame.current?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) onClose()
      if (event.key === "Tab" && frame.current) {
        const items = Array.from(frame.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, summary, [tabindex="0"]'))
        const first = items[0]
        const last = items.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener("keydown", key)
    return () => { window.removeEventListener("keydown", key); previous?.focus() }
  }, [onClose, busy])
  const change = (key: string, next: string): void => { setAnswers((old) => ({ ...old, [key]: next })) }
  async function keep(): Promise<void> {
    if (!step || !userId || busy) return
    setBusy(true)
    setError("")
    try {
      const current = await loadAnswers()
      const next = { ...current, ...answers }
      if (at === 0 && JSON.stringify(draft.education) !== JSON.stringify(data.profile.education)) {
        for (const key of ["university", "degree", "field_of_study", "graduation_date", "study_status", "study_year"]) next[key] = ""
        Object.assign(next, educationFromProfile(draft))
      }
      await saveAnswers(userId, next)
      setAnswers(next)
      if (at === 0) data.setProfile({ ...data.profile, name: draft.name, headline: draft.headline, positions: draft.positions, education: draft.education, skills: draft.skills, firstName: answers.first_name ?? "", lastName: answers.last_name ?? "", phone: answers.phone ?? "", email: answers.email ?? "" })
      setAt((n) => n + 1)
      setup.reload()
    } catch {
      setError("Could not save your answer. Try again.")
    } finally {
      setBusy(false)
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-foreground/80 sm:items-center sm:p-6">
      <div
        ref={frame}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        className="flex h-dvh w-full max-w-2xl flex-col overflow-hidden border border-foreground/20 bg-background outline-none sm:h-[min(760px,90dvh)] sm:rounded-md"
      >
        <header className="flex shrink-0 items-center gap-4 border-b border-foreground/15 px-5 py-4 sm:px-8">
          <span className="font-heading text-xl font-bold tracking-tighter">odds<span className="text-foreground">.</span></span>
          <div className="h-px flex-1 bg-foreground/15" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-px bg-foreground transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
          <span className="font-heading text-xs font-semibold tabular-nums tracking-wide text-muted-foreground">
            {finished ? "Done" : `${at + 1} / ${steps.length}`}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground">
            <XIcon className="size-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-12 sm:py-10">
          <p className="font-heading mb-2 text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
            {finished ? "Your application profile" : `Step ${at + 1} of ${steps.length}`}
          </p>
          <h2 id="setup-title" className="font-heading max-w-lg text-3xl leading-[1.15] font-bold tracking-tight text-foreground sm:text-4xl">
            {finished ? "Your answers are ready" : step.title}
          </h2>

          <div className="mt-8 max-w-md">
            {!ready ? (
              <p role="status" className="text-sm text-muted-foreground">Loading your profile…</p>
            ) : finished ? (
              <div className="border border-foreground/15 px-5 py-6">
                <CheckIcon className="mb-3 size-7 text-foreground" />
                <p className="text-sm leading-relaxed font-medium text-foreground">
                  Experience, education and skills come from Profile. New questions appear only when a form needs them.
                </p>
              </div>
            ) : (
              <>
                {at === 0 ? (
                  <section aria-label="Your profile" className="mb-6 border border-foreground/15">
                    <div className="h-16 bg-foreground" />
                    <div className="px-5 pb-5">
                      <div className="-mt-8">
                        <PersonAvatar name={draft.name || "Your profile"} photo={draft.avatar || undefined} size="lg" />
                      </div>
                      <h3 className="font-heading mt-3 text-2xl font-bold tracking-tight">{draft.name || "Your profile"}</h3>
                      {draft.headline ? <p className="mt-1 text-base font-medium">{draft.headline}</p> : null}
                      {draft.place ? <p className="mt-1 text-sm text-muted-foreground">{draft.place}</p> : null}
                    </div>
                  </section>
                ) : null}
                {at === 0 ? <p className="mb-4 text-sm font-medium text-foreground">Check your given and family names before continuing.</p> : null}
                <div className="flex flex-col gap-5">
                  {step.keys.map((key) => {
                    const q = SETUP_QUESTIONS.find((q) => q.key === key)
                    const f = ANSWER_FIELDS.find((f) => f.key === key)
                    return (
                      <div key={key}>
                        <label htmlFor={`setup-${key}`} id={`label-${key}`} className="mb-2 block text-sm font-semibold tracking-tight">
                          {f?.label ?? q?.chip}
                        </label>
                        {q?.choices ? (
                          <div role="radiogroup" aria-labelledby={`label-${key}`} className="flex flex-col gap-2">
                            {q.choices.map((choice) => {
                              const on = answers[key] === choice.value
                              return (
                                <button
                                  key={choice.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  disabled={busy}
                                  onClick={() => change(key, choice.value)}
                                  className={`flex min-h-12 cursor-pointer items-center justify-between gap-2 border px-4 py-3 text-left text-sm font-medium ${
                                    on ? "border-foreground bg-foreground text-background" : "border-foreground/20 hover:border-foreground/50"
                                  }`}
                                >
                                  {choice.label}
                                  {on ? <CheckIcon className="size-4 shrink-0" /> : null}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <input
                            id={`setup-${key}`}
                            type={f?.type ?? "text"}
                            autoComplete={f?.autoComplete}
                            value={answers[key] ?? ""}
                            disabled={busy}
                            placeholder={q?.placeholder}
                            onChange={(e) => change(key, e.target.value)}
                            className="h-11 w-full rounded-md border border-foreground/20 bg-background px-3 text-sm focus:border-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
                {at === 0 ? (
                  <div className="mt-6">
                    <ProfileReview profile={draft} onChange={setDraft} />
                  </div>
                ) : null}
              </>
            )}
          </div>
          {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
        </div>

        <footer className="shrink-0 border-t border-foreground/15 bg-background px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-12">
          {finished ? (
            <Button
              type="button"
              onClick={() => { setup.reload(); onJobs() }}
              className="h-12 w-full rounded-md bg-foreground text-base font-semibold tracking-tight text-background hover:bg-foreground/90"
            >
              See jobs
            </Button>
          ) : (
            <>
              <Button
                type="button"
                disabled={!ready || busy}
                onClick={() => void keep()}
                className="h-12 w-full cursor-pointer rounded-md bg-foreground text-base font-semibold tracking-tight text-background hover:bg-foreground/90"
              >
                {busy ? "Saving…" : at === 0 ? "Confirm and Continue" : at === 3 ? "Finish setup" : "Save and Continue"}
              </Button>
              <div className="mt-2 flex items-center justify-between text-sm">
                <button
                  type="button"
                  disabled={at === 0 || busy}
                  onClick={() => { setError(""); setAt((n) => n - 1) }}
                  className="flex cursor-pointer items-center gap-1 py-2 font-medium text-foreground disabled:invisible"
                >
                  <ArrowLeftIcon className="size-4" /> Back
                </button>
                <span className="text-xs font-medium text-muted-foreground">Edit in Autofill</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setError(""); setAt((n) => n + 1) }}
                  className="cursor-pointer py-2 font-medium text-muted-foreground hover:text-foreground"
                >
                  Skip
                </button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
