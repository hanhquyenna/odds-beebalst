/**
 * What a document is, and the plain rules about names, file types and what a refusal means. No network and no browser here, so all
 * of it is tested; documents.ts holds the store and the calls.
 */

export type DocKind = "cv" | "cover_letter"

export interface Doc {
  id: string
  kind: DocKind
  name: string
  fileName: string
  mime: string
  size: number
  /** The text read from the file: what the chance is worked out from. */
  body: string
  isMain: boolean
  createdAt: string
}

export interface JobLink {
  postingId: string
  kind: DocKind
  documentId: string
}

export const MAX_DOCUMENTS = 5
export const MAX_NAME = 80

export const KIND_LABEL: Record<DocKind, string> = { cv: "CV", cover_letter: "Cover letter" }

export interface Store {
  /** Whose documents these are; null while signed out. */
  userId: string | null
  status: "idle" | "loading" | "ready" | "error"
  docs: Doc[]
  links: JobLink[]
}

/** A message a person can act on; anything unexpected is shown as a plain failure, never as a code. */
export class DocumentError extends Error {}


const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  text: "text/plain",
}

/** The type the bucket accepts, from the file's ending: a browser often sends nothing for .docx or .md. */
export function mimeOf(fileName: string): string {
  return MIME_BY_EXT[fileName.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream"
}

/** A starting name from the file's: no ending, tidy spaces, short enough. */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim()

  return (base || "Untitled").slice(0, MAX_NAME)
}

/** The name if it is free among documents of that kind, otherwise "name 2", "name 3". Names are compared without case. */
export function freeName(wanted: string, taken: string[]): string {
  const clean = wanted.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || "Untitled"
  const used = new Set(taken.map((n) => n.trim().toLowerCase()))
  if (!used.has(clean.toLowerCase())) return clean
  for (let n = 2; n < 100; n++) {
    const suffix = ` ${n}`
    const candidate = `${clean.slice(0, MAX_NAME - suffix.length)}${suffix}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }

  return clean
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data)

  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** What to tell the person about a failure: our own messages as they are, anything else as a plain retry. */
export const problemText = (err: unknown): string => (err instanceof DocumentError ? err.message : "That did not work. Try again.")

/** What a database refusal means for the person. */
export function explain(error: { code?: string; message?: string } | null): DocumentError {
  const text = error?.message ?? ""
  if (error?.code === "P0001" || text.includes("document limit")) return new DocumentError(`You can keep ${MAX_DOCUMENTS} documents. Delete one to add another.`)
  if (text.includes("documents_hash_unique")) return new DocumentError("You already saved this exact file.")
  if (text.includes("documents_name_unique")) return new DocumentError("You already have a document with that name. Pick another name.")

  return new DocumentError("That did not save. Try again.")
}


/** The document of that kind attached to this job, if one is. */
export function attachedTo(s: Store, postingId: string, kind: DocKind): Doc | undefined {
  const link = s.links.find((l) => l.postingId === postingId && l.kind === kind)

  return link ? s.docs.find((d) => d.id === link.documentId) : undefined
}

/** The jobs a document is attached to. */
export function jobsUsing(s: Store, documentId: string): string[] {
  return s.links.filter((l) => l.documentId === documentId).map((l) => l.postingId)
}

export const mainCv = (s: Store): Doc | undefined => s.docs.find((d) => d.kind === "cv" && d.isMain)
