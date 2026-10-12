import { useRef, useState } from "react"
import { cvAccept } from "@/lib/cv-profile"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ArrowLeftIcon, DownloadIcon, FileTextIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { isGuestEmail } from "@/lib/auth"
import { useAddDocument } from "@/lib/use-documents"
import { MAX_DOCUMENTS, MAX_NAME, driveFileUrl, jobsUsing, previewOf, problemText, wordCount, type Doc, type DocKind } from "@/lib/document-model"
import { downloadDocument, makeMain, removeDocument, renameDocument, useDocumentStore } from "@/lib/documents"
import { connectDrive, disconnectDrive, useDrive } from "@/lib/drive"


const sizeText = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`)
const dateText = (iso: string): string => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

/** Every tile in the library is the same size, so the grid reads as one collection whatever is in it. */
const TILE = "flex h-full min-h-[13.5rem] flex-col rounded-xl border-[1.5px] p-4"

interface DocumentsProps {
  onBack: () => void
  onSignIn: () => void
}

/**
 * The library: every CV and cover letter kept, as a grid of the same-sized cards, each with what it says, where it is used and
 * what can be done with it. The main CV is the one the chance on every job is worked out from; a job can use another (the job
 * page picks from here, and what is uploaded there lands here, named after the job).
 */
export function Documents({ onBack, onSignIn }: DocumentsProps): React.JSX.Element {
  const data = useData()
  const store = useDocumentStore()
  const [problem, setProblem] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [asking, setAsking] = useState<Doc | null>(null)
  const signedIn = Boolean(data.session)

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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 pb-16">
      <button type="button" onClick={onBack} className="max-md:hidden flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-primary">
        <ArrowLeftIcon className="size-4" aria-hidden="true" /> Dashboard
      </button>

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Documents</h1>
        </div>
      </header>

      {!signedIn ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] bg-card p-5 sm:p-6">
          <p className="text-sm text-muted-foreground">Sign in to keep your documents.</p>
          <Button onClick={onSignIn} className="cursor-pointer">
            Sign in
          </Button>
        </div>
      ) : (
        <>
          <DriveCard onProblem={setProblem} onSignIn={onSignIn} />
          {store.status === "error" ? <p role="alert" className="text-sm text-destructive">We could not load your documents. Refresh the page to try again.</p> : null}
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}

          <Shelf kind="cv" onProblem={setProblem} onNote={setNote} onDelete={setAsking} />
          <Shelf kind="cover_letter" onProblem={setProblem} onNote={setNote} onDelete={setAsking} />
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

interface ShelfProps {
  kind: DocKind
  onProblem: (text: string | null) => void
  onNote: (text: string | null) => void
  onDelete: (doc: Doc) => void
}

/** One kind of document: a heading, then the upload tile and every document as same-sized cards. */
function Shelf({ kind, onProblem, onNote, onDelete }: ShelfProps): React.JSX.Element {
  const store = useDocumentStore()
  const drive = useDrive()
  const add = useAddDocument()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const docs = store.docs.filter((d) => d.kind === kind)
  // The main CV first, then newest first: what is used most sits at the top left.
  const ordered = [...docs].sort((a, b) => Number(b.isMain) - Number(a.isMain) || b.createdAt.localeCompare(a.createdAt))
  const full = store.docs.length >= MAX_DOCUMENTS

  async function take(file: File | undefined): Promise<void> {
    if (!file) return
    setBusy(true)
    onProblem(null)
    onNote(null)
    try {
      onNote((await add(file, kind)).note)
    } catch (err) {
      onProblem(problemText(err))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <section aria-labelledby={`shelf-${kind}`}>
      <div className="mb-3">
        <h2 id={`shelf-${kind}`} className="font-heading text-xl font-medium tracking-tight">
          {kind === "cv" ? "CVs" : "Cover letters"} <span className="text-base text-muted-foreground tabular-nums">{docs.length}</span>
        </h2>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <input ref={input} type="file" accept={cvAccept()} aria-label={kind === "cv" ? "Upload a CV" : "Upload a cover letter"} className="sr-only" onChange={(e) => void take(e.target.files?.[0])} />
          <button
            type="button"
            disabled={full || busy}
            onClick={() => input.current?.click()}
            className={`${TILE} w-full cursor-pointer items-center justify-center gap-2 border-dashed bg-secondary/30 text-center transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-background">
              <PlusIcon className="size-5" aria-hidden="true" />
            </span>
            <span className="font-medium">{busy ? "Reading…" : kind === "cv" ? "Upload a CV" : "Upload a cover letter"}</span>
            <span className="text-xs text-muted-foreground">{full ? `Library full (${MAX_DOCUMENTS})` : "PDF, Word (.docx) or text, up to 8 MB"}</span>
          </button>
        </li>
        {ordered.map((doc) => (
          <li key={doc.id}>
            <DocumentCard doc={doc} jobs={jobsUsing(store, doc.id).length} missing={drive.missing.has(doc.id)} onDelete={() => onDelete(doc)} onProblem={onProblem} />
          </li>
        ))}
      </ul>
    </section>
  )
}

interface DocumentCardProps {
  doc: Doc
  jobs: number
  missing: boolean
  onDelete: () => void
  onProblem: (text: string | null) => void
}

function DocumentCard({ doc, jobs, missing, onDelete, onProblem }: DocumentCardProps): React.JSX.Element {
  const [editing, setEditing] = useState<boolean>(false)
  const [name, setName] = useState<string>(doc.name)
  const preview = previewOf(doc.body, 200)

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

  const icon = "flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground max-md:size-10"

  return (
    <article className={`${TILE} gap-3 bg-card`}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <FileTextIcon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); void save() }}>
              <input
                autoFocus
                aria-label="Name"
                maxLength={MAX_NAME}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void save()}
                onKeyDown={(e) => { if (e.key === "Escape") { setName(doc.name); setEditing(false) } }}
                className="h-8 w-full rounded-md border-[1.5px] bg-background px-2 text-sm font-medium focus:border-ring focus:outline-none"
              />
            </form>
          ) : (
            <h3 className="line-clamp-2 font-medium leading-snug" title={doc.name}>{doc.name}</h3>
          )}
          <p className="mt-1 flex flex-wrap gap-1.5">
            {doc.isMain ? <span className="rounded-md bg-brand/15 px-2 py-0.5 text-xs font-medium">Main CV</span> : null}
            {doc.inDrive && missing ? (
              <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Missing from Google Drive</span>
            ) : doc.inDrive ? (
              <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">In Google Drive</span>
            ) : null}
            {jobs > 0 ? <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">Sent with {jobs} {jobs === 1 ? "job" : "jobs"}</span> : null}
          </p>
        </div>
      </div>

      <p className="line-clamp-3 text-sm text-muted-foreground">{preview || "No text could be read from this file."}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {wordCount(doc.body)} words · {sizeText(doc.size)} · {dateText(doc.createdAt)}
      </p>

      <div className="mt-auto flex items-center gap-1 border-t-[1.5px] pt-3">
        {doc.driveFileId && !missing ? (
          <a href={driveFileUrl(doc.driveFileId)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer max-md:h-10")}>
            Open
          </a>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => void run(() => downloadDocument(doc.id))} className="cursor-pointer max-md:h-10">
            <DownloadIcon className="size-4" aria-hidden="true" /> Download
          </Button>
        )}
        {doc.kind === "cv" && !doc.isMain ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void run(() => makeMain(doc.id))} className="cursor-pointer max-md:h-10">
            Use as main CV
          </Button>
        ) : null}
        <span className="ml-auto flex items-center">
          <button type="button" aria-label={`Rename ${doc.name}`} onClick={() => setEditing(true)} className={icon}>
            <PencilIcon className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label={`Delete ${doc.name}`} onClick={onDelete} className={`${icon} hover:text-destructive`}>
            <TrashIcon className="size-4" aria-hidden="true" />
          </button>
        </span>
      </div>
    </article>
  )
}

/**
 * Google Drive: connect once and every file is kept in an "odds" folder in their own Drive, with "CVs" and "Cover letters"
 * inside. New uploads go there by themselves, and a file edited there is read again here.
 */
function DriveCard({ onProblem, onSignIn }: { onProblem: (text: string | null) => void; onSignIn: () => void }): React.JSX.Element | null {
  const drive = useDrive()
  // A guest account (made from a LinkedIn import) has no Google account to connect: it signs in with Google first.
  const guest = isGuestEmail(useData().session?.user.email)
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
            {drive.email ? <p className="mt-1 text-sm text-muted-foreground">{drive.email}</p> : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {drive.folder ? (
              <a href={drive.folder} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer max-md:h-10 max-md:px-3.5")}>
                Open folder
              </a>
            ) : null}
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setAsking(true)} className="cursor-pointer max-md:h-10 max-md:px-3.5 text-destructive">
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="min-w-0">
            <p className="font-medium">Keep your files in your Google Drive</p>
            <p className="mt-1 text-sm text-muted-foreground">odds sees only its own folder.</p>
          </div>
          {guest ? (
            <Button type="button" onClick={onSignIn} className="shrink-0 cursor-pointer">
              Sign in with Google first
            </Button>
          ) : (
            <Button type="button" disabled={busy} onClick={() => void run(connectDrive)} className="shrink-0 cursor-pointer">
              {busy ? "Opening Google…" : "Connect Google Drive"}
            </Button>
          )}
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
