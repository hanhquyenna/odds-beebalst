import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckIcon, UploadIcon, XIcon } from "@/components/icons"
import { CvReadError, readCvFile } from "@/lib/cv-file"

interface CvUploadProps {
  /** The CV text now in the profile. */
  text: string
  /** The file it was read from, when there is one. */
  name: string | undefined
  /** Where the text came from when there is no file (for example the LinkedIn import), so it is never called a CV file it is not. */
  source?: string
  /** `uploaded` is true when the text came from a chosen file, false when it was typed, corrected or removed. */
  onChange: (text: string, name: string | undefined, uploaded: boolean) => void
  /** A line under the file: what was filled in from it. */
  note?: string | null
}

const ACCEPT = ".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"

/**
 * Where a CV goes in: choose a file or drop it here. It is read in the browser into text and only the text is kept, in the
 * profile, where the skills, degrees, roles and track record are read from. The text can be seen and corrected, or typed in
 * instead, because a CV that reads wrongly would give a wrong chance and nobody should have to trust it blindly.
 */
export function CvUpload({ text, name, source, onChange, note }: CvUploadProps): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null)
  const id = useId()
  const [busy, setBusy] = useState<boolean>(false)
  const [over, setOver] = useState<boolean>(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState<boolean>(false)
  const words = text.split(/\s+/).filter(Boolean).length

  async function take(file: File | undefined): Promise<void> {
    if (!file) return
    setBusy(true)
    setProblem(null)
    try {
      const read = await readCvFile(file)
      onChange(read.text, read.name, true)
    } catch (err) {
      setProblem(err instanceof CvReadError ? err.message : "We could not read that file. Try a PDF or Word file.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        id={id}
        type="file"
        accept={ACCEPT}
        aria-label="Upload your CV"
        className="sr-only"
        onChange={(e) => void take(e.target.files?.[0])}
      />

      {text.trim() !== "" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-[1.5px] px-4 py-3">
          <p className="flex min-w-0 items-center gap-2 text-sm">
            <CheckIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate font-medium">{name ?? source ?? "Your CV"}</span>
            <span className="shrink-0 text-muted-foreground">
              {words.toLocaleString()} {words === 1 ? "word" : "words"} read
            </span>
          </p>
          <span className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} className="cursor-pointer">
              Replace
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => { onChange("", undefined, false); setProblem(null) }} className="cursor-pointer text-muted-foreground">
              <XIcon className="size-4" aria-hidden="true" /> Remove
            </Button>
          </span>
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); void take(e.dataTransfer.files?.[0]) }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed px-4 py-8 text-center transition-colors duration-150 ${over ? "border-foreground bg-accent" : "hover:border-foreground/40 hover:bg-accent/50"}`}
        >
          <UploadIcon className="size-6 text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium">{busy ? "Reading your CV…" : "Choose your CV, or drop it here"}</span>
          <span className="text-xs text-muted-foreground">PDF, Word (.docx) or text, up to 8 MB</span>
        </label>
      )}

      {text.trim() !== "" && !open ? <p className="line-clamp-3 whitespace-pre-line rounded-md bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">{text.trim()}</p> : null}

      {note && !problem ? <p className="text-sm text-muted-foreground">{note}</p> : null}

      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}

      <div>
        {text.trim() === "" ? (
          <p className="text-sm font-medium text-muted-foreground">Or type or paste it</p>
        ) : (
          <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)} className="cursor-pointer">
            {open ? "Hide the text" : "Read all the text we saved, and correct it"}
          </Button>
        )}
        {open || text.trim() === "" ? (
          <textarea
            aria-label="CV text"
            className="mt-2 min-h-40 w-full rounded-md border-[1.5px] bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
            value={text}
            onChange={(e) => onChange(e.target.value, name, false)}
          />
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">The file is read here in your browser and is not kept. Only the text is saved, in your account, to read your skills, degrees, roles and track record.</p>
    </div>
  )
}
