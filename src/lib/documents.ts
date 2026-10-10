/**
 * The CVs and cover letters a person keeps (table documents, files in the private bucket "documents"). Each is named, so a
 * version can be reused on any job: a job points at a document (job_documents) and never copies it. At most five per person.
 * The file is read in the browser into text (cv-file.ts), the text is what the chance is worked out from, and the original
 * file is kept so "download" gives back exactly what was uploaded.
 *
 * One store for the whole app: the Documents page, a job's panel and the chance all read the same list.
 */
import { useSyncExternalStore } from "react"
import { currentAccessToken, ANON_KEY, SUPABASE_URL, supabase } from "@/lib/supabase"
import { driveFile, driveState, renameInDrive, syncDrive, trashInDrive } from "@/lib/drive"
import { DocumentError, MAX_DOCUMENTS, MAX_NAME, explain, freeName, mimeOf, nameFromFile, sha256Hex, type Doc, type DocKind, type Store } from "@/lib/document-model"

const EMPTY: Store = { userId: null, status: "idle", docs: [], links: [] }
let store: Store = EMPTY
const listeners = new Set<() => void>()

function set(next: Store): void {
  store = next
  listeners.forEach((l) => l())
}

export function useDocumentStore(): Store {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)

      return () => listeners.delete(l)
    },
    () => store,
  )
}

const COLUMNS = "id,kind,name,file_name,mime,size_bytes,body,is_main,created_at,drive_file_id"

interface Row {
  id: string
  kind: DocKind
  name: string
  file_name: string
  mime: string
  size_bytes: number
  body: string
  is_main: boolean
  created_at: string
  drive_file_id?: string | null
}

const toDoc = (r: Row): Doc => ({ id: r.id, kind: r.kind, name: r.name, fileName: r.file_name, mime: r.mime, size: r.size_bytes, body: r.body, isMain: r.is_main, createdAt: r.created_at, inDrive: Boolean(r.drive_file_id), driveFileId: r.drive_file_id ?? null })

const byAge = (a: Doc, b: Doc): number => a.createdAt.localeCompare(b.createdAt)

/** Reads the signed-in person's documents and what is attached to which job. Safe to call again: the last call wins. */
let loadToken = 0
export async function loadDocuments(userId: string | null): Promise<void> {
  const mine = ++loadToken
  if (!userId) {
    set(EMPTY)

    return
  }
  // Another person's list must never show for a moment after signing in as someone else.
  if (store.userId !== userId) set({ ...EMPTY, userId, status: "loading" })
  else set({ ...store, status: "loading" })
  const [docs, links] = await Promise.all([
    supabase.from("documents").select(COLUMNS).order("created_at"),
    supabase.from("job_documents").select("posting_id,kind,document_id"),
  ])
  if (mine !== loadToken) return
  if (docs.error || links.error) {
    set({ ...store, status: "error" })

    return
  }
  set({
    userId,
    status: "ready",
    docs: (docs.data as Row[]).map(toDoc).sort(byAge),
    links: (links.data as Array<{ posting_id: string; kind: DocKind; document_id: string }>).map((l) => ({ postingId: l.posting_id, kind: l.kind, documentId: l.document_id })),
  })
}

export function signOutDocuments(): void {
  loadToken++
  set(EMPTY)
}

// ---------------------------------------------------------------- actions

function token(): string {
  return currentAccessToken() ?? ANON_KEY
}

const objectUrl = (path: string, authenticated: boolean): string => `${SUPABASE_URL}/storage/v1/object/${authenticated ? "authenticated/" : ""}documents/${path.split("/").map(encodeURIComponent).join("/")}`

async function putFile(path: string, file: File, mime: string): Promise<boolean> {
  const r = await fetch(objectUrl(path, false), {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token()}`, "Content-Type": mime, "x-upsert": "false" },
    body: file,
  })

  return r.ok
}

async function removeFile(path: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/storage/v1/object/documents`, {
    method: "DELETE",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: [path] }),
  }).catch(() => undefined)
}

export interface Added {
  doc: Doc
  /** True when this CV is now the one the chance is worked out from. */
  becameMain: boolean
}

/**
 * Reads the file, then saves its row and its original. The row goes first so the limit and the duplicate checks refuse
 * before anything is uploaded; if the upload then fails the row is taken back, so no half-saved document is left.
 */
export async function addDocument(file: File, kind: DocKind, wanted?: string): Promise<Added> {
  const userId = store.userId
  if (!userId) throw new DocumentError("Sign in to keep documents.")
  if (store.docs.length >= MAX_DOCUMENTS) throw new DocumentError(`You can keep ${MAX_DOCUMENTS} documents. Delete one to add another.`)

  // Read here, in the browser: the text is what the chance is worked out from. Loaded only when a file is chosen.
  const { readCvFile, CvReadError } = await import("@/lib/cv-file")
  let text: string
  try {
    text = (await readCvFile(file)).text
  } catch (err) {
    throw new DocumentError(err instanceof CvReadError ? err.message : "We could not read that file. Try a PDF or Word file.")
  }

  const mime = mimeOf(file.name)
  const hash = await sha256Hex(await file.arrayBuffer())
  const name = freeName(wanted ?? nameFromFile(file.name), store.docs.filter((d) => d.kind === kind).map((d) => d.name))
  const id = crypto.randomUUID()
  const path = `${userId}/${id}`
  // The first CV is the main one: the chance on every job starts from it.
  const main = kind === "cv" && !store.docs.some((d) => d.kind === "cv" && d.isMain)

  const inserted = await supabase
    .from("documents")
    .insert({ id, user_id: userId, kind, name, file_name: file.name.slice(0, 255), mime, size_bytes: file.size, content_hash: hash, body: text, path, is_main: main })
    .select(COLUMNS)
    .single()
  if (inserted.error) throw explain(inserted.error)

  if (!(await putFile(path, file, mime))) {
    await supabase.from("documents").delete().eq("id", id)
    throw new DocumentError("The file did not upload. Try again.")
  }

  const doc = toDoc(inserted.data as Row)
  set({ ...store, docs: [...store.docs, doc].sort(byAge) })
  // With Drive connected the file goes on into their odds folder there; it is already safe here if that fails.
  if (driveState().status === "on") void syncWithDrive()

  return { doc, becameMain: main }
}

export async function renameDocument(id: string, wanted: string): Promise<void> {
  const doc = store.docs.find((d) => d.id === id)
  if (!doc) return
  const name = wanted.replace(/\s+/g, " ").trim().slice(0, MAX_NAME)
  if (name === "" || name === doc.name) return
  if (store.docs.some((d) => d.id !== id && d.kind === doc.kind && d.name.trim().toLowerCase() === name.toLowerCase())) throw new DocumentError("You already have a document with that name.")
  const r = await supabase.from("documents").update({ name }).eq("id", id)
  if (r.error) throw explain(r.error)
  set({ ...store, docs: store.docs.map((d) => (d.id === id ? { ...d, name } : d)) })
  if (doc.inDrive) renameInDrive(id)
}

export async function makeMain(id: string): Promise<void> {
  const r = await supabase.rpc("set_main_document", { doc: id })
  if (r.error) throw explain(r.error)
  set({ ...store, docs: store.docs.map((d) => ({ ...d, isMain: d.id === id })) })
}

/**
 * Removes the document and its file. When it was the main CV the next CV takes over, so the chance never silently
 * rests on nothing; the new main (if any) is returned.
 */
export async function removeDocument(id: string): Promise<Doc | null> {
  const doc = store.docs.find((d) => d.id === id)
  if (!doc) return null
  const row = await supabase.from("documents").select("path").eq("id", id).single()
  // The file first: the read and delete rules follow the row, so once the row is gone the file could not be removed.
  if (doc.inDrive) await trashInDrive(id)
  if (!row.error) await removeFile((row.data as { path: string }).path)
  const r = await supabase.from("documents").delete().eq("id", id)
  if (r.error) throw explain(r.error)
  const rest = store.docs.filter((d) => d.id !== id)
  set({ ...store, docs: rest, links: store.links.filter((l) => l.documentId !== id) })
  if (!doc.isMain) return null
  const next = rest.find((d) => d.kind === "cv")
  if (!next) return null
  await makeMain(next.id)

  return store.docs.find((d) => d.id === next.id) ?? null
}

/** Puts a document on a job, in place of the one of that kind already there. */
export async function attachDocument(postingId: string, documentId: string): Promise<void> {
  const userId = store.userId
  const doc = store.docs.find((d) => d.id === documentId)
  if (!userId || !doc) return
  const r = await supabase.from("job_documents").upsert({ user_id: userId, posting_id: postingId, kind: doc.kind, document_id: documentId }, { onConflict: "user_id,posting_id,kind" })
  if (r.error) throw explain(r.error)
  set({ ...store, links: [...store.links.filter((l) => !(l.postingId === postingId && l.kind === doc.kind)), { postingId, kind: doc.kind, documentId }] })
}

export async function detachDocument(postingId: string, kind: DocKind): Promise<void> {
  const r = await supabase.from("job_documents").delete().eq("posting_id", postingId).eq("kind", kind)
  if (r.error) throw explain(r.error)
  set({ ...store, links: store.links.filter((l) => !(l.postingId === postingId && l.kind === kind)) })
}

/** Gives the person the original file back, exactly as uploaded. */
export async function downloadDocument(id: string): Promise<void> {
  const row = await supabase.from("documents").select("path,file_name,drive_file_id").eq("id", id).single()
  if (row.error) throw new DocumentError("We could not find that file.")
  const { path, file_name, drive_file_id } = row.data as { path: string; file_name: string; drive_file_id: string | null }
  let blob: Blob
  if (drive_file_id) {
    try {
      blob = await driveFile(id)
    } catch (err) {
      throw new DocumentError(err instanceof Error ? err.message : "We could not get that file from your Drive.")
    }
  } else {
    const r = await fetch(objectUrl(path, true), { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token()}` } })
    if (!r.ok) throw new DocumentError("We could not download that file. Try again.")
    blob = await r.blob()
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = file_name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Keeps odds and their Drive the same: files not yet in Drive are moved there, and a file changed in Drive (they edited their
 * CV there) is read again, so its text, and the chance worked out from it, follow. One sync at a time.
 */
let syncing: Promise<void> | null = null
export function syncWithDrive(): Promise<void> {
  syncing ??= runSync().finally(() => {
    syncing = null
  })

  return syncing
}

async function runSync(): Promise<void> {
  const userId = store.userId
  const result = await syncDrive().catch(() => null)
  if (!result || !userId || store.userId !== userId) return
  // Moved files now have their Drive ids: read the list again so "Open in Drive" points at them.
  if (result.moved > 0) await loadDocuments(userId)
  if (result.changed.length === 0) return
  const { readCvFile } = await import("@/lib/cv-file")
  for (const change of result.changed) {
    const doc = store.docs.find((d) => d.id === change.id)
    if (!doc) continue
    try {
      const file = new File([await driveFile(doc.id)], doc.fileName, { type: doc.mime })
      const body = (await readCvFile(file)).text
      const hash = await sha256Hex(await file.arrayBuffer())
      const r = await supabase.from("documents").update({ body, content_hash: hash, size_bytes: file.size, drive_md5: change.md5 }).eq("id", doc.id)
      if (r.error) {
        // Same file as another document now: keep the old text, but stop reading it again on every visit.
        await supabase.from("documents").update({ drive_md5: change.md5 }).eq("id", doc.id)
        continue
      }
      if (store.userId !== userId) return
      set({ ...store, docs: store.docs.map((d) => (d.id === doc.id ? { ...d, body, size: file.size } : d)) })
    } catch {
      // Unreadable now (a Google Doc saved over it, a broken file): the text from before stays.
    }
  }
}
