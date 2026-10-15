import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { supabase } from "@/lib/supabase"

interface Question { key: string; label: string; kind: string; options?: string[] }
interface Prompt { posting_id: string; questions: Question[]; updated_at: string }

/**
 * The questions an application stopped at, answered here and filled in by the desktop, which then goes on. A choice is tapped, a typed answer is typed.
 * `inline` is for inside the apply card (no frame of its own); `aside` is the second button beside "Save and continue", the way back to the desktop.
 */
export function ApplicationQuestions({ postingId, inline = false, aside, empty }: { postingId?: string; inline?: boolean; aside?: React.ReactNode; /** What to show while there is nothing to answer. */ empty?: React.ReactNode }): React.JSX.Element | null {
  const user = useData().session?.user.id
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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
  if (!user || !prompts.length) return empty === undefined ? null : <>{empty}</>

  const forms = prompts.map(prompt => <form key={prompt.posting_id} className="apply-drop grid gap-4" onSubmit={event => {
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
