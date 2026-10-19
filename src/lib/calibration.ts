/**
 * Was the interview chance right? (outcome loop, docs/ENGINE_DATA_PLAN.md E2/E3.) Applications are grouped by the chance Odds showed
 * when the person applied, and each group's average shown chance is set beside the share that really reached an interview.
 * Only applications old enough to have an answer count, and "no answer yet" never counts. A group with fewer than MIN_ANSWERED
 * answered applications gets no figure at all: a precise-looking number from three people would be a lie.
 */
export const MIN_ANSWERED = 10
/** An application is judged only this many days after it was sent (the same day "No answer" is first offered). */
export const MATURE_AFTER_DAYS = 21

/** Bucket edges as chances from 0 to 1. Keep in step with chance_calibration_pooled() in supabase/migrations. */
export const BUCKETS: ReadonlyArray<{ key: string; label: string; from: number; to: number }> = [
  { key: "lt1", label: "under 1%", from: 0, to: 0.01 },
  { key: "1-3", label: "1–3%", from: 0.01, to: 0.03 },
  { key: "3-6", label: "3–6%", from: 0.03, to: 0.06 },
  { key: "6-10", label: "6–10%", from: 0.06, to: 0.1 },
  { key: "10+", label: "10% and up", from: 0.1, to: Infinity },
]

/** One application as kept in chance_snapshots. `outcome` is null until the person says what happened. */
export interface CalibrationRow {
  chance: number
  applied_on: string
  outcome: "interview" | "rejected" | "no_reply" | null
}

export interface CalibrationBucket {
  key: string
  label: string
  /** Applications old enough to judge, answered or not. */
  old: number
  /** Of those, the ones with an answer: this is what the figures stand on. */
  answered: number
  enough: boolean
  /** Average chance shown, 0 to 1. Null unless `enough`. */
  shown: number | null
  /** Share that reached an interview, 0 to 1. Null unless `enough`. */
  actual: number | null
}

const DAY = 86_400_000
const dayOf = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)

export function bucketOf(chance: number): (typeof BUCKETS)[number] {
  return BUCKETS.find((b) => chance >= b.from && chance < b.to) ?? BUCKETS[BUCKETS.length - 1]
}

/** Every bucket, in order, even the empty ones. `shown` and `actual` are null below MIN_ANSWERED answers. */
export function calibrate(rows: ReadonlyArray<CalibrationRow>, now: number = Date.now()): CalibrationBucket[] {
  const today = Math.floor(now / DAY) * DAY

  return BUCKETS.map((b) => {
    const inBucket = rows.filter((r) => Number.isFinite(r.chance) && r.chance >= 0 && r.chance <= 1 && bucketOf(r.chance).key === b.key)
    const old = inBucket.filter((r) => Number.isFinite(dayOf(r.applied_on)) && (today - dayOf(r.applied_on)) / DAY >= MATURE_AFTER_DAYS)
    const answered = old.filter((r) => r.outcome !== null)
    const enough = answered.length >= MIN_ANSWERED
    const hits = answered.filter((r) => r.outcome === "interview").length

    return {
      key: b.key,
      label: b.label,
      old: old.length,
      answered: answered.length,
      enough,
      shown: enough ? answered.reduce((sum, r) => sum + r.chance, 0) / answered.length : null,
      actual: enough ? hits / answered.length : null,
    }
  })
}

/** The shape the database function returns for everyone: counts only, never a row or a person. */
export interface PooledRow {
  bucket: string
  answered: number
  interviews: number | null
  mean_chance: number | null
}

/** Turns the pooled counts into the same buckets, applying the same "too few" rule again on this side. */
export function fromPooled(rows: ReadonlyArray<PooledRow>): CalibrationBucket[] {
  return BUCKETS.map((b) => {
    const row = rows.find((r) => r.bucket === b.key)
    const answered = row?.answered ?? 0
    const enough = answered >= MIN_ANSWERED && row?.interviews != null && row?.mean_chance != null

    return {
      key: b.key,
      label: b.label,
      old: answered,
      answered,
      enough,
      shown: enough ? (row?.mean_chance ?? null) : null,
      actual: enough ? (row?.interviews ?? 0) / answered : null,
    }
  })
}

/** Calls out of 100 for the sentence on the job page, only where the bucket for this chance has enough answers. */
export function callsIn100(buckets: ReadonlyArray<CalibrationBucket>, chance: number): number | null {
  const b = buckets.find((x) => x.key === bucketOf(chance).key)

  return b?.enough && b.actual !== null ? Math.round(b.actual * 100) : null
}
