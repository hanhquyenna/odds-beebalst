import { standing } from "@/lib/engine"
import type { Reference } from "@/lib/jobs"
import { industryByEmployer, profileFitFor, profileSignals, type ProfileFit } from "@/lib/profile-fit"
import type { Strength } from "@/lib/strength"
import type { Application, Posting, Profile } from "@/lib/types"

/**
 * What the lists of jobs on the Jobs and Home pages and the Claude connector share: for any job, your chance and what your profile says
 * about it. Each job's standing is worked out once per profile and kept, so a list of a thousand jobs does the work once, however many
 * parts ask. Plain function (no React): the app wraps it in use-fit-engine.ts, the connector calls it directly.
 */
export interface FitEngine {
  chanceOf: (post: Posting) => number
  fitOf: (post: Posting) => ProfileFit
  /** How much a saved job counts for what you like: an application says more than a bookmark. */
  weightOf: (post: Posting) => number
}

/** What a stage of an application says about interest: applied 1.5, an interview 2.2, an offer 2.5, a no 0.7, withdrawn 0.4; only saved is 1. */
export const STAGE_WEIGHT: Record<Application["stage"], number> = { applied: 1.5, interview: 2.2, offer: 2.5, hired: 2.5, rejected: 0.7, no_reply: 0.7, withdrawn: 0.4 }

export interface FitEngineInput {
  postings: ReadonlyArray<Posting>
  profile: Profile
  reference: Reference
  shares: Parameters<typeof standing>[3]
  referrals?: ReadonlySet<string>
  strengthFor?: (post: Pick<Posting, "family">) => Strength | null
  /** The stage of each job you applied to, by posting id. */
  stages?: ReadonlyMap<string, Application["stage"]>
}

export function createFitEngine({ postings, profile, reference, shares, referrals, strengthFor, stages }: FitEngineInput): FitEngine {
  const signals = profileSignals(profile, industryByEmployer(postings))
  const stood = new Map<string, ReturnType<typeof standing>>()
  const stand = (post: Posting): ReturnType<typeof standing> => {
    let st = stood.get(post.id)
    if (!st) {
      st = standing(post, profile, reference, shares, undefined, referrals?.has(post.id) ?? false, strengthFor?.(post) ?? null)
      stood.set(post.id, st)
    }

    return st
  }
  const fits = new Map<string, ProfileFit>()

  return {
    chanceOf: (post) => stand(post).rate?.mid ?? 0,
    fitOf: (post) => {
      let f = fits.get(post.id)
      if (!f) {
        f = profileFitFor(post, stand(post), signals)
        fits.set(post.id, f)
      }

      return f
    },
    weightOf: (post) => {
      const stage = stages?.get(post.id)

      return stage ? STAGE_WEIGHT[stage] : 1
    },
  }
}
