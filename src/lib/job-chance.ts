import type { CvRows } from "@/lib/cv-parse"
import type { Standing } from "@/lib/engine"
import type { Strength } from "@/lib/strength"
import type { Profile } from "@/lib/types"

/**
 * One interview chance per person per job, the same everywhere it shows (the job list, the job page, the extension's side panel, the badge
 * beside a posting on LinkedIn or the employer's site, Claude). Each place used to work the chance out on its own, from slightly different
 * inputs (one without the CV put on the job, one without the profile reading, one a day later when the posting had more applicants), so one
 * job showed 2.7% in one place and 3.1% in another.
 *
 * Now the first figure worked out for a job is kept (table job_chances) with a fingerprint of what it came from: the profile (or the CV
 * put on that job), a referral, and what was read from the profile. Every place shows the kept figure while that fingerprint holds. It
 * moves only when the person changes one of those for that job; a posting growing older or the job pool shifting does not move it.
 */
export interface PinnedChance {
  mid: number
  low: number
  high: number
  /** chanceInputs() of what the figure came from. */
  inputs: string
}

/** The parts of a profile the chance reads. Names, notes, views, the tracker, people and pictures change nothing. */
const READ = ["permit", "birth", "abroad", "origin", "dutch", "studying", "cv", "positions", "education", "skills", "languages", "occ", "headline"] as const

/** FNV-1a, 32 bit: the same short fingerprint in the browser and on the server, with no async crypto. */
function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }

  return (h >>> 0).toString(16).padStart(8, "0")
}

/** Fingerprint of what one job's chance comes from: `profile` is the one used for that job (its own CV's, or the saved one). */
export function chanceInputs(profile: Profile, referral: boolean, strength: Strength | null): string {
  const used: Record<string, unknown> = {}
  for (const k of READ) used[k] = (profile as unknown as Record<string, unknown>)[k] ?? null

  return fnv(JSON.stringify([used, referral, strength ?? null]))
}

/** `st` with its chance multiplied by `k` (the kept figure over the one worked out here). */
export function scaled(st: Standing, k: number): Standing {
  if (!st.rate || k === 1) return st

  return { ...st, rate: { ...st.rate, low: st.rate.low * k, mid: st.rate.mid * k, high: st.rate.high * k } }
}

/** What a figure worked out here is multiplied by to show the kept one: 1 when nothing is kept for these inputs. */
export function pinScale(live: Standing | null, pin: PinnedChance | undefined, inputs: string): number {
  return live?.rate && pin && pin.inputs === inputs && live.rate.mid > 0 ? pin.mid / live.rate.mid : 1
}

/**
 * `st` with its chance replaced by the kept one when the fingerprint still holds. A what-if standing (`live` is the same job with nothing
 * ticked) moves from the kept figure by the same factor it moves from the live one, so "+0.8%" on a recommendation still adds up.
 */
export function withPinned(st: Standing, pin: PinnedChance | undefined, inputs: string, live: Standing = st): Standing {
  const k = pinScale(live, pin, inputs)
  if (k === 1 || !st.rate || !pin) return st
  if (st === live) return { ...st, rate: { ...st.rate, low: pin.low, mid: pin.mid, high: pin.high } }

  return scaled(st, k)
}

/** The figure to keep for a job, or null when the kept one still holds (nothing to write). */
export function pinToWrite(live: Standing | null, pin: PinnedChance | undefined, inputs: string): PinnedChance | null {
  if (!live?.rate || live.needsProfile || !(live.rate.mid > 0)) return null
  if (pin && pin.inputs === inputs) return null

  return { mid: live.rate.mid, low: live.rate.low, high: live.rate.high, inputs }
}

/**
 * The profile with a CV's rows (cv-parse.ts) in place of its own, or null when the rules found nothing in it (job-cv-profile.ts, and the
 * server's badge, both use this one, so a job with its own CV gets the same figure in the app and beside the posting).
 */
export function profileFromRows(profile: Profile, body: string, rows: CvRows): Profile | null {
  const readable = rows.positions.length + rows.education.length + rows.skills.length > 0

  return readable ? { ...profile, cv: body, positions: rows.positions, education: rows.education, skills: rows.skills } : null
}
