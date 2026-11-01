import { useCallback, useEffect, useMemo, useState } from "react"
import { educationFromProfile, personalFromProfile } from "../../supabase/functions/_shared/application-personal"
import { ApplicationQuestions } from "@/components/ApplicationQuestions"
import { Buddy } from "@/components/Buddy"
import { Pill, WEB_INPUT, WebButton, WebCard } from "@/components/web/ui"
import { ANSWERS_SAVED, useSetup } from "@/lib/setup"
import { ANSWER_FIELDS, loadAnswers, saveAnswers, type AnswerField, type AnswerValues } from "@/lib/application-answers"
import { useData } from "@/lib/data"
import { useDocumentStore } from "@/lib/documents"
import { chromeStoreUrl, useExtensionPresent } from "@/lib/extension-connect"
import { supabase } from "@/lib/supabase"

/** The answers, in the groups forms ask them in. Every field odds can fill is in exactly one. */
const GROUPS: ReadonlyArray<{ title: string; hint: string; keys: ReadonlyArray<string> }> = [
  { title: "About you", hint: "Name, contact details, where you live", keys: ["first_name", "last_name", "email", "phone", "address", "city", "postcode", "country", "nationality"] },
  { title: "Work and study", hint: "The facts forms ask the most", keys: ["work_authorization", "university", "degree", "field_of_study", "graduation_date", "study_year", "study_status", "internship_agreement", "start_date", "hours_per_week", "expected_salary", "notice_period", "relocation", "onsite_ok"] },
  { title: "Links", hint: "", keys: ["linkedin", "website"] },
  { title: "Other questions", hint: "What some forms ask besides", keys: ["gender", "demographics", "prior_agreements", "insider", "role_values", "notes"] },
]

interface Learned {
  question_key: string
  question: string
  answer: string
  source: string | null
}

/**
 * Everything the Auto apply button fills in: the answers every form asks, written once (each with Edit, in place), the answers odds learned from forms
 * you went through, and on the right how far set-up is, the Chrome extension and the CV it uploads.
 */
export function Autofill({ onDocuments, onConnect }: { onDocuments: () => void; onJobs: () => void; onConnect: () => void }): React.JSX.Element {
  const data = useData()
  const userId = data.session?.user.id ?? null
  const setup = useSetup()
  const store = useDocumentStore()
  const extension = useExtensionPresent()
  const cv = store.docs.find((d) => d.kind === "cv" && d.isMain) ?? store.docs.find((d) => d.kind === "cv")
  const inferred = useMemo(() => ({ ...personalFromProfile(data.profile, data.session?.user.email), ...educationFromProfile(data.profile) }), [data.profile, data.session?.user.email])
  const [values, setValues] = useState<AnswerValues | null>(null)
  const reload = useCallback((): void => {
    if (userId) void loadAnswers().then(setValues)
  }, [userId])
  useEffect(() => {
    reload()
    window.addEventListener(ANSWERS_SAVED, reload)

    return () => window.removeEventListener(ANSWERS_SAVED, reload)
  }, [reload])

  const shown = (key: string): string => (values?.[key] ?? inferred[key] ?? "").trim()
  const filled = ANSWER_FIELDS.filter((f) => shown(f.key) !== "").length
  const total = ANSWER_FIELDS.length
  const steps = [
    { label: "Add your CV", done: setup.steps.find((s) => s.key === "cv")?.done ?? false },
    { label: "Check your answers", done: (setup.steps.find((s) => s.key === "details")?.done ?? false) && (setup.steps.find((s) => s.key === "answers")?.done ?? false) },
    { label: "Add the Chrome extension", done: extension === "yes" },
  ]

  async function put(key: string, value: string): Promise<void> {
    if (!userId) return
    const next = { ...(values ?? {}), [key]: value.trim() }
    await saveAnswers(userId, next)
    setValues(next)
  }

  return (
    <div className="flex w-full flex-col items-start gap-6 pb-10 xl:flex-row">
      <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
        {values === null ? <p className="text-sm text-muted-foreground" role="status">Loading your answers…</p> : null}
        {values !== null
          ? GROUPS.map((g) => (
              <WebCard key={g.title} aria-label={g.title} className="px-[22px] pt-[18px] pb-1.5">
                <div className="flex flex-col pb-3">
                  <h2 className="text-[1.0625rem] font-extrabold">{g.title}</h2>
                  {g.hint ? <span className="text-[0.8125rem] text-muted-foreground">{g.hint}</span> : null}
                </div>
                {g.keys.map((key) => {
                  const f = ANSWER_FIELDS.find((x) => x.key === key)

                  return f ? <AnswerRow key={key} field={f} value={shown(key)} saved={Boolean(values[key]?.trim())} onSave={(v) => put(key, v)} /> : null
                })}
              </WebCard>
            ))
          : null}
        {userId ? <Learn /> : null}
      </div>

      <div className="flex w-full shrink-0 flex-col gap-4 xl:w-[420px]">
        <WebCard className="flex flex-col items-center gap-3.5 text-center">
          <div className="relative grid size-[120px] place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#F0E9DF" strokeWidth="12" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="#EE7A2A" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(filled / total) * 264} 264`} />
            </svg>
            <Buddy size={64} />
          </div>
          <p className="text-xl font-extrabold">
            {filled} of {total} filled
          </p>
          <p className="-mt-1.5 text-[0.8125rem] text-muted-foreground">Answers Odds can fill on a form</p>
          <ul className="flex flex-col items-start gap-2.5">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2.5 text-sm font-bold">
                <span className={`grid size-6 place-items-center rounded-full text-xs font-extrabold ${s.done ? "bg-[#1F7A4D] text-white" : "border-2 border-[#D9D0C4]"}`}>{s.done ? "✓" : ""}</span>
                {s.label}
              </li>
            ))}
          </ul>
          {extension !== "yes" ? <ChromeButton onConnect={onConnect} /> : null}
        </WebCard>

        <WebCard id="autofill-chrome" className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.0625rem] font-extrabold">Chrome extension</h2>
            <Pill className={extension === "yes" ? "bg-good text-good-foreground" : "bg-secondary text-muted-foreground"}>{extension === "yes" ? "Connected" : extension === "looking" ? "Checking" : "Not connected"}</Pill>
          </div>
          {extension === "no" ? <p className="text-sm text-muted-foreground">Add odds to Chrome once, and forms fill themselves.</p> : null}
        </WebCard>

        <WebCard className="flex flex-col gap-3">
          <h2 className="text-[1.0625rem] font-extrabold">CV</h2>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-14 w-11 shrink-0 flex-col gap-1.5 rounded-lg border-[1.5px] border-line bg-card p-2">
              <span className="block h-[7px] w-[55%] rounded-sm bg-foreground" />
              {[100, 82, 64, 100].map((w, i) => (
                <span key={i} className="block h-1 rounded-sm bg-[#D9D0C4]" style={{ width: `${w}%` }} />
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-extrabold">{cv ? cv.fileName || cv.name : "No CV yet"}</span>
            <WebButton onClick={onDocuments}>{cv ? "Change" : "Add CV"}</WebButton>
          </div>
        </WebCard>
      </div>
    </div>
  )
}

function ChromeButton({ onConnect }: { onConnect: () => void }): React.JSX.Element {
  const store = chromeStoreUrl()

  return store ? (
    <a href={store} target="_blank" rel="noreferrer" className="inline-flex h-[42px] items-center justify-center rounded-xl bg-brand px-[18px] text-sm font-extrabold hover:bg-[#E56E1E]">
      Add to Chrome
    </a>
  ) : (
    <WebButton tone="primary" onClick={onConnect}>
      Add to Chrome
    </WebButton>
  )
}

/** One answer: its name, its value, where it came from, and Edit, which turns the value into a box with Save and Cancel. */
function AnswerRow({ field, value, saved, onSave }: { field: AnswerField; value: string; saved: boolean; onSave: (value: string) => Promise<void> }): React.JSX.Element {
  const [editing, setEditing] = useState<boolean>(false)
  const [draft, setDraft] = useState<string>(value)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState<boolean>(false)

  function save(): void {
    setBusy(true)
    setProblem(null)
    onSave(draft).then(() => setEditing(false), (e: unknown) => setProblem(e instanceof Error ? e.message : "Could not save.")).finally(() => setBusy(false))
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t-[1.5px] border-line/60 py-3.5">
      <span className="w-full text-sm text-muted-foreground sm:w-[190px]">{field.label}</span>
      {editing ? (
        <>
          {field.long ? (
            <textarea autoFocus aria-label={field.label} value={draft} maxLength={600} onChange={(e) => setDraft(e.target.value)} className="min-h-20 min-w-0 flex-1 rounded-[10px] border-2 border-brand bg-card p-3 text-[0.95rem] font-bold focus:outline-none" />
          ) : (
            <input autoFocus aria-label={field.label} type={field.type ?? "text"} value={draft} maxLength={200} placeholder={field.placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }} className={`${WEB_INPUT} min-w-0 flex-1 border-2 border-brand font-bold`} />
          )}
          <WebButton tone="primary" disabled={busy} onClick={save}>
            Save
          </WebButton>
          <WebButton onClick={() => { setDraft(value); setEditing(false); setProblem(null) }}>Cancel</WebButton>
          {problem ? <p role="alert" className="w-full text-sm text-destructive">{problem}</p> : null}
        </>
      ) : (
        <>
          <span className={`min-w-0 flex-1 text-[0.95rem] break-words ${value ? "font-bold" : "text-muted-foreground"}`}>{value || "Not filled yet"}</span>
          {saved ? <Pill className="bg-good text-good-foreground">Saved ✓</Pill> : value ? <Pill className="bg-secondary text-muted-foreground">From your profile</Pill> : null}
          <button type="button" aria-label={`Edit ${field.label}`} onClick={() => { setDraft(value); setEditing(true) }} className="cursor-pointer text-[0.8125rem] font-extrabold text-[#B4561A] hover:underline">
            Edit
          </button>
        </>
      )}
    </div>
  )
}

/** What odds learned from forms: each question with the answer used. "Add to Autofill" makes it yours, and from then on it is filled word for word. */
function Learn(): React.JSX.Element {
  const user = useData().session?.user.id
  const [rows, setRows] = useState<Learned[]>([])
  const [note, setNote] = useState<string>("")
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<string>("")

  useEffect(() => {
    if (!user) return
    let live = true
    const refresh = (): void => {
      if (document.hidden) return
      void supabase.from("application_questions").select("question_key,question,answer,source").order("updated_at", { ascending: false }).limit(100).then(({ data, error }) => {
        if (live && !error) setRows((data as Learned[] | null) ?? [])
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 10000)

    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [user])

  async function update(keys: string[], answer?: string): Promise<void> {
    if (!user) return
    setNote("")
    for (const key of keys) {
      const row = rows.find((r) => r.question_key === key)
      const text = (answer ?? row?.answer ?? "").trim()
      const { error } = await supabase.from("application_questions").update({ answer: text, source: "person", updated_at: new Date().toISOString() }).eq("user_id", user).eq("question_key", key)
      if (error) {
        setNote("Could not save. Try again.")

        return
      }
      setRows((current) => current.map((r) => (r.question_key === key ? { ...r, answer: text, source: "person" } : r)))
    }
  }
  async function forget(key: string): Promise<void> {
    if (!user) return
    const { error } = await supabase.from("application_questions").delete().eq("user_id", user).eq("question_key", key)
    if (error) setNote("Could not delete. Try again.")
    else setRows((current) => current.filter((r) => r.question_key !== key))
  }

  const waiting = rows.filter((r) => r.source === "odds")

  return (
    <WebCard aria-label="Learned from forms" className="px-[22px] pt-[18px] pb-2">
      <ApplicationQuestions />
      <div className="flex items-center justify-between gap-3 pb-3">
        <div className="flex flex-col">
          <h2 className="text-[1.0625rem] font-extrabold">Learned from forms</h2>
          <span className="text-[0.8125rem] text-muted-foreground">Answers Odds saw while you applied</span>
        </div>
        {waiting.length > 1 ? (
          <WebButton tone="primary" onClick={() => void update(waiting.map((r) => r.question_key))}>
            Add all to Autofill
          </WebButton>
        ) : null}
      </div>
      {rows.length === 0 ? <p className="border-t-[1.5px] border-line/60 py-4 text-sm text-muted-foreground">Nothing yet. When a form asks something new, the question and your answer land here.</p> : null}
      {rows.map((r) => (
        <div key={r.question_key} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t-[1.5px] border-line/60 py-3.5">
          {editing === r.question_key ? (
            <>
              <label className="flex min-w-0 flex-1 basis-full flex-col gap-1.5 text-[0.8125rem] text-muted-foreground">
                {r.question}
                <textarea autoFocus value={draft} maxLength={1000} onChange={(e) => setDraft(e.target.value)} className="min-h-16 w-full rounded-[10px] border-2 border-brand bg-card p-3 text-[0.95rem] font-bold text-foreground focus:outline-none" />
              </label>
              <WebButton tone="primary" onClick={() => void update([r.question_key], draft).then(() => setEditing(null))}>
                Save
              </WebButton>
              <WebButton onClick={() => setEditing(null)}>Cancel</WebButton>
            </>
          ) : (
            <>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[0.8125rem] text-muted-foreground">{r.question}</span>
                <span className="text-[0.95rem] font-bold break-words">{r.answer || "No answer yet"}</span>
              </div>
              {r.source === "odds" ? (
                <WebButton tone="primary" onClick={() => void update([r.question_key])}>
                  Add to Autofill
                </WebButton>
              ) : (
                <Pill className="bg-good text-good-foreground">In Autofill ✓</Pill>
              )}
              <button type="button" aria-label={`Edit the answer to ${r.question}`} onClick={() => { setDraft(r.answer); setEditing(r.question_key) }} className="cursor-pointer text-[0.8125rem] font-extrabold text-[#B4561A] hover:underline">
                Edit
              </button>
              <button type="button" aria-label={`Forget the answer to ${r.question}`} onClick={() => void forget(r.question_key)} className="cursor-pointer text-[0.8125rem] font-bold text-muted-foreground hover:underline">
                Forget
              </button>
            </>
          )}
        </div>
      ))}
      {note ? <p role="status" className="pb-3 text-sm text-muted-foreground">{note}</p> : null}
    </WebCard>
  )
}
