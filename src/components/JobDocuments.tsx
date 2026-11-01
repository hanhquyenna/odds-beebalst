import { useRef, useState } from "react"
import { cvAccept } from "@/lib/cv-profile"
import { cn } from "cn"
import { Button, buttonVariants } from "@/components/ui/button"
import { FileTextIcon, UploadIcon } from "@/components/icons"
import { Section } from "@/components/Section"
import { useData } from "@/lib/data"
import { requestSignIn } from "@/lib/sign-in-request"
import { useAddDocument } from "@/lib/use-documents"
import { KIND_LABEL, attachedTo, driveFileUrl, nameForJob, previewOf, problemText, type Doc, type DocKind } from "@/lib/document-model"
import { attachDocument, detachDocument, useDocumentStore } from "@/lib/documents"
import type { Posting } from "@/lib/types"


/**
 * The CV and the cover letter for this job, side by side: each one is picked from the library in Documents, or uploaded here,
 * which puts it in the library too, named after the job. A CV on a job is also what that job's chance is worked out from.
 */
export function JobDocuments({ post }: { post: Posting }): React.JSX.Element {
  const data = useData()

  if (!data.session) {
    return (
      <Section title="Your documents">
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">Sign in to keep a CV and a cover letter for this job.</p>
          <Button type="button" variant="outline" onClick={requestSignIn} className="cursor-pointer max-md:h-10">
            Sign in
          </Button>
        </div>
      </Section>
    )
  }


  return (
    <Section title="Your documents">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Slot post={post} kind="cv" />
        <Slot post={post} kind="cover_letter" />
      </div>
    </Section>
  )
}

/** One document for this job: what is on it now, and two equal ways to change it. */
function Slot({ post, kind }: { post: Posting; kind: DocKind }): React.JSX.Element {
  const store = useDocumentStore()
  const add = useAddDocument()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [problem, setProblem] = useState<string | null>(null)
  const library = store.docs.filter((d) => d.kind === kind)
  const attached = attachedTo(store, post.id, kind)
  // Only what the person put on this job is shown. The main CV is not put on a job for them.
  const shown: Doc | undefined = attached
  const label = KIND_LABEL[kind]

  async function choose(id: string): Promise<void> {
    setProblem(null)
    try {
      if (id === "") await detachDocument(post.id, kind)
      else await attachDocument(post.id, id)
    } catch (err) {
      setProblem(problemText(err))
    }
  }

  async function take(file: File | undefined): Promise<void> {
    if (!file) return
    setBusy(true)
    setProblem(null)
    try {
      await add(file, kind, nameForJob(kind, post), post.id)
    } catch (err) {
      setProblem(problemText(err))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border-[1.5px] bg-card p-4">
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <FileTextIcon className="size-4" aria-hidden="true" /> {label}
      </p>

      <div className="min-h-[4.5rem]">
        {shown ? (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-medium">{shown.name}</span>
            </p>
            {previewOf(shown.body) ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{previewOf(shown.body)}</p> : null}
            {shown.driveFileId ? (
              <a href={driveFileUrl(shown.driveFileId)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
                Open in Drive
              </a>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{library.length > 0 ? `No ${label.toLowerCase()} on this job yet.` : `No ${kind === "cv" ? "CV" : "cover letter"} yet.`}</p>
        )}
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "relative cursor-pointer max-md:h-10", library.length === 0 ? "pointer-events-none opacity-50" : "")}>
          <span className="truncate">Choose from library</span>
          <select
            aria-label={`Choose a ${label.toLowerCase()} from your library`}
            value={attached?.id ?? ""}
            onChange={(e) => void choose(e.target.value)}
            disabled={library.length === 0}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="">{kind === "cv" ? "No CV on this job" : "No cover letter"}</option>
            {library.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isMain ? " (main)" : ""}
              </option>
            ))}
          </select>
        </label>
        <input ref={input} type="file" accept={cvAccept()} aria-label={`Upload a new ${label.toLowerCase()}`} className="sr-only" onChange={(e) => void take(e.target.files?.[0])} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} className="cursor-pointer max-md:h-10">
          <UploadIcon className="size-4" aria-hidden="true" /> {busy ? "Reading…" : "Upload new"}
        </Button>
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
