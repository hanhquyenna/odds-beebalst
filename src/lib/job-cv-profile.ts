import { useEffect, useState } from "react"
import type { CvRows } from "@/lib/cv-parse"
import { attachedTo, type Store } from "@/lib/document-model"
import { profileFromRows } from "@/lib/job-chance"
import type { Profile } from "@/lib/types"

/**
 * The profile a job's interview chance is worked out from.
 *
 * Every job starts from the saved profile (LinkedIn, or the roles, degrees and skills the person keeps there). When a CV is put on a
 * job, that job's chance is worked out from that CV alone: its roles, degrees and skills replace the profile's. Everything a CV does not
 * carry (origin, Dutch, permit, languages, pay choices) stays the profile's. Jobs with no CV of their own are not touched.
 *
 * The CV is read with the plain rules of cv-parse.ts. A CV the rules cannot read at all (no role, degree or skill found) is not
 * trusted to mean "no experience": that job keeps the profile's numbers and says so.
 */
export interface JobProfile {
  profile: Profile
  /** The CV put on this job, or null. */
  cvName: string | null
  /** True when the chance really comes from the CV; false when no CV is on the job, or the CV could not be read. */
  fromCv: boolean
}

const made = new WeakMap<Profile, Map<string, Profile | null>>()

/** The reader of CV text, loaded the first time a CV sits on a job (it is not part of the first page). Until then a CV on a job is not read. */
let reader: ((text: string) => CvRows) | null = null
let loading: Promise<void> | null = null
export function loadCvReader(): Promise<void> {
  loading ??= import("@/lib/cv-parse").then((m) => {
    reader = m.parseCv
  })

  return loading
}

/** True once CV text can be read. Pass whether any job has a CV on it; nothing is loaded for someone with none. */
export function useCvReader(needed: boolean): boolean {
  const [ready, setReady] = useState<boolean>(reader !== null)
  useEffect(() => {
    if (!needed || reader !== null) return
    let live = true
    void loadCvReader().then(() => {
      if (live) setReady(true)
    })

    return () => {
      live = false
    }
  }, [needed])

  return ready || reader !== null
}

/** The profile with this CV's rows in place of its own, or null when nothing could be read from the CV. */
export function profileFromCv(profile: Profile, body: string): Profile | null {
  let byBody = made.get(profile)
  if (!byBody) {
    byBody = new Map()
    made.set(profile, byBody)
  }
  if (!reader) return null
  if (byBody.has(body)) return byBody.get(body) ?? null
  const next = profileFromRows(profile, body, reader(body))
  byBody.set(body, next)

  return next
}

/** The profile for one job, given the person's documents. */
export function jobProfileOf(profile: Profile, store: Store, postingId: string): JobProfile {
  const cv = attachedTo(store, postingId, "cv")
  if (!cv) return { profile, cvName: null, fromCv: false }
  const own = profileFromCv(profile, cv.body)

  return own ? { profile: own, cvName: cv.name, fromCv: true } : { profile: { ...profile, cv: cv.body }, cvName: cv.name, fromCv: false }
}
