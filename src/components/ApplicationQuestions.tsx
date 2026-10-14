import { useEffect, useState } from "react"
import { useData } from "@/lib/data"
import { supabase } from "@/lib/supabase"

interface Question { key: string; label: string; kind: string; options?: string[] }
interface Prompt { posting_id: string; questions: Question[]; updated_at: string }

/** The same private questions can be answered in a job panel or later from Profile. */
export function ApplicationQuestions({ postingId }: { postingId?: string }): React.JSX.Element | null {
  const user = useData().session?.user.id
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    if (!user) return
    let live = true
    const refresh = (): void => {
      if (document.hidden) return
      let query = supabase.from("application_prompts").select("posting_id,questions,updated_at").order("updated_at", { ascending: false }).limit(30)
      if (postingId) query = query.eq("posting_id", postingId)
      void query.then(({ data, error: problem }) => {
        if (!live || problem) return
        setPrompts((data as Prompt[] ?? []).filter(p => p.questions.length && Date.parse(p.updated_at) > Date.now() - 30 * 60_000))
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 3000)
    document.addEventListener("visibilitychange", refresh)
    return () => { live = false; clearInterval(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [user, postingId])
  if (!user || !prompts.length) return null
  return <section aria-label="Application questions" className="grid gap-3 rounded-xl border border-brand/25 bg-brand/5 p-3">
    <div><h3 className="text-sm font-semibold">A few answers to continue</h3><p className="mt-1 text-xs text-muted-foreground">Save your answers here. Odds fills them on your desktop and continues. Questions about visa, study or dates are kept for this job.</p></div>
    {prompts.map(prompt => <form key={prompt.posting_id} className="grid gap-3" onSubmit={event => {
      event.preventDefault(); setSaving(true); setError(""); setNote("")
      const values = Object.fromEntries(prompt.questions.map(q => [q.key, answers[`${prompt.posting_id}:${q.key}`]?.trim() || ""]))
      void Promise.resolve(supabase.rpc("answer_application_questions", { p_posting_id: prompt.posting_id, p_answers: values })).then(({ error: problem }) => {
        if (problem) setError("Could not save. The form may have changed; check the questions and try again.")
        else setNote("Answers saved. Your desktop will continue when it receives them.")
      }).finally(() => setSaving(false))
    }}>
      {prompt.questions.map(q => {
        const key = `${prompt.posting_id}:${q.key}`
        const change = (value: string): void => { setAnswers(previous => ({ ...previous, [key]: value })); setNote("") }
        const className = "mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
        return <label key={q.key} className="text-sm font-medium">{q.label}
          {q.kind === "radio" || q.kind === "select" ? <select required value={answers[key] || ""} onChange={e => change(e.target.value)} className={className}><option value="">Choose an answer</option>{q.options?.map(option => <option key={option} value={option}>{option}</option>)}</select> : q.kind === "textarea" ? <textarea required maxLength={1000} value={answers[key] || ""} onChange={e => change(e.target.value)} className={className} /> : <input required type={q.kind === "number" ? "number" : "text"} step="any" maxLength={1000} value={answers[key] || ""} onChange={e => change(e.target.value)} className={className} />}
        </label>
      })}
      <button type="submit" disabled={saving} className="min-h-10 cursor-pointer rounded-lg bg-brand-ink px-3 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saving…" : "Save and continue"}</button>
    </form>)}
    {note ? <p role="status" className="text-xs text-muted-foreground">{note}</p> : null}
    {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
  </section>
}
