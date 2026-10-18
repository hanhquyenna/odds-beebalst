import { useRef, useState } from "react"
import { cvAccept } from "@/lib/cv-profile"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { UploadIcon } from "@/components/icons"
import { Pill, WebButton, WebCard } from "@/components/web/ui"
import { rememberConnectFocus } from "@/lib/connect-focus"
import { useData } from "@/lib/data"
import { useAddDocument } from "@/lib/use-documents"
import { MAX_NAME, driveFileUrl, problemText, type Doc, type DocKind } from "@/lib/document-model"
import { downloadDocument, makeMain, removeDocument, renameDocument, saveDocumentText, useDocumentStore } from "@/lib/documents"
import { useDrive } from "@/lib/drive"
import { extractSkills } from "@/lib/skills"

interface DocumentsProps {
  onSignIn: () => void
  /** Opens Connect so Google Drive can be linked before an upload. */
  onConnect?: () => void
}

const day = (iso: string): string => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

/**
 * The library: every CV and cover letter kept, a shelf each, and on the right the one you picked, as odds reads it. The main CV is the one the
 * chance on every job is worked out from; a job can use another (the job page picks from here, and what is uploaded there lands here).
 */
export function Documents({ onSignIn, onConnect }: DocumentsProps): React.JSX.Element {
  const data = useData()
  const store = useDocumentStore()
  const drive = useDrive()
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [asking, setAsking] = useState<Doc | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const top = useRef<HTMLInputElement>(null)
  const add = useAddDocument()
  const signedIn = Boolean(data.session)
  const current = store.docs.find((d) => d.id === picked) ?? store.docs.find((d) => d.kind === "cv" && d.isMain) ?? store.docs[0] ?? null

  async function remove(doc: Doc): Promise<void> {
    setAsking(null)
    setProblem(null)
    try {
      const next = await removeDocument(doc.id)
      // The chance rests on the main CV: when there is none left, nothing stale stays behind in the profile.
      if (doc.isMain && !next) data.setProfile({ ...data.profile, cv: "", cvName: undefined })
    } catch (err) {
      setProblem(problemText(err))
    }
  }

  async function upload(file: File | undefined): Promise<void> {
    if (!file) return
    setProblem(null)
    try {
      const added = await add(file, "cv")
      setNote(added.note)
      setPicked(added.added.doc.id)
    } catch (err) {
      setProblem(problemText(err))
    } finally {
      if (top.current) top.current.value = ""
    }
  }

  function needDrive(): void {
    rememberConnectFocus("drive")
    onConnect?.()
  }

  if (!signedIn) {
    return (
      <WebCard className="flex max-w-md flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Sign in to keep your documents.</p>
        <WebButton tone="primary" onClick={onSignIn}>
          Sign in
        </WebButton>
      </WebCard>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      <div className="flex items-center justify-end gap-3">
        <input ref={top} type="file" accept={cvAccept()} aria-label="Upload a CV file" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
        <WebButton tone="primary" onClick={() => (drive.status === "off" ? needDrive() : top.current?.click())}>
          Upload
        </WebButton>
      </div>
      {store.status === "error" ? <p role="alert" className="text-sm text-destructive">We could not load your documents. Refresh the page to try again.</p> : null}
      {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
      {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}

      <div className="flex flex-col items-start gap-6 xl:flex-row">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-8">
          <Shelf kind="cv" current={current?.id ?? null} onPick={setPicked} onProblem={setProblem} onNote={setNote} onDelete={setAsking} onNeedDrive={needDrive} />
          <Shelf kind="cover_letter" current={current?.id ?? null} onPick={setPicked} onProblem={setProblem} onNote={setNote} onDelete={setAsking} onNeedDrive={needDrive} />
        </div>
        {current ? <Preview key={current.id} doc={current} onProblem={setProblem} /> : null}
      </div>

      {asking ? (
        <ConfirmDialog
          title={`Delete ${asking.name}?`}
          body={`${asking.isMain ? "This is your main CV. The next CV you have takes its place, and with none left the chance on each job goes back to your profile alone." : "It is taken off every job it is on."}${asking.inDrive ? " The file goes to your Google Drive bin, where you can get it back for 30 days." : ""}`}
          confirm="Delete"
          onCancel={() => setAsking(null)}
          onConfirm={() => void remove(asking)}
        />
      ) : null}
    </div>
  )
}

interface ShelfProps {
  kind: DocKind
  current: string | null
  onPick: (id: string) => void
  onProblem: (text: string | null) => void
  onNote: (text: string | null) => void
  onDelete: (doc: Doc) => void
  onNeedDrive: () => void
}

/** One kind of document: its heading, then the upload tile and every document as a card. */
function Shelf({ kind, current, onPick, onProblem, onNote, onDelete, onNeedDrive }: ShelfProps): React.JSX.Element {
  const store = useDocumentStore()
  const drive = useDrive()
  const add = useAddDocument()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const ordered = store.docs.filter((d) => d.kind === kind).sort((a, b) => Number(b.isMain) - Number(a.isMain) || b.createdAt.localeCompare(a.createdAt))
  const needsDrive = drive.status === "off"
  const label = kind === "cv" ? "CV" : "cover letter"

  async function take(file: File | undefined): Promise<void> {
    if (!file) return
    setBusy(true)
    onProblem(null)
    onNote(null)
    try {
      const added = await add(file, kind)
      onNote(added.note)
      onPick(added.added.doc.id)
    } catch (err) {
      onProblem(problemText(err))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <section aria-labelledby={`shelf-${kind}`}>
      <h2 id={`shelf-${kind}`} className="mb-4 text-2xl font-extrabold tracking-tight">
        {kind === "cv" ? "CVs" : "Cover letters"}
      </h2>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <li>
          <input ref={input} type="file" accept={cvAccept()} aria-label={`Upload a ${label}`} className="sr-only" onChange={(e) => void take(e.target.files?.[0])} />
          <button
            type="button"
            disabled={busy}
            onClick={() => (needsDrive ? onNeedDrive() : input.current?.click())}
            className={`flex h-full min-h-[11rem] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-brand text-center transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 ${needsDrive ? "bg-[#FBE9E6]" : "bg-[#FFF8F1]"}`}
          >
            <span className="grid size-[52px] place-items-center rounded-full bg-brand">
              <UploadIcon className="size-6" weight="bold" aria-hidden="true" />
            </span>
            <span className="text-base font-extrabold">{busy ? "Reading…" : needsDrive ? "Connect Drive to upload" : `Upload a ${label}`}</span>
            <span className="text-[0.8125rem] text-muted-foreground">{needsDrive ? "Opens Connect" : kind === "cv" ? "Drop a PDF or Word file here" : "Or let Claude write one for each job"}</span>
          </button>
        </li>
        {ordered.map((doc) => (
          <li key={doc.id}>
            <DocumentCard doc={doc} on={current === doc.id} missing={drive.missing.has(doc.id)} onPick={() => onPick(doc.id)} onDelete={() => onDelete(doc)} onProblem={onProblem} />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A small page with lines on it, standing for the file. */
function Thumb(): React.JSX.Element {
  return (
    <span aria-hidden="true" className="flex h-14 w-11 shrink-0 flex-col gap-1.5 rounded-lg border-[1.5px] border-line bg-card p-2">
      <span className="block h-[7px] w-[55%] rounded-sm bg-foreground" />
      {[100, 82, 64, 100].map((w, i) => (
        <span key={i} className="block h-1 rounded-sm bg-[#D9D0C4]" style={{ width: `${w}%` }} />
      ))}
    </span>
  )
}

function DocumentCard({ doc, on, missing, onPick, onDelete, onProblem }: { doc: Doc; on: boolean; missing: boolean; onPick: () => void; onDelete: () => void; onProblem: (text: string | null) => void }): React.JSX.Element {
  const store = useDocumentStore()
  const [editing, setEditing] = useState<boolean>(false)
  const [name, setName] = useState<string>(doc.name)
  const used = store.links.filter((l) => l.documentId === doc.id).length

  async function save(): Promise<void> {
    setEditing(false)
    onProblem(null)
    try {
      await renameDocument(doc.id, name)
    } catch (err) {
      setName(doc.name)
      onProblem(problemText(err))
    }
  }

  async function run(action: () => Promise<unknown>): Promise<void> {
    onProblem(null)
    try {
      await action()
    } catch (err) {
      onProblem(problemText(err))
    }
  }

  const link = "cursor-pointer text-[0.8125rem] font-extrabold hover:underline"
  const dot = <span aria-hidden="true" className="text-muted-foreground">·</span>

  return (
    <article className={`flex h-full min-h-[11rem] flex-col gap-3 rounded-[18px] border-[1.5px] bg-card p-5 ${on ? "border-brand border-2" : "border-line"}`}>
      <div className="flex items-start gap-3.5">
        <Thumb />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); void save() }}>
              <input autoFocus aria-label="Name" maxLength={MAX_NAME} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()} onKeyDown={(e) => { if (e.key === "Escape") { setName(doc.name); setEditing(false) } }} className="h-8 w-full rounded-md border-[1.5px] border-line px-2 text-sm font-bold focus:border-brand focus:outline-none" />
            </form>
          ) : (
            <button type="button" onClick={onPick} title={doc.name} className="cursor-pointer text-left text-base leading-snug font-extrabold hover:underline"><span className="line-clamp-2">{doc.name}</span></button>
          )}
          <span className="text-[0.8125rem] text-muted-foreground">Uploaded {day(doc.createdAt)}</span>
          <span className="text-[0.8125rem] text-muted-foreground">{used === 0 ? "Not used yet" : `Used for ${used} ${used === 1 ? "job" : "jobs"}`}</span>
          {doc.inDrive && missing ? <span role="status" className="text-xs font-bold text-destructive">File unavailable in Drive</span> : null}
          {doc.isMain && doc.kind === "cv" ? <Pill className="mt-1 w-fit bg-brand">Main CV</Pill> : doc.kind === "cv" ? <button type="button" onClick={() => void run(() => makeMain(doc.id))} className="mt-0.5 w-fit cursor-pointer text-[0.8125rem] font-extrabold text-[#B4561A] hover:underline">Make main</button> : null}
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t-[1.5px] border-line/60 pt-3">
        {doc.driveFileId && !missing ? (
          <a href={driveFileUrl(doc.driveFileId)} target="_blank" rel="noreferrer" aria-label={`Open ${doc.name} in Google Drive`} className={link}>Open</a>
        ) : (
          <button type="button" aria-label={`Open ${doc.name}`} onClick={onPick} className={link}>Open</button>
        )}
        {dot}
        <button type="button" aria-label={`Rename ${doc.name}`} onClick={() => setEditing(true)} className={link}>Rename</button>
        {dot}
        <button type="button" aria-label={`Download ${doc.name}`} onClick={() => void run(() => downloadDocument(doc.id))} className={link}>Download</button>
        <button type="button" aria-label={`Delete ${doc.name}`} onClick={onDelete} className={`${link} ml-auto text-[#B3261E]`}>Delete</button>
      </div>
    </article>
  )
}

/** The picked document as odds reads it: the keywords found, and the text they come from, which can be corrected when the reading went wrong. */
function Preview({ doc, onProblem }: { doc: Doc; onProblem: (text: string | null) => void }): React.JSX.Element {
  const store = useDocumentStore()
  const [text, setText] = useState<string>(doc.body)
  const [saving, setSaving] = useState<boolean>(false)
  const keywords = extractSkills(text)
  const used = store.links.filter((l) => l.documentId === doc.id).length
  const changed = text !== doc.body

  return (
    <WebCard aria-label="Preview" className="flex w-full shrink-0 flex-col gap-3 xl:sticky xl:top-[5.25rem] xl:w-[420px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">Preview</h2>
        {doc.isMain && doc.kind === "cv" ? <Pill className="bg-brand">Main CV</Pill> : null}
      </div>
      <label className="flex flex-col gap-1">
        <span className="sr-only">The text odds reads from {doc.name}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder="Odds could not read any text from this file." className="h-72 w-full resize-y rounded-xl border-0 bg-secondary p-4 text-[0.8125rem] leading-relaxed focus:outline-2 focus:outline-brand" />
      </label>
      <div>
        <p className="text-[0.95rem] font-extrabold">{doc.name}</p>
        <p className="text-[0.8125rem] text-muted-foreground">
          Uploaded {day(doc.createdAt)} · {used === 0 ? "not used yet" : `used for ${used} ${used === 1 ? "job" : "jobs"}`}
        </p>
      </div>
      {keywords.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-[0.7rem] font-extrabold tracking-[0.08em] text-good-foreground uppercase">Keywords odds reads</h3>
          <ul className="flex flex-wrap gap-1.5">
            {keywords.slice(0, 24).map((k) => (
              <li key={k} className="inline-flex h-7 items-center rounded-full bg-[#1F7A4D] px-3 text-xs font-extrabold text-white">
                {k}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">This is the text odds reads. Correct it if the reading went wrong; the file itself stays as you uploaded it.</p>
      <div className="flex gap-2">
        <WebButton
          tone="primary"
          disabled={!changed || saving}
          onClick={() => {
            setSaving(true)
            onProblem(null)
            saveDocumentText(doc.id, text).catch((err: unknown) => onProblem(problemText(err))).finally(() => setSaving(false))
          }}
        >
          {saving ? "Saving…" : "Save changes"}
        </WebButton>
        <WebButton disabled={!changed} onClick={() => setText(doc.body)}>
          Discard
        </WebButton>
      </div>
    </WebCard>
  )
}
