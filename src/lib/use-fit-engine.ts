import { useCallback, useMemo } from "react"
import { useData } from "@/lib/data"
import { useDocumentStore } from "@/lib/documents"
import { createFitEngine, type FitEngine } from "@/lib/fit-engine"
import { jobProfileOf, useCvReader } from "@/lib/job-cv-profile"

/** The fit engine for the signed-in person's own data, rebuilt only when the profile, the jobs or the applications change. Null until the reference data is in. */
export function useFitEngine(): FitEngine | null {
  const { postings, applications, profile, reference, shares, referrals, strengthFor } = useData()
  const store = useDocumentStore()
  const ready = useCvReader(store.links.some((l) => l.kind === "cv"))
  // Only the jobs that have a CV on them differ from the saved profile; every other job keeps its figure.
  const cvProfileFor = useCallback(
    (postingId: string) => {
      const j = jobProfileOf(profile, store, postingId)

      return j.fromCv ? j.profile : null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, store, ready],
  )

  return useMemo(
    () => (reference && shares ? createFitEngine({ postings, profile, reference, shares, referrals, strengthFor, cvProfileFor, stages: new Map(applications.map((a) => [a.posting_id, a.stage])) }) : null),
    [postings, applications, profile, reference, shares, referrals, strengthFor, cvProfileFor],
  )
}
