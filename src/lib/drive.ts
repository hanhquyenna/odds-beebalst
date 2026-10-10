/**
 * The person's own Google Drive as the place their documents' files are kept (edge function `drive`, migrations/
 * 20261010150000_google_drive.sql). Connecting makes a folder "odds" with "CVs" and "Cover letters" in it and moves every file
 * there; from then on each new upload is moved there too. The text of each document stays in odds, so the chance and Claude
 * never wait on Drive. A file changed in Drive (an edited CV) is read again here, so odds follows what is in their Drive.
 */
import { useSyncExternalStore } from "react"
import { ANON_KEY, SUPABASE_URL, currentAccessToken, supabase } from "@/lib/supabase"

export interface DriveState {
  status: "unknown" | "off" | "on"
  email: string | null
  /** The "odds" folder in their Drive, to open it there. */
  folder: string | null
  /** Documents whose file is no longer in their Drive (deleted or moved out of the odds folder). Their text still works. */
  missing: ReadonlySet<string>
}

const OFF: DriveState = { status: "unknown", email: null, folder: null, missing: new Set() }
let state: DriveState = OFF
const listeners = new Set<() => void>()

function set(next: DriveState): void {
  state = next
  listeners.forEach((l) => l())
}

export function useDrive(): DriveState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)

      return () => listeners.delete(l)
    },
    () => state,
  )
}

export const driveState = (): DriveState => state

const folderUrl = (id: string): string => `https://drive.google.com/drive/folders/${id}`

async function call(route: string, body: Record<string, unknown> = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/drive/${route}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${currentAccessToken() ?? ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function errorOf(r: Response, fallback: string): Promise<Error> {
  const body = (await r.json().catch(() => ({}))) as { error?: string; connected?: boolean }
  if (body.connected === false) set({ ...state, status: "off", email: null, folder: null, missing: new Set() })

  return new Error(body.error ?? fallback)
}

/** Whether this person has Drive connected (one small read; the secret token is never readable from here). */
export async function loadDrive(userId: string | null): Promise<void> {
  if (!userId) {
    set(OFF)

    return
  }
  const { data, error } = await supabase.from("drive_links").select("email,root_id").maybeSingle()
  if (error) {
    // The table is not there yet (the migration is not applied): Drive stays hidden rather than broken.
    set({ ...OFF, status: "off" })

    return
  }
  const row = data as { email: string | null; root_id: string } | null
  set(row ? { ...state, status: "on", email: row.email, folder: folderUrl(row.root_id) } : { ...OFF, status: "off" })
}

/** Sends the browser to Google's consent screen; it comes back to /?drive=connected (or cancelled, failed). */
export async function connectDrive(): Promise<void> {
  const r = await call("start", { returnTo: `${window.location.origin}/` })
  if (!r.ok) throw await errorOf(r, "Could not reach Google. Try again.")
  const { url } = (await r.json()) as { url: string }
  window.location.assign(url)
}

/** Brings the files back into odds and lets go of Drive. The files stay in their Drive too. */
export async function disconnectDrive(): Promise<void> {
  const r = await call("disconnect")
  if (!r.ok) throw await errorOf(r, "Could not disconnect. Try again.")
  set({ ...OFF, status: "off" })
}

export interface SyncResult {
  /** Files that went from odds into Drive on this sync. */
  moved: number
  /** Files changed in Drive since odds last read them, with Drive's checksum now. */
  changed: Array<{ id: string; md5: string }>
  /** Files renamed in Drive: their documents carry the new name now. */
  renamed: Array<{ id: string; name: string }>
}

/** Moves anything not yet in Drive, and finds what changed or went missing there. Null when Drive is not connected. */
export async function syncDrive(): Promise<SyncResult | null> {
  if (state.status !== "on") return null
  const r = await call("sync")
  if (!r.ok) {
    await errorOf(r, "")

    return null
  }
  const out = (await r.json()) as { email: string | null; folder: string; moved: number; changed: SyncResult["changed"]; renamed?: SyncResult["renamed"]; missing: string[] }
  set({ ...state, status: "on", email: out.email, folder: out.folder, missing: new Set(out.missing) })

  return { moved: out.moved, changed: out.changed, renamed: out.renamed ?? [] }
}

/** The original file from their Drive. */
export async function driveFile(id: string): Promise<Blob> {
  const r = await call("file", { id })
  if (!r.ok) throw await errorOf(r, "We could not get that file from your Drive.")

  return r.blob()
}

/** Keeps the Drive file's name the same as the document's. Best effort: the name in odds is what counts. */
export function renameInDrive(id: string): void {
  if (state.status === "on") void call("rename", { id }).catch(() => undefined)
}

/** Puts the Drive file in the Drive bin before its document is deleted (it can be got back from there for 30 days). */
export async function trashInDrive(id: string): Promise<void> {
  if (state.status === "on") await call("trash", { id }).catch(() => undefined)
}

/** Reads ?drive= that Google's round trip left on the address, once, and takes it off. */
export function takeDriveReturn(): "connected" | "cancelled" | "failed" | null {
  const params = new URLSearchParams(window.location.search)
  const v = params.get("drive")
  if (v !== "connected" && v !== "cancelled" && v !== "failed") return null
  params.delete("drive")
  window.history.replaceState(null, "", `${window.location.pathname}${params.size > 0 ? `?${params}` : ""}${window.location.hash}`)

  return v
}
