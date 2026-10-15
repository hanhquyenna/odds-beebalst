import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { continueApplication } from "@/lib/application-runs"
import { loadAnswers } from "@/lib/application-answers"
import { useData } from "@/lib/data"
import { supabase } from "@/lib/supabase"
import { agentCanAnswer, isTrapQuestion, resolveAgentAnswer, type Facts } from "../../supabase/functions/_shared/apply-form"

interface Question { key: string; label: string; kind: string; options?: string[] }
interface Prompt { posting_id: string; questions: Question[]; updated_at: string }

/**
 * The questions an application stopped at, answered here and filled in by the desktop, which then goes on. A choice is tapped, a typed answer is typed.
 * `inline` is for inside the apply card (no frame of its own); `aside` is the second button beside "Save and continue", the way back to the desktop.
 */
export function ApplicationQuestions({ postingId, inline = false, aside, empty, onHasQuestions }: { postingId?: string; inline?: boolean; aside?: React.ReactNode; /** What to show while there is nothing to answer. */ empty?: React.ReactNode; /** Whether any question is still shown (false once agents cleared them). */ onHasQuestions?: (open: boolean) => void }): React.JSX.Element | null {
  const data = useData()
  const user = data.session?.user.id
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [facts, setFacts] = useState<Facts | null>(null)
  useEffect(() => {
    if (!user) return
    let live = true
    const post = postingId ? data.byId.get(postingId) : undefined
    void loadAnswers().then((values) => {
      if (!live) return
      const profile = data.profile
      setFacts({
        name: profile.name || null,
        email: values.email || profile.email || null,
        phone: values.phone || profile.phone || null,
        place: [values.city, values.country].filter(Boolean).join(", ") || profile.place || null,
        linkedin: values.linkedin || null,
        adult: true,
        // Odds only lists employers the person is applying to from outside; never treat them as a current employee.
        never_worked_here: true,
        answers: {
          ...values,
          // Autofill defaults: empty means the safe "No", not "ask every form again".
          insider: values.insider?.trim() || "No",
          prior_agreements: values.prior_agreements?.trim() || "No",
          // Posted pay when the person has not set an expected salary yet.
          expected_salary: values.expected_salary?.trim() || post?.pay_posted?.trim() || "",
        },
      })
    })
    return () => { live = false }
  }, [user, data.profile, data.byId, postingId])
  useEffect(() => {
    if (!user) return
    let live = true
    const refresh = (): void => {
      if (document.hidden) return
      let query = supabase.from("application_prompts").select("posting_id,questions,updated_at").order("updated_at", { ascending: false }).limit(30)
      if (postingId) query = query.eq("posting_id", postingId)
      void query.then(({ data: rows, error: problem }) => {
        if (!live || problem) return
        setPrompts((rows as Prompt[] ?? []).filter(p => p.questions.length && Date.parse(p.updated_at) > Date.now() - 30 * 60_000))
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 3000)
    document.addEventListener("visibilitychange", refresh)
    return () => { live = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [user, postingId])
  // Auto-resolve prompts Odds already knows (country code, Pays, Prefer not to answer, visa, 18+) so they never sit empty in French.
  useEffect(() => {
    if (!facts || !prompts.length) return
    for (const prompt of prompts) {
      const auto: Record<string, string> = {}
      let any = false
      for (const q of prompt.questions) {
        if (!agentCanAnswer(q.label, facts, q.options)) continue
        const value = resolveAgentAnswer(q.label, facts, q.options)
        if (!value) continue
        auto[q.key] = value
        any = true
      }
      if (!any) continue
      const rest = prompt.questions.filter(q => !auto[q.key])
      void Promise.resolve(supabase.rpc("answer_application_questions", { p_posting_id: prompt.posting_id, p_answers: auto })).then(({ error: problem }) => {
        if (problem) return
        setPrompts(previous => previous.map(p => p.posting_id === prompt.posting_id ? { ...p, questions: rest } : p).filter(p => p.questions.length))
        // Nothing left for the person: hand answers back to the desktop fill (card returns to Filling).
        if (!rest.length) void continueApplication(prompt.posting_id).catch(() => undefined)
      })
    }
  }, [facts, prompts])
  const visible = prompts.map(prompt => ({
    ...prompt,
    questions: (facts ? prompt.questions.filter(q => !agentCanAnswer(q.label, facts, q.options)) : prompt.questions)
      .filter(q => !isTrapQuestion(q.label))
      // Never show a blank “Needs your answer” row (placeholder-as-label handoff bug).
      .filter(q => (q.label || "").trim().length >= 8 && !/^(type your (response|answer)|enter (your )?(answer|response)|your answer)\b/i.test(q.label.trim()))
      .map(q => ({ ...q, label: q.label.trim() })),
  })).filter(p => p.questions.length)
  useEffect(() => { onHasQuestions?.(Boolean(user && visible.length)) }, [user, visible.length, onHasQuestions])
  if (!user || !visible.length) return empty === undefined ? null : <>{empty}</>

  const forms = visible.map(prompt => <form key={prompt.posting_id} className="apply-drop grid gap-4" onSubmit={event => {
    event.preventDefault(); setSaving(true); setError(""); setSaved(false)
    const values = Object.fromEntries(prompt.questions.map(q => [q.key, answers[`${prompt.posting_id}:${q.key}`]?.trim() || ""]))
    void Promise.resolve(supabase.rpc("answer_application_questions", { p_posting_id: prompt.posting_id, p_answers: values })).then(({ error: problem }) => {
      if (problem) setError("Could not save. The form may have changed; check the questions and try again.")
      else setSaved(true)
    }).finally(() => setSaving(false))
  }}>
    {prompt.questions.map(q => {
      const key = `${prompt.posting_id}:${q.key}`
      const value = answers[key] || ""
      const change = (next: string): void => { setAnswers(previous => ({ ...previous, [key]: next })); setSaved(false) }
      const choices = q.kind === "radio" || q.kind === "select" ? q.options ?? [] : []

      return <div key={q.key} role={choices.length && choices.length <= 7 ? "radiogroup" : undefined} aria-label={q.label} className="grid gap-2">
        <p className="text-base font-semibold leading-snug">{q.label}</p>
        {choices.length > 7 ? <select required aria-label={q.label} value={value} onChange={e => change(e.target.value)} className="h-11 w-full cursor-pointer rounded-xl border-[1.5px] bg-background px-4 text-base focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/40"><option value="">Choose</option>{choices.map(option => <option key={option} value={option}>{option}</option>)}</select> : choices.length ? choices.map(option => <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => change(option)} className={`flex min-h-11 cursor-pointer items-center justify-between rounded-xl border-[1.5px] px-4 text-left text-[0.95rem] font-medium transition-colors duration-150 ${value === option ? "border-brand bg-accent" : "hover:bg-secondary"}`}>
          {option}
          <span className={`size-5 shrink-0 rounded-full border-[1.5px] ${value === option ? "border-brand bg-brand ring-[3px] ring-inset ring-accent" : ""}`} />
        </button>) : q.kind === "textarea"
          ? <textarea required aria-label={q.label} value={value} onChange={e => change(e.target.value)} rows={3} className="w-full rounded-xl border-[1.5px] bg-background px-4 py-3 text-base focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/40" />
          : <input required aria-label={q.label} type={q.kind === "number" ? "number" : "text"} value={value} onChange={e => change(e.target.value)} className="h-11 w-full rounded-xl border-[1.5px] bg-background px-4 text-base focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/40" />}
      </div>
    })}
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button type="submit" disabled={saving || prompt.questions.some(q => !(answers[`${prompt.posting_id}:${q.key}`] || "").trim())} className="h-11 flex-1 cursor-pointer rounded-lg text-base">{saving ? "Saving…" : saved ? "Saved" : "Save and continue"}</Button>
      {aside}
    </div>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </form>)

  return inline ? <div className="grid gap-4">{forms}</div> : <section aria-label="Application questions" className="grid gap-4 rounded-xl border-[1.5px] bg-card p-4 sm:p-5">{forms}</section>
}
