import { useEffect, useMemo, useState } from "react"
import { useData } from "@/lib/data"
import { NO_WHAT_IF, standing, type Standing } from "@/lib/engine"
import { stripMarkup } from "@/lib/format"
import { fetchBody, fetchJevRequirements } from "@/lib/jobs"
import { extractRequirements, fromJev, namedSkills, relaxedGates, tiersOf, type Requirement } from "@/lib/requirements"
import { useJobProfile, useJobStrength } from "@/lib/use-documents"
import { useJobChance, usePinnedScale } from "@/lib/use-job-chance"
import { scaled } from "@/lib/job-chance"
import type { Posting } from "@/lib/types"

export interface JobModel {
  /** The posting with its text read: skills and how much the posting insists on each. */
  job: Posting
  /** The posting text, null while it loads, "" when there is none. */
  body: string | null
  requirements: Requirement[]
  /** The person's standing for this job, null while the reference data loads. */
  st: Standing | null
}

/**
 * What the job page needs read from one posting: its text, the requirements in it (Jev's reading when there is one, else the headings and
 * cue words), and how this person stands against it, from the CV put on this job or the saved profile. The same reading JobDetail does.
 */
export function useJobModel(post: Posting): JobModel {
  const data = useData()
  const [fetched, setFetched] = useState<{ id: string; text: string } | null>(null)
  const body = post.body !== undefined ? post.body : fetched?.id === post.id ? fetched.text : null
  useEffect(() => {
    if (post.body !== undefined) return
    let live = true
    fetchBody(post.id)
      .then((text) => live && setFetched({ id: post.id, text }))
      .catch(() => live && setFetched({ id: post.id, text: "" }))

    return () => {
      live = false
    }
  }, [post.id, post.body])

  const [jevRead, setJev] = useState<{ id: string; rows: Awaited<ReturnType<typeof fetchJevRequirements>> } | null>(null)
  useEffect(() => {
    let live = true
    void fetchJevRequirements(post.id).then((rows) => {
      if (live) setJev({ id: post.id, rows })
    })

    return () => {
      live = false
    }
  }, [post.id])
  const jev = jevRead?.id === post.id ? jevRead.rows : null
  const requirements = useMemo(() => (jev && jev.length > 0 ? fromJev(jev) : body ? extractRequirements(stripMarkup(body)) : []), [body, jev])
  const job = useMemo<Posting>(
    () => (body ? { ...post, ...relaxedGates(post, requirements), skills: namedSkills(stripMarkup(body), requirements), tiers: tiersOf(requirements) } : { ...post, skills: [] }),
    [post, body, requirements],
  )
  const referral = data.referrals.has(post.id)
  const strength = useJobStrength(post)
  const profile = useJobProfile(post.id)
  // Read from the posting's text too, then moved onto the figure kept for this job (job-chance.ts): the same number as everywhere else.
  useJobChance(post)
  const scale = usePinnedScale(job)
  const st = useMemo(
    () => (data.reference && data.shares ? scaled(standing(job, profile, data.reference, data.shares, NO_WHAT_IF, referral, strength), scale) : null),
    [job, profile, data.reference, data.shares, referral, strength, scale],
  )

  return { job, body, requirements, st }
}
