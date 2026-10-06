import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { UploadIcon } from "@/components/icons"
import { Section } from "@/components/Section"
import { useData } from "@/lib/data"
import { useAddDocument } from "@/lib/use-documents"
import { KIND_LABEL, MAX_DOCUMENTS, attachedTo, mainCv, problemText, type DocKind } from "@/lib/document-model"
import { attachDocument, detachDocument, useDocumentStore } from "@/lib/documents"

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"

/**
 * The CV and the cover letter that go with this job: pick one of the documents already kept (so a version is reused by name)
 * or add a new one here, which is kept in Documents too. A CV on a job is also what that job's chance is worked out from.
 */
export function JobDocuments({ postingId }: { postingId: string }): React.JSX.Element {
  const data = useData()
  const store = useDocumentStore()
  const signedIn = Boolean(data.session)

  if (!signedIn) {
    return (
      <Section title="Your documents">
        <p className="text-sm text-muted-foreground">Sign in from the menu at the top to keep a CV and a cover letter for this job. They are stored in your account.</p>
      </Section>
    )
  }

  const main = mainCv(store)

  return (
    <Section title="Your documents" aside={<span className="text-sm text-muted-foreground tabular-nums">{store.docs.length} of {MAX_DOCUMENTS} kept</span>}>
      <div className="flex flex-col gap-5">
        <Slot postingId={postingId} kind="cv" />
        <Slot postingId={postingId} kind="cover_letter" />
        {attachedTo(store, postingId, "cv") ? <p className="text-sm text-muted-foreground">The chance for this job is worked out from {attachedTo(store, postingId, "cv")?.name}.</p> : main ? <p className="text-sm text-muted-foreground">The chance for this job is worked out from your main CV, {main.name}. Choose another CV to see what it changes.</p> : null}
      </div>
    </Section>
  )
}

function Slot({ postingId, kind }: { postingId: string; kind: DocKind }): React.JSX.Element {
  const store = useDocumentStore()
  const add = useAddDocument()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<boolean>(false)
  const [problem, setProblem] = useState<string | null>(null)
  const options = store.docs.filter((d) => d.kind === kind)
  const current = attachedTo(store, postingId, kind)
  const full = store.docs.length >= MAX_DOCUMENTS
  const label = KIND_LABEL[kind]

  async function choose(id: string): Promise<void> {
    setProblem(null)
    try {
      if (id === "") await detachDocument(postingId, kind)
      else await attachDocument(postingId, id)
    } catch (err) {
      setProblem(problemText(err))
    }
  }

  async function take(files: FileList | null): Promise<void> {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    setProblem(null)
    try {
      const { added } = await add(file, kind)
      await attachDocument(postingId, added.doc.id)
    } catch (err) {
      setProblem(problemText(err))
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          {label}
          <select
            value={current?.id ?? ""}
            onChange={(e) => void choose(e.target.value)}
            disabled={options.length === 0}
            className="h-9 min-w-48 max-w-full cursor-pointer rounded-lg border-[1.5px] bg-background px-2.5 text-sm font-normal disabled:cursor-default disabled:text-muted-foreground"
          >
            <option value="">{options.length === 0 ? `No ${label.toLowerCase()} kept yet` : kind === "cv" ? "Main CV (none chosen for this job)" : "None"}</option>
            {options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isMain ? " (main)" : ""}
              </option>
            ))}
          </select>
        </label>
        <input ref={input} type="file" accept={ACCEPT} aria-label={`Add a new ${label.toLowerCase()}`} className="sr-only" onChange={(e) => void take(e.target.files)} />
        <Button type="button" variant="outline" size="sm" disabled={full || busy} onClick={() => input.current?.click()} className="cursor-pointer self-end">
          <UploadIcon className="size-4" aria-hidden="true" /> {busy ? "Reading…" : `Add a new ${label.toLowerCase()}`}
        </Button>
      </div>
      {full && !current ? <p className="text-xs text-muted-foreground">All {MAX_DOCUMENTS} places are used. Delete a document in Documents to add another.</p> : null}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
