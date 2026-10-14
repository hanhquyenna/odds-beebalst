import { useEffect, useState } from "react"
import { useData } from "@/lib/data"
import { supabase } from "@/lib/supabase"

interface SavedAnswer { question_key: string; question: string; answer: string }
export function SavedApplicationQuestions(): React.JSX.Element | null {
  const user = useData().session?.user.id
  const [rows, setRows] = useState<SavedAnswer[]>([])
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!user) return
    let live = true
    const refresh = (): void => {
      if (document.hidden) return
      void supabase.from("application_questions").select("question_key,question,answer").order("updated_at", { ascending: false }).limit(100).then(({ data, error }) => { if (live && !error) setRows(data as SavedAnswer[] ?? []) })
    }
    refresh()
    const timer = window.setInterval(refresh, 10000)
    return () => { live = false; clearInterval(timer) }
  }, [user])
  if (!user) return null
  return <div className="mt-3 grid gap-3">
    <p className="text-sm text-muted-foreground">Answers you confirm while applying are remembered here. Edit them when your circumstances change.</p>
    {!rows.length ? <p className="text-sm text-muted-foreground">No remembered answers yet.</p> : rows.map(row => <form key={row.question_key} className="grid gap-2 rounded-lg border p-3" onSubmit={event => {
      event.preventDefault(); setBusy(true); setNote("")
      const value = new FormData(event.currentTarget).get("answer")
      const answer = typeof value === "string" ? value.trim() : ""
      void Promise.resolve(supabase.from("application_questions").update({ answer, updated_at: new Date().toISOString() }).eq("user_id", user).eq("question_key", row.question_key)).then(({ error }) => {
        setNote(error ? "Could not save. Try again." : "Answer saved.")
        if (!error) setRows(current => current.map(r => r.question_key === row.question_key ? { ...r, answer } : r))
      }).finally(() => setBusy(false))
    }}>
      <label className="text-sm font-medium">{row.question}<textarea name="answer" required maxLength={1000} defaultValue={row.answer} className="mt-1 min-h-16 w-full rounded-lg border bg-background p-2 text-sm" /></label>
      {row.question_key.includes(" job ") ? <p className="text-xs text-muted-foreground">Confirmed for one job. Odds asks again for a different job.</p> : null}
      <div className="flex gap-4"><button type="submit" disabled={busy} className="cursor-pointer text-sm font-medium text-brand-ink">Save answer</button><button type="button" disabled={busy} className="cursor-pointer text-sm text-muted-foreground underline" onClick={() => {
        setBusy(true)
        void Promise.resolve(supabase.from("application_questions").delete().eq("user_id", user).eq("question_key", row.question_key)).then(({ error }) => {
          setNote(error ? "Could not delete. Try again." : "Answer deleted.")
          if (!error) setRows(current => current.filter(r => r.question_key !== row.question_key))
        }).finally(() => setBusy(false))
      }}>Forget answer</button></div>
    </form>)}
    {note ? <p role="status" className="text-xs text-muted-foreground">{note}</p> : null}
  </div>
}
