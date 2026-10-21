import { useEffect, useMemo } from "react"
import { pinChance, usePins } from "@/lib/chance-pins"
import { useData } from "@/lib/data"
import { NO_WHAT_IF, isWhatIfActive, standing, type Standing, type WhatIf } from "@/lib/engine"
import { chanceInputs, pinScale, pinToWrite, withPinned, type PinnedChance } from "@/lib/job-chance"
import { useJobProfile, useJobProfileSettled, useJobStrength } from "@/lib/use-documents"
import type { Posting, Profile } from "@/lib/types"
import type { Strength } from "@/lib/strength"

interface Live {
  live: Standing | null
  profile: Profile
  strength: Strength | null
  referral: boolean
  settled: boolean
  pin: PinnedChance | undefined
  loaded: boolean
  inputs: string
  /** The fingerprint the kept figure is checked against: until everything is in, the kept figure stands as it is (a half-loaded profile is not a change the person made). */
  key: string
}

function useLive(post: Posting): Live {
  const data = useData()
  const profile = useJobProfile(post.id)
  const strength = useJobStrength(post)
  const referral = data.referrals.has(post.id)
  const profileSettled = useJobProfileSettled(post.id)
  const pins = usePins()
  const { reference, shares } = data
  const live = useMemo(() => (reference && shares ? standing(post, profile, reference, shares, NO_WHAT_IF, referral, strength) : null), [post, profile, reference, shares, referral, strength])
  const inputs = useMemo(() => chanceInputs(profile, referral, strength), [profile, referral, strength])
  const settled = data.factsSettled && profileSettled
  const pin = pins.byJob.get(post.id)

  return { live, profile, strength, referral, settled, pin, loaded: pins.loaded, inputs, key: settled ? inputs : (pin?.inputs ?? inputs) }
}

/**
 * A job's interview chance as every surface shows it (job-chance.ts): worked out from the posting as stored, the profile for this job (its
 * own CV, or the saved one), a referral and the profile reading; then the figure kept for this person and job in its place while what it
 * came from still holds. The first time a job is worked out with everything in, that figure is kept. Pass the posting as stored, never
 * one enriched from its text (the job page): that is what every other surface sees.
 *
 * `base` is the job with nothing ticked; `st` is the same with `whatIf` (the job page's recommendations), moved from the kept figure.
 */
export function useJobChance(post: Posting, whatIf: WhatIf = NO_WHAT_IF): { base: Standing | null; st: Standing | null } {
  const { reference, shares } = useData()
  const { live, profile, strength, referral, settled, pin, loaded, inputs, key } = useLive(post)
  const alt = useMemo(() => (reference && shares && isWhatIfActive(whatIf) ? standing(post, profile, reference, shares, whatIf, referral, strength) : live), [post, profile, reference, shares, whatIf, referral, strength, live])
  useEffect(() => {
    if (!settled || !loaded) return
    const next = pinToWrite(live, pin, inputs)
    if (next) pinChance(post.id, next)
  }, [settled, loaded, live, pin, inputs, post.id])

  return useMemo(() => ({ base: live && withPinned(live, pin, key), st: alt && live && withPinned(alt, pin, key, live) }), [live, alt, pin, key])
}

/**
 * What a chance worked out from this posting is multiplied by to show the kept figure (1 when none is kept). For a page that works the job
 * out from more than the stored posting (the job page reads the posting's text): its numbers then show the same figure as everywhere else,
 * and what a recommendation adds moves by the same factor. Never keeps a figure itself.
 */
export function usePinnedScale(post: Posting): number {
  const { live, pin, key } = useLive(post)

  return pinScale(live, pin, key)
}
