import { useRef, useState } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ArrowLeftIcon, PencilIcon, TrashIcon, UploadIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { useAddDocument } from "@/lib/use-documents"
import { KIND_LABEL, MAX_DOCUMENTS, MAX_NAME, driveFileUrl, jobsUsing, previewOf, problemText, wordCount, type Doc, type DocKind } from "@/lib/document-model"
import { downloadDocument, makeMain, removeDocument, renameDocument, useDocumentStore } from "@/lib/documents"
import { connectDrive, disconnectDrive, useDrive } from "@/lib/drive"

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"

const sizeText = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`)
const dateText = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

interface DocumentsProps {
  onBack: () => void
  onSignIn: () => void
}

/**
 * Where CVs and cover letters are kept, up to five, each with a name so a version can be reused on any job. The main CV is the
 * one the chance on every job is worked out from; a job can use another CV for its own chance (see the job page).
 */
export function Documents({ onBack, onSignIn }: DocumentsProps): React.JSX.Element {
  const data = useData()
  const store = useDocumentStore()
  const drive = useDrive()
  const add = useAddDocument()
  const [busy, setBusy] = useState<DocKind | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [asking, setAsking] = useState<Doc | null>(null)
  const cvInput = useRef<HTMLInputElement>(null)
  const letterInput = useRef<HTMLInputElement>(null)
  const signedIn = Boolean(data.session)
  const full = store.docs.length >= MAX_DOCUMENTS

  async function take(files: FileList | null, kind: DocKind): Promise<void> {
    const file = files?.[0]
    if (!file) return
    setBusy(kind)
    setProblem(null)
    setNote(null)
    try {
      const done = await add(file, kind)
      setNote(done.note)
    } catch (err) {
      setProblem(problemText(err))
    } finally {
      setBusy(null)
      if (cvInput.current) cvInput.current.value = ""
      if (letterInput.current) letterInput.current.value = ""
    }
  }

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

  const section = (kind: DocKind, input: React.RefObject<HTMLInputElement | null>, hint: string): React.JSX.Element => {
    const docs = store.docs.filter((d) => d.kind === kind)

    return (
      <section className="rounded-xl border-[1.5px] bg-card p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-medium tracking-tight">{kind === "cv" ? "CVs" : "Cover letters"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
          </div>
          <input ref={input} type="file" accept={ACCEPT} aria-label={`Add a ${KIND_LABEL[kind].toLowerCase()}`} className="sr-only" onChange={(e) => void take(e.target.files, kind)} />
          <Button variant="outline" size="sm" disabled={full || busy !== null} onClick={() => input.current?.click()} className="shrink-0 cursor-pointer">
            <UploadIcon className="size-4" aria-hidden="true" /> {busy === kind ? "Reading…" : `Add a ${KIND_LABEL[kind].toLowerCase()}`}
          </Button>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{kind === "cv" ? "No CV yet. Add one and the chance on every job is worked out from it." : "No cover letter yet."}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {docs.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} jobs={jobsUsing(store, doc.id).length} missing={drive.missing.has(doc.id)} onDelete={() => setAsking(doc)} onProblem={setProblem} />
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 pb-16">
      <button type="button" onClick={onBack} className="max-md:hidden flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-primary">
        <ArrowLeftIcon className="size-4" aria-hidden="true" /> Dashboard
      </button>

      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-2 text-muted-foreground">
          Keep your CVs and cover letters here, each with a name, and put the right one on each job. <span className="tabular-nums">{store.docs.length} of {MAX_DOCUMENTS}</span> used.
        </p>
      </header>

      {!signedIn ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] bg-card p-5 sm:p-6">
          <p className="text-sm text-muted-foreground">Sign in to keep your documents. They are stored in your account, only you can open them, and you can delete them any time.</p>
          <Button onClick={onSignIn} className="cursor-pointer">
            Sign in
          </Button>
        </div>
      ) : (
        <>
          {store.status === "error" ? <p role="alert" className="text-sm text-destructive">We could not load your documents. Refresh the page to try again.</p> : null}
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
          {full ? <p className="text-sm text-muted-foreground">You have used all {MAX_DOCUMENTS} places. Delete a document to add another.</p> : null}

          <DriveCard onProblem={setProblem} />

          {section("cv", cvInput, "The main CV is what the chance on every job is worked out from. PDF, Word (.docx) or text, up to 8 MB.")}
          {section("cover_letter", letterInput, "Kept for you to put on a job. It does not change the chance.")}
        </>
      )}

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

interface DocumentRowProps {
  doc: Doc
  jobs: number
  missing: boolean
  onDelete: () => void
  onProblem: (text: string | null) => void
}

function DocumentRow({ doc, jobs, missing, onDelete, onProblem }: DocumentRowProps): React.JSX.Element {
  const [editing, setEditing] = useState<boolean>(false)
  const [name, setName] = useState<string>(doc.name)

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

  return (
    <li className="flex flex-col gap-3 rounded-lg border-[1.5px] bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); void save() }} className="flex items-center gap-2">
            <input
              autoFocus
              aria-label="Name"
              maxLength={MAX_NAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void save()}
              onKeyDown={(e) => { if (e.key === "Escape") { setName(doc.name); setEditing(false) } }}
              className="h-8 min-w-0 flex-1 rounded-md border-[1.5px] bg-background px-2 text-sm font-medium focus:border-ring focus:outline-none"
            />
          </form>
        ) : (
          <p className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate font-medium">{doc.name}</span>
            {doc.isMain ? <span className="rounded-md bg-brand/15 px-2 py-0.5 text-xs font-medium">Main</span> : null}
            {doc.inDrive && missing ? (
              <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Not in your Drive any more</span>
            ) : doc.inDrive ? (
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">In your Drive</span>
            ) : null}
          </p>
        )}
        {previewOf(doc.body) ? <p className="mt-1 line-clamp-2 text-sm">{previewOf(doc.body)}</p> : null}
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {doc.fileName} · {wordCount(doc.body)} words · {sizeText(doc.size)} · {dateText(doc.createdAt)}
          {jobs > 0 ? ` · on ${jobs} ${jobs === 1 ? "job" : "jobs"}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {doc.driveFileId && !missing ? (
          <a href={driveFileUrl(doc.driveFileId)} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer`}>
            Open in Drive
          </a>
        ) : null}
        {doc.kind === "cv" && !doc.isMain ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void run(() => makeMain(doc.id))} className="cursor-pointer">
            Make main
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => void run(() => downloadDocument(doc.id))} className="cursor-pointer">
          Download
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Rename ${doc.name}`} onClick={() => setEditing(true)} className="cursor-pointer">
          <PencilIcon className="size-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${doc.name}`} onClick={onDelete} className="cursor-pointer text-destructive">
          <TrashIcon className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  )
}

/**
 * Google Drive: connect once and every file is kept in an "odds" folder in their own Drive, with "CVs" and "Cover letters"
 * inside. New uploads go there by themselves, and a file edited there is read again here.
 */
function DriveCard({ onProblem }: { onProblem: (text: string | null) => void }): React.JSX.Element | null {
  const drive = useDrive()
  const [busy, setBusy] = useState<boolean>(false)
  const [asking, setAsking] = useState<boolean>(false)
  if (drive.status === "unknown") return null

  async function run(action: () => Promise<void>): Promise<void> {
    onProblem(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      onProblem(problemText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border-[1.5px] bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      {drive.status === "on" ? (
        <>
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              <span className="size-2.5 shrink-0 rounded-full bg-good-foreground" aria-hidden="true" /> Saved to your Google Drive
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your files are in the <span className="font-medium text-foreground">odds</span> folder{drive.email ? ` of ${drive.email}` : ""}, in CVs and Cover letters. New ones go there by themselves, and if you edit one there, odds reads it again.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1">
            {drive.folder ? (
              <a href={drive.folder} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "outline", size: "sm" })} cursor-pointer`}>
                Open folder
              </a>
            ) : null}
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setAsking(true)} className="cursor-pointer text-destructive">
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0">
            <p className="font-medium">Keep your files in your Google Drive</p>
            <p className="mt-1 text-sm text-muted-foreground">Connect once: we make an odds folder with CVs and Cover letters in it, and every file goes there. odds can only see the files it puts there, nothing else in your Drive.</p>
          </div>
          <Button type="button" disabled={busy} onClick={() => void run(connectDrive)} className="shrink-0 cursor-pointer">
            {busy ? "Opening Google…" : "Connect Google Drive"}
          </Button>
        </>
      )}
      {asking ? (
        <ConfirmDialog
          title="Disconnect Google Drive?"
          body="Your files come back into odds, and copies stay in your Drive. New files are kept in odds until you connect again."
          confirm="Disconnect"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            void run(disconnectDrive)
          }}
        />
      ) : null}
    </section>
  )
}
