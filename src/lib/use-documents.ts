import { useCallback, useEffect, useMemo } from "react"
import { useData } from "@/lib/data"
import type { Posting, Profile } from "@/lib/types"
import { mainCv, type DocKind } from "@/lib/document-model"
import { addDocument, loadDocuments, signOutDocuments, syncWithDrive, useDocumentStore, type Added } from "@/lib/documents"
import { loadDrive, useDrive } from "@/lib/drive"
import { jobProfileOf, useCvReader, type JobProfile } from "@/lib/job-cv-profile"
import type { Strength } from "@/lib/strength"
import { takePendingCv } from "@/lib/pending-cv"

const DRIVE_SYNC_GAP_MS = 30_000

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

  // With Drive connected: a sync once both are known, then again whenever they come back to this tab (they may have just
  // edited or renamed a file in Drive), at most every half minute.
  const drive = useDrive()
  const ready = Boolean(userId) && store.status === "ready" && drive.status === "on"
  useEffect(() => {
    if (!ready) return
    let last = 0
    const run = (): void => {
      if (document.visibilityState !== "visible" || Date.now() - last < DRIVE_SYNC_GAP_MS) return
      last = Date.now()
      void syncWithDrive()
    }
    run()
    document.addEventListener("visibilitychange", run)
    window.addEventListener("focus", run)

    return () => {
      document.removeEventListener("visibilitychange", run)
      window.removeEventListener("focus", run)
    }
  }, [ready, userId])

  // The CV uploaded on the way in goes into Documents as the main CV once there is an account to keep it in.
  useEffect(() => {
    if (!userId || store.status !== "ready" || store.docs.some((d) => d.kind === "cv")) return
    const file = takePendingCv()
    if (file) void addDocument(file, "cv").catch(() => undefined)
  }, [userId, store.status, store.docs])

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
export function useAddDocument(): (file: File, kind: DocKind, name?: string, postingId?: string) => Promise<{ added: Added; note: string | null }> {
  const data = useData()
  const { profile, setProfile } = data

  return useCallback(
    async (file, kind, name, postingId) => {
      const added = await addDocument(file, kind, name, postingId)
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
 * The profile this job's chance is worked out from: the saved profile, or, when a CV is put on this job, the roles, degrees and skills of
 * that CV (job-cv-profile.ts). Every number on the job page must come from this one, or two figures on one page would disagree.
 */
export function useJobProfileInfo(postingId: string): JobProfile {
  const { profile } = useData()
  const store = useDocumentStore()
  const ready = useCvReader(store.links.some((l) => l.postingId === postingId && l.kind === "cv"))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => jobProfileOf(profile, store, postingId), [profile, store, postingId, ready])
}

/**
 * True once this job's profile is final: the documents are in and, when a CV sits on the job, it has been read. Before that the chance
 * is the saved profile's for a moment, and is not kept (job-chance.ts).
 */
export function useJobProfileSettled(postingId: string): boolean {
  const store = useDocumentStore()
  const onJob = store.links.some((l) => l.postingId === postingId && l.kind === "cv")
  const ready = useCvReader(onJob)

  return store.status === "ready" && (!onJob || ready)
}

export function useJobProfile(postingId: string): Profile {
  return useJobProfileInfo(postingId).profile
}

/**
 * How strong the saved profile reads for this job (strength.ts). That reading is of the saved profile, so a job whose chance comes from
 * its own CV does not use it: the CV alone decides.
 */
export function useJobStrength(post: Pick<Posting, "id" | "family">): Strength | null {
  const { strengthFor } = useData()
  const { fromCv } = useJobProfileInfo(post.id)

  return fromCv ? null : strengthFor(post)
}
