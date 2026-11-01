import { useMemo } from "react"
import { useData, type Data } from "@/lib/data"
import { hearBackFor, type HearBack } from "@/lib/hear-back"
import type { Posting } from "@/lib/types"

/** The tag for one job, or null. Works out the whole pool once per profile and keeps it. */
export function useHearBack(post: Posting): HearBack | null {
  const data = useData()
  const map = useHearBackMap(data)

  return map.get(post.id) ?? null
}

export function useHearBackMap(data: Data): Map<string, HearBack> {
  const { postings, profile, referrals, strengthFor } = data

  return useMemo(() => hearBackFor(postings, profile, referrals, (post) => strengthFor(post)), [postings, profile, referrals, strengthFor])
}
