import { useEffect, useRef, useState } from "react"
import { personalFromProfile } from "../../supabase/functions/_shared/application-personal"
import { useData } from "@/lib/data"
import { ANSWER_FIELDS, loadAnswers, saveAnswers, type AnswerValues } from "@/lib/application-answers"

const field = "h-10 w-full rounded-lg border-[1.5px] bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/40"
const label = "flex flex-col gap-1 text-[0.8125rem] font-medium text-muted-foreground"

/** The answers application forms ask again and again, written once. Saved when you leave a box; Claude reads them from here. */
export function ApplicationAnswers(): React.JSX.Element | null {
  const data = useData()
  const userId = data.session?.user.id ?? null
  const inferred = personalFromProfile(data.profile, data.session?.user.email)
  const [values, setValues] = useState<AnswerValues | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const latest = useRef<AnswerValues>({})
  const saves = useRef<Promise<void>>(Promise.resolve())
  const revision = useRef(0)

  useEffect(() => {
    if (!userId) return
    let live = true
    void loadAnswers().then((v) => {
      if (!live) return
      latest.current = v
      setValues(v)
    })

    return () => {
      live = false
    }
  }, [userId])

  if (!userId || values === null) return null

  function change(key: string, value: string): void {
    latest.current = { ...latest.current, [key]: value }
    setValues(latest.current)
    setNote(null)
  }
  function save(): void {
    if (!userId) return
    const current = ++revision.current
    const snapshot = { ...latest.current }
    setNote("Saving…")
    // Leaving several fields quickly must not let an older response overwrite the latest details.
    saves.current = saves.current.catch(() => undefined).then(() => saveAnswers(userId, snapshot))
    void saves.current.then(
      () => { if (current === revision.current) setNote("Saved") },
      (e: unknown) => { if (current === revision.current) setNote(e instanceof Error ? e.message : "Could not save.") },
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <p className="text-sm text-muted-foreground sm:col-span-2">Details from your profile and CV appear here automatically and are used to fill applications. Edit any field to override it. Confirm your given and family names separately; Odds does not guess their order.</p>
      {ANSWER_FIELDS.map((f) => (
        <label key={f.key} className={`${label} ${f.long ? "sm:col-span-2" : ""}`}>
          {f.label}
          {f.long ? (
            <textarea value={values[f.key] ?? inferred[f.key] ?? ""} onChange={(e) => change(f.key, e.target.value)} onBlur={save} maxLength={600} className="min-h-20 w-full rounded-lg border-[1.5px] bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/40" />
          ) : (
            <input type={f.type ?? "text"} autoComplete={f.autoComplete} value={values[f.key] ?? inferred[f.key] ?? ""} onChange={(e) => change(f.key, e.target.value)} onBlur={save} maxLength={200} placeholder={f.placeholder} className={field} />
          )}
        </label>
      ))}
      {note ? (
        <p role="status" className="text-sm text-muted-foreground sm:col-span-2">
          {note}
        </p>
      ) : null}
    </div>
  )
}
