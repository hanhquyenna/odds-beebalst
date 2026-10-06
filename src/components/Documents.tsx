import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ArrowLeftIcon, PencilIcon, TrashIcon, UploadIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { useAddDocument } from "@/lib/use-documents"
import { KIND_LABEL, MAX_DOCUMENTS, MAX_NAME, jobsUsing, problemText, type Doc, type DocKind } from "@/lib/document-model"
import { downloadDocument, makeMain, removeDocument, renameDocument, useDocumentStore } from "@/lib/documents"

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
              <DocumentRow key={doc.id} doc={doc} jobs={jobsUsing(store, doc.id).length} onDelete={() => setAsking(doc)} onProblem={setProblem} />
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

          {section("cv", cvInput, "The main CV is what the chance on every job is worked out from. PDF, Word (.docx) or text, up to 8 MB.")}
          {section("cover_letter", letterInput, "Kept for you to put on a job. It does not change the chance.")}
        </>
      )}

      {asking ? (
        <ConfirmDialog
          title={`Delete ${asking.name}?`}
          body={asking.isMain ? "This is your main CV. The next CV you have takes its place, and with none left the chance on each job goes back to your profile alone." : "It is taken off every job it is on."}
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
  onDelete: () => void
  onProblem: (text: string | null) => void
}

function DocumentRow({ doc, jobs, onDelete, onProblem }: DocumentRowProps): React.JSX.Element {
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
          </p>
        )}
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {doc.fileName} · {sizeText(doc.size)} · {dateText(doc.createdAt)}
          {jobs > 0 ? ` · on ${jobs} ${jobs === 1 ? "job" : "jobs"}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
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
