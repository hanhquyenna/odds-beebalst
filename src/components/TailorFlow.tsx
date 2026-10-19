import { useMemo, useState } from "react"
import { useData } from "@/lib/data"
import { NO_WHAT_IF, standing } from "@/lib/engine"
import { attachedTo, mainCv, nameForJob, problemText, type DocKind } from "@/lib/document-model"
import { useDocumentStore } from "@/lib/documents"
import { assertHonest, factsFor, replaceLine, requestDraft, savePdf, TailorError, wantedFor, type Change, type CvDraft, type LetterDraft } from "@/lib/tailor-client"
import { useAddDocument, useJobProfile, useJobStrength } from "@/lib/use-documents"
import type { Posting } from "@/lib/types"
import type { Cv } from "../../supabase/functions/_shared/cv-template"

type Phase = { at: "idle" } | { at: "working" } | { at: "review"; draft: CvDraft | LetterDraft } | { at: "saved"; name: string; draft: CvDraft | LetterDraft } | { at: "problem"; text: string }

const STAR = "M12 2l1.8 5.4L19 9l-5.2 1.6L12 16l-1.8-5.4L5 9l5.2-1.6zM19 14l.9 2.6L22 17l-2.1.4L19 20l-.9-2.6L16 17l2.1-.4z"
const WHAT: Record<DocKind, string> = { cv: "CV", cover_letter: "cover letter" }
const TIER_WORD: Record<string, string> = { must: "must have", strong: "strong plus", optional: "preferred", nice: "nice to have" }

/**
 * "Tailor my CV with AI" / "Tailor my cover letter with AI", on the job page and in the panel. Odds rewrites a copy for this job, using only what is
 * true of the person, shows what changed, and saves it as a new document on this job once they accept. The main CV is never changed.
 * `solid` is the orange button (the CV); `compact` is the panel's narrow layout.
 */
export function TailorFlow({ post, kind, solid = false, compact = false }: { post: Posting; kind: DocKind; solid?: boolean; compact?: boolean }): React.JSX.Element | null {
  const data = useData()
  const store = useDocumentStore()
  const add = useAddDocument()
  const profile = useJobProfile(post.id)
  const strength = useJobStrength(post)
  const referral = data.referrals.has(post.id)
  const st = useMemo(() => (data.reference && data.shares ? standing(post, profile, data.reference, data.shares, NO_WHAT_IF, referral, strength) : null), [post, profile, data.reference, data.shares, referral, strength])
  const [phase, setPhase] = useState<Phase>({ at: "idle" })
  const [cv, setCv] = useState<Cv | null>(null)
  const [letter, setLetter] = useState("")
  // What each changed line says now, after the person's edits (the key is the line as Odds wrote it).
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [saveProblem, setSaveProblem] = useState<string | null>(null)
  const base = attachedTo(store, post.id, "cv") ?? mainCv(store)
  const previous = kind === "cover_letter" ? attachedTo(store, post.id, "cover_letter") : undefined

  async function start(): Promise<void> {
    if (!data.session) {
      setPhase({ at: "problem", text: "Sign in to tailor your documents." })

      return
    }
    if (!st || st.needsProfile) {
      setPhase({ at: "problem", text: "Add your CV first: Odds needs it to know what is true about you." })

      return
    }
    if (!base) {
      setPhase({ at: "problem", text: "Add your CV first: Odds needs it to know what is true about you." })

      return
    }
    setPhase({ at: "working" })
    setTexts({})
    const wanted = wantedFor(post, st)
    try {
      const draft = await requestDraft({ kind, job: { title: post.title_clean || post.title, employer: post.employer_display || post.employer }, document_id: base.id, letter_id: previous?.id, wanted, facts: factsFor(profile) })
      assertHonest(draft, wanted)
      if (draft.kind === "cv") setCv(draft.result.cv)
      else setLetter(draft.result.letter)
      setPhase({ at: "review", draft })
    } catch (err) {
      setPhase({ at: "problem", text: err instanceof TailorError ? err.message : "That did not work. Try again." })
    }
  }

  async function save(draft: CvDraft | LetterDraft): Promise<void> {
    setPhase({ at: "working" })
    setSaveProblem(null)
    try {
      const name = nameForJob(kind, post)
      const file = await savePdf(kind, kind === "cv" ? cv! : letter, name, data.profile.name)
      const done = await add(file, kind, name, post.id)
      setPhase({ at: "saved", name: done.added.doc.name, draft })
    } catch (err) {
      setSaveProblem(err instanceof TailorError ? err.message : problemText(err))
      setPhase({ at: "review", draft })
    }
  }

  if (phase.at === "review") {
    const { draft } = phase

    return (
      <div className="flex flex-col gap-3 rounded-xl border-[1.5px] border-brand bg-card p-3.5" aria-label={`Your tailored ${WHAT[kind]}`}>
        <Summary draft={draft} />
        <Missing draft={draft} />
        {draft.kind === "cv" ? (
          <Lines changes={draft.result.changes} compact={compact} texts={texts} setTexts={setTexts} edit={(from, to) => setCv((c) => (c ? replaceLine(c, from, to) : c))} />
        ) : (
          <label className="flex flex-col gap-1.5 text-xs font-bold text-muted-foreground">
            Your letter. Change anything before you save it.
            <textarea value={letter} onChange={(e) => setLetter(e.target.value)} rows={compact ? 12 : 14} className="rounded-lg border-[1.5px] border-line bg-background p-2.5 text-sm font-normal text-foreground" />
          </label>
        )}
        {draft.kind === "cover_letter" ? <Lines changes={draft.result.changes} compact={compact} texts={texts} setTexts={setTexts} /> : null}
        <p className="text-xs text-muted-foreground">Saved as a new document on this job. Your main CV stays as it is.</p>
        {saveProblem ? <p role="alert" className="text-sm text-destructive">{saveProblem}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={() => void save(draft)} className="h-11 flex-1 cursor-pointer rounded-xl bg-brand text-sm font-extrabold hover:brightness-105">Save to this job</button>
          <button type="button" onClick={() => setPhase({ at: "idle" })} className="h-11 cursor-pointer rounded-xl border-[1.5px] border-line bg-card px-4 text-sm font-bold hover:bg-accent">Discard</button>
        </div>
      </div>
    )
  }
  if (phase.at === "saved") {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-good/60 p-3.5 text-sm" role="status">
        <p className="font-bold">Saved to this job: {phase.name}</p>
        <Summary draft={phase.draft} />
        <button type="button" onClick={() => setPhase({ at: "idle" })} className="h-9 cursor-pointer self-start rounded-lg border-[1.5px] border-line bg-card px-3 text-sm font-bold hover:bg-accent">Tailor again</button>
      </div>
    )
  }

  const label = `Tailor my ${WHAT[kind]} with AI`
  const button = (
    <button
      type="button"
      disabled={phase.at === "working"}
      onClick={() => { void start() }}
      className={`flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-[1.5px] border-brand font-bold transition disabled:cursor-wait disabled:opacity-70 ${solid ? "bg-brand hover:brightness-105" : "bg-card hover:bg-brand/10"}`}
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true"><path d={STAR} /></svg>
      {phase.at === "working" ? `Writing your ${WHAT[kind]}…` : label}
    </button>
  )


  return (
    <div className="flex flex-col gap-2">
      {button}
      {phase.at === "working" ? <p className="text-xs text-muted-foreground" role="status">Reading the posting and your {kind === "cv" ? "CV" : "CV and letter"}. This takes about half a minute.</p> : null}
      {phase.at === "problem" ? <p role="alert" className="text-sm text-destructive">{phase.text}</p> : null}
    </div>
  )
}

function Summary({ draft }: { draft: CvDraft | LetterDraft }): React.JSX.Element {
  const changes = draft.result.changes
  const n = (k: Change["kind"]): number => changes.filter((c) => c.kind === k).length
  const keywords = draft.result.added_keywords

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-bold">{n("added")} added · {n("reworded")} reworded · {n("unchanged")} unchanged{draft.kind === "cv" && draft.result.counts.left_out > 0 ? ` · ${draft.result.counts.left_out} left out to fit one page` : ""}</p>
      {keywords.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Now on your document">
          {keywords.map((k) => <li key={k} className="inline-flex h-7 items-center rounded-full bg-[#1F7A4D] px-3 text-xs font-extrabold text-white">✓ {k}</li>)}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No new keyword to add: the ones this job insists on and you can back are already there.</p>
      )}
    </div>
  )
}

function Missing({ draft }: { draft: CvDraft | LetterDraft }): React.JSX.Element | null {
  const missing = draft.result.missing
  if (missing.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-accent p-3">
      <h3 className="text-[0.7rem] font-extrabold tracking-[0.08em] text-[#8A3F10] uppercase">Not on your CV: add it only if it is true</h3>
      <ul className="flex flex-wrap gap-1.5">
        {missing.map((m) => <li key={m.name} className="inline-flex h-7 items-center rounded-full border-[1.5px] border-dashed border-brand bg-card px-3 text-xs font-extrabold text-[#8A3F10]">+ {m.label}<span className="ml-1 font-semibold opacity-70">({TIER_WORD[m.tier] ?? m.tier})</span></li>)}
      </ul>
      <p className="text-xs text-muted-foreground">Odds did not write these in. If one is true for you, add it to your CV yourself.</p>
    </div>
  )
}

/** What changed, line by line: the old line crossed out, the new one under it. Reworded and added lines can be edited before saving (CV only). */
function Lines({ changes, edit, texts, setTexts, compact }: { changes: Change[]; edit?: (from: string, to: string) => void; texts: Record<string, string>; setTexts: (next: (t: Record<string, string>) => Record<string, string>) => void; compact: boolean }): React.JSX.Element | null {
  const [open, setOpen] = useState<string | null>(null)
  const shown = changes.filter((c) => c.kind !== "unchanged" && c.part !== "Skills")
  if (shown.length === 0) return null

  return (
    <ul className={`flex flex-col gap-2 ${compact ? "" : "max-h-96 overflow-y-auto"}`} aria-label="What changed">
      {shown.map((c, i) => {
        const now = texts[c.after] ?? c.after

        return (
          <li key={`${i}-${c.after.slice(0, 20)}`} className="flex flex-col gap-1 rounded-lg border-[1.5px] border-line p-2.5 text-sm">
            <span className="flex items-center gap-2 text-[0.7rem] font-extrabold tracking-wide text-muted-foreground uppercase">
              <span className={c.kind === "added" ? "text-[#1F7A4D]" : "text-[#8A3F10]"}>{c.kind === "added" ? "Added" : "Reworded"}</span>
              {c.part}
            </span>
            {c.before ? <span className="text-xs text-muted-foreground line-through">{c.before}</span> : null}
            {edit && open === c.after ? (
              <textarea autoFocus defaultValue={now} rows={3} onBlur={(e) => { const to = e.target.value.trim(); if (to && to !== now) { edit(now, to); setTexts((t) => ({ ...t, [c.after]: to })) } setOpen(null) }} className="rounded-md border-[1.5px] border-line bg-background p-2 text-sm" />
            ) : (
              <span>{now}</span>
            )}
            {edit && open !== c.after ? <button type="button" onClick={() => setOpen(c.after)} className="cursor-pointer self-start text-xs font-bold text-brand-ink underline-offset-2 hover:underline">Edit</button> : null}
          </li>
        )
      })}
    </ul>
  )
}
