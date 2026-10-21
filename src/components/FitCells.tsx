import { useMemo } from "react"
import { Moved } from "@/components/Moved"
import { useData } from "@/lib/data"
import { pct, point, standing, type Standing } from "@/lib/engine"
import { IMPORT_HINT, openLinkedInImport } from "@/lib/open-profile"
import type { Posting } from "@/lib/types"
import { useJobProfile, useJobStrength } from "@/lib/use-documents"
import { useJobChance, usePinnedScale } from "@/lib/use-job-chance"

/** How you stand on one job, with the chance every surface shows for it (job-chance.ts). Null until the reference data has loaded. */
export function useFit(post: Posting): Standing | null {
  return useJobChance(post).base
}

/**
 * What the interview chance was before anything you did: the same job with no referral and nothing ticked. Whatever you do on the job (a referral, a recommendation) is shown against it,
 * the same on every job and every place the number appears. Null where there is no estimate.
 */
export function useOriginalChance(post: Posting): number | null {
  const { reference, shares } = useData()
  const profile = useJobProfile(post.id)
  const strength = useJobStrength(post)
  // Moved by the same factor as the figure shown (the kept one), so "was 2.1%, now 2.7%" compares like with like.
  const scale = usePinnedScale(post)

  return useMemo(() => {
    if (!reference || !shares) return null
    const r = standing(post, profile, reference, shares, undefined, false, strength).rate

    return r ? r.mid * scale : null
  }, [post, profile, reference, shares, strength, scale])
}

/**
 * The interview chance, the one number every job has: the higher it is, the better your profile fits. A range of whole percentages. Nothing is
 * a hard gate: what the job asks for and you have not ticked is named in the hover, and ticking it on the job is a recommendation.
 */
export function ChanceCell({ st, post }: { st: Standing | null; post: Posting }): React.JSX.Element {
  const original = useOriginalChance(post)
  if (!st) {
    return <span className="text-muted-foreground">…</span>
  }
  if (st.needsProfile) {
    return (
      // No profile yet, so no chance to give: a "?" that leads to the import, never a "0%" that reads like a real figure.
      <button type="button" title={IMPORT_HINT} aria-label={IMPORT_HINT} onClick={openLinkedInImport} className="cursor-pointer font-medium tabular-nums underline decoration-dotted underline-offset-4 hover:decoration-solid">
        ?
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
      <Moved delta={original !== null ? (st.rate.mid - original) * 100 : 0} min={0.05} wasText={original === null ? "" : point(original)}>
        {point(st.rate.mid)}
      </Moved>
    </span>
  )
}
