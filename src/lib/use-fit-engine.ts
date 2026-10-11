import { useMemo } from "react"
import { useData } from "@/lib/data"
import { createFitEngine, type FitEngine } from "@/lib/fit-engine"

/** The fit engine for the signed-in person's own data, rebuilt only when the profile, the jobs or the applications change. Null until the reference data is in. */
export function useFitEngine(): FitEngine | null {
  const { postings, applications, profile, reference, shares, referrals, strengthFor } = useData()

  return useMemo(() => (reference && shares ? createFitEngine({ postings, profile, reference, shares, referrals, strengthFor, stages: new Map(applications.map((a) => [a.posting_id, a.stage])) }) : null), [postings, applications, profile, reference, shares, referrals, strengthFor])
}
