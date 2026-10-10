import { useCallback, useEffect, useMemo, useRef } from "react"
import { useData } from "@/lib/data"
import type { Profile } from "@/lib/types"
import { attachedTo, mainCv, type DocKind } from "@/lib/document-model"
import { addDocument, loadDocuments, signOutDocuments, syncWithDrive, useDocumentStore, type Added } from "@/lib/documents"
import { loadDrive, useDrive } from "@/lib/drive"

/**
 * Mounted once. Loads the signed-in person's documents, and keeps the profile's CV text equal to the main CV: the chance on
 * every job is worked out from profile.cv (engine.ts), so the main CV in Documents is what it rests on. It waits until the
 * stored profile has arrived, so a profile still on its way down is never overwritten.
 */
export function useDocumentsSync(): void {
  const data = useData()
  const store = useDocumentStore()
  const userId = data.session?.user.id ?? null

  useEffect(() => {
    if (userId) void loadDocuments(userId)
    else signOutDocuments()
    void loadDrive(userId)
  }, [userId])

  // Once per sign-in, when both are known: move anything not yet in Drive and read again what was changed there.
  const drive = useDrive()
  const synced = useRef<string | null>(null)
  useEffect(() => {
    if (!userId || store.status !== "ready" || drive.status !== "on" || synced.current === userId) return
    synced.current = userId
    void syncWithDrive()
  }, [userId, store.status, drive.status])

  const main = mainCv(store)
  const { profile, profileSaved, setProfile } = data
  useEffect(() => {
    if (store.status !== "ready" || !main || !profileSaved) return
    if (profile.cv !== main.body || profile.cvName !== main.name) setProfile({ ...profile, cv: main.body, cvName: main.name })
  }, [store.status, main, profile, profileSaved, setProfile])
}

/**
 * Saves a file as a document. A first CV becomes the main one and, as an upload to the profile used to, also fills the roles,
 * degrees and skills that are still empty, so the CV alone is enough to be judged. Returns a line saying what was filled.
 */
export function useAddDocument(): (file: File, kind: DocKind) => Promise<{ added: Added; note: string | null }> {
  const data = useData()
  const { profile, setProfile } = data

  return useCallback(
    async (file, kind) => {
      const added = await addDocument(file, kind)
      let note: string | null = null
      if (added.becameMain) {
        const p = profile
        const base = { ...p, cv: added.doc.body, cvName: added.doc.name }
        try {
          const { describeFilled, fillFromCv } = await import("@/lib/cv-parse")
          const f = fillFromCv(p, added.doc.body)
          setProfile({ ...base, ...f.patch })
          note = describeFilled(f.filled, p.positions.length + p.education.length + p.skills.length > 0)
        } catch {
          setProfile(base)
        }
      }

      return { added, note }
    },
    [profile, setProfile],
  )
}

/**
 * The profile this job's chance is worked out from: the saved profile, with the CV put on this job (when there is one) in place of
 * the main CV. Every number on the job page must come from this one, or two figures on one page would disagree.
 */
export function useJobProfile(postingId: string): Profile {
  const { profile } = useData()
  const store = useDocumentStore()
  const cv = attachedTo(store, postingId, "cv")

  return useMemo(() => (cv ? { ...profile, cv: cv.body } : profile), [profile, cv])
}
