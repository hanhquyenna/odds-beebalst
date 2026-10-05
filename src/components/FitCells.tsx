import { useMemo } from "react"
import { Moved } from "@/components/Moved"
import { useData } from "@/lib/data"
import { pct, point, standing, type Standing } from "@/lib/engine"
import { IMPORT_HINT, openLinkedInImport } from "@/lib/open-profile"
import type { Posting } from "@/lib/types"

/** How you stand on one job, worked out from your profile. Null until the reference data has loaded. */
export function useFit(post: Posting): Standing | null {
  const data = useData()
  const referral = data.referrals.has(post.id)
  const reference = data.reference
  const shares = data.shares
  const profile = data.profile
  const strengthFor = data.strengthFor

  return useMemo(
    (): Standing | null => (reference && shares ? standing(post, profile, reference, shares, undefined, referral, strengthFor(post)) : null),
    [post, profile, reference, shares, referral, strengthFor],
  )
}

/**
 * What the interview chance was before anything you did: the same job with no referral and nothing ticked. Whatever you do on the job (a referral, a recommendation) is shown against it,
 * the same on every job and every place the number appears. Null where there is no estimate.
 */
export function useOriginalChance(post: Posting): number | null {
  const { profile, reference, shares, strengthFor } = useData()

  return useMemo(() => {
    if (!reference || !shares) return null
    const r = standing(post, profile, reference, shares, undefined, false, strengthFor(post)).rate

    return r && !r.thin ? r.mid : null
  }, [post, profile, reference, shares, strengthFor])
}

/**
 * The interview chance, the one number every job has: the higher it is, the better your profile fits. A range of whole percentages. Nothing is
 * a hard gate: what the job asks for and you have not ticked is named in the hover, and ticking it on the job is a recommendation.
 */
export function ChanceCell({ st, post }: { st: Standing | null; post?: Posting }): React.JSX.Element {
  const original = useOriginalChance(post ?? ({ id: "", employer: "" } as Posting))
  if (!st) {
    return <span className="text-muted-foreground">…</span>
  }
  if (st.needsProfile) {
    return (
      <button type="button" title={IMPORT_HINT} aria-label={`0%. ${IMPORT_HINT}`} onClick={openLinkedInImport} className="cursor-pointer font-medium tabular-nums underline decoration-dotted underline-offset-4 hover:decoration-solid">
        0%
      </button>
    )
  }
  if (!st.rate) {
    return (
      <span className="text-muted-foreground" title="Too few similar jobs to give a range we would stand behind">
        No estimate
      </span>
    )
  }
  return (
    <span className="font-medium tabular-nums" title={`Estimate ${point(st.rate.mid)} (studies range ${pct(st.rate.low, 1)}–${pct(st.rate.high, 1)}) per application${st.rate.thin ? ". Few postings of this kind to compare with." : ""}${st.failing > 0 ? `. This job also asks for: ${st.gates.filter((g) => g.status === "fail").map((g) => g.name).join(", ")}.` : ""}`}>
      <Moved delta={post && original !== null && !st.rate.thin ? (st.rate.mid - original) * 100 : 0} min={0.05} wasText={original === null ? "" : point(original)}>
        {point(st.rate.mid)}
      </Moved>
    </span>
  )
}
