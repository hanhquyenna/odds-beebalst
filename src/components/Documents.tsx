import { useRef, useState } from "react"
import { cvAccept } from "@/lib/cv-profile"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ArrowLeftIcon, DownloadIcon, FileTextIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons"
import { rememberConnectFocus } from "@/lib/connect-focus"
import { useData } from "@/lib/data"
import { useAddDocument } from "@/lib/use-documents"
import { MAX_NAME, driveFileUrl, problemText, type Doc, type DocKind } from "@/lib/document-model"
import { downloadDocument, makeMain, removeDocument, renameDocument, useDocumentStore } from "@/lib/documents"
import { useDrive } from "@/lib/drive"


/** Every tile in the library is the same size, so the grid reads as one collection whatever is in it. */
const TILE = "flex h-full min-h-[8.5rem] flex-col rounded-xl border-[1.5px] p-4"

interface DocumentsProps {
  onBack: () => void
  onSignIn: () => void
  /** Opens Connect so Google Drive can be linked before an upload. */
  onConnect?: () => void
}

/**
 * The library: every CV and cover letter kept, as a grid of the same-sized cards, each with what it says, where it is used and
 * what can be done with it. The main CV is the one the chance on every job is worked out from; a job can use another (the job
 * page picks from here, and what is uploaded there lands here, named after the job).
 */
export function Documents({ onBack, onSignIn, onConnect }: DocumentsProps): React.JSX.Element {
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

  function goConnectDrive(): void {
    rememberConnectFocus("drive")
    onConnect?.()
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 pb-16">
      <button type="button" onClick={onBack} className="flex w-fit cursor-pointer items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden="true" /> Back
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
          {store.status === "error" ? <p role="alert" className="text-sm text-destructive">We could not load your documents. Refresh the page to try again.</p> : null}
          {problem ? (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}

          <Shelf kind="cv" onProblem={setProblem} onNote={setNote} onDelete={setAsking} onNeedDrive={goConnectDrive} />
          <Shelf kind="cover_letter" onProblem={setProblem} onNote={setNote} onDelete={setAsking} onNeedDrive={goConnectDrive} />
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
  onNeedDrive: () => void
}

/** One kind of document: a heading, then the upload tile and every document as same-sized cards. */
function Shelf({ kind, onProblem, onNote, onDelete, onNeedDrive }: ShelfProps): React.JSX.Element {
  const store = useDocumentStore()
  const drive = useDrive()
  const add = useAddDocument()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const docs = store.docs.filter((d) => d.kind === kind)
  // The main CV first, then newest first: what is used most sits at the top left.
  const ordered = [...docs].sort((a, b) => Number(b.isMain) - Number(a.isMain) || b.createdAt.localeCompare(a.createdAt))
  const needsDrive = drive.status === "off"

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
        <h2 id={`shelf-${kind}`} className="font-heading text-xl font-bold tracking-tight">
          {kind === "cv" ? "CVs" : "Cover letters"}
        </h2>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li>
          <input ref={input} type="file" accept={cvAccept()} aria-label={kind === "cv" ? "Upload a CV" : "Upload a cover letter"} className="sr-only" onChange={(e) => void take(e.target.files?.[0])} />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (needsDrive) {
                onNeedDrive()
                return
              }
              input.current?.click()
            }}
            className={cn(
              `${TILE} w-full cursor-pointer items-center justify-center gap-2 border-dashed text-center transition-colors duration-150 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60`,
              needsDrive ? "border-destructive bg-destructive/5" : "bg-secondary/30",
            )}
          >
            <span className={cn("flex size-10 items-center justify-center rounded-full bg-background", needsDrive ? "text-destructive" : "")}>
              <PlusIcon className="size-5" aria-hidden="true" />
            </span>
            <span className="font-medium">{busy ? "Reading…" : needsDrive ? "Connect Drive to upload" : kind === "cv" ? "Upload a CV" : "Upload a cover letter"}</span>
            {needsDrive ? <span className="text-xs text-destructive">Opens Connect</span> : null}
          </button>
        </li>
        {ordered.map((doc) => (
          <li key={doc.id}>
            <DocumentCard doc={doc} missing={drive.missing.has(doc.id)} onDelete={() => onDelete(doc)} onProblem={onProblem} />
          </li>
        ))}
      </ul>
    </section>
  )
}

interface DocumentCardProps {
  doc: Doc
  missing: boolean
  onDelete: () => void
  onProblem: (text: string | null) => void
}

function DocumentCard({ doc, missing, onDelete, onProblem }: DocumentCardProps): React.JSX.Element {
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

  const icon = "flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground max-md:size-10"

  return (
    <article className={`${TILE} gap-3 bg-card`}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-ink">
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
            <h3 className="line-clamp-2 font-semibold leading-snug" title={doc.name}>{doc.name}</h3>
          )}
          {doc.inDrive && missing ? <p role="status" className="mt-1 text-xs font-medium text-destructive">File unavailable in Drive</p> : null}
        </div>
      </div>

      <div className="mt-auto flex items-center gap-1 border-t-[1.5px] pt-3">
        {doc.driveFileId && !missing ? (
          <a aria-label={`Open ${doc.name} in Google Drive`} href={driveFileUrl(doc.driveFileId)} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer max-md:h-10")}>
            <img src="/sources/google-drive.svg" alt="" className="size-4" /> Open
          </a>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={() => void run(() => downloadDocument(doc.id))} className="cursor-pointer max-md:h-10">
            <DownloadIcon className="size-4" aria-hidden="true" /> Download
          </Button>
        )}
        {doc.kind === "cv" && !doc.isMain ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => void run(() => makeMain(doc.id))} className="cursor-pointer max-md:h-10">
            Use this CV
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
