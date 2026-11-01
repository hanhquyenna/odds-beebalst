/**
 * The last good answer of a slow public read (the job pool), kept in this browser's IndexedDB so a return visit paints at once
 * and refreshes behind it. IndexedDB, not localStorage: the pool runs to several MB, past localStorage's quota. Every failure (a private
 * window, blocked or full storage, an old entry) reads as "nothing kept", and the app asks the network as on a first visit.
 */

/** Raised when what is kept changes shape, so an older entry is ignored instead of misread. */
export const CACHE_VERSION = 2

const DB_NAME = "odds-cache"
const STORE = "kv"

let opening: Promise<IDBDatabase> | null = null

/** One kept answer: the shape version, a stamp of the data it was made from, when it was kept, and the answer itself. */
export interface Cached<T> {
  version: number
  stamp: string
  at: number
  data: T
}

/** Reads a kept answer, or null when there is none, it is from another version, or storage is blocked. */
export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    const db = await openDb()
    const raw = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key)
      request.onsuccess = (): void => resolve(request.result)
      request.onerror = (): void => reject(request.error)
    })

    return unwrap<T>(raw)
  } catch {
    return null
  }
}

/** Keeps an answer against a stamp of the data. A quota error or blocked storage just skips keeping it. */
export async function writeCache(key: string, stamp: string, data: unknown): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.objectStore(STORE).put(wrap(stamp, data), key)
      tx.oncomplete = (): void => resolve()
      tx.onerror = (): void => reject(tx.error)
      tx.onabort = (): void => reject(tx.error)
    })
  } catch {
    return
  }
}

/** A kept answer in the current version, stamped now. */
export function wrap<T>(stamp: string, data: T): Cached<T> {
  return { version: CACHE_VERSION, stamp: stamp, at: Date.now(), data: data }
}

/** What was read back, if it is a kept answer of the current version; anything else is null. */
export function unwrap<T>(raw: unknown): Cached<T> | null {
  if (typeof raw !== "object" || raw === null) {
    return null
  }
  const entry = raw as Partial<Cached<T>>
  if (entry.version !== CACHE_VERSION || typeof entry.stamp !== "string" || typeof entry.at !== "number" || entry.data === undefined) {
    return null
  }

  return entry as Cached<T>
}

/** The cache database, opened once per page. A failed open is forgotten, so the next read tries again. */
function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = (): void => {
      request.result.createObjectStore(STORE)
    }
    request.onsuccess = (): void => resolve(request.result)
    request.onerror = (): void => reject(request.error)
  }).catch((e: unknown) => {
    opening = null
    throw e
  })

  return opening
}
