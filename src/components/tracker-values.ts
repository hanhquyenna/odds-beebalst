import { ENDED, STEPS, stepOf } from "@/components/PipelineBoard"
import type { useData } from "@/lib/data"
import { appliedDay, followUpFor, overrideOf } from "@/lib/cells"
import { daysOr } from "@/lib/follow-days"
import { FOLLOW_UP_DAYS } from "@/lib/tracker"
import type { Posting } from "@/lib/types"

type Data = ReturnType<typeof useData>

/** The application behind a job, if you logged one. */
export const applicationOf = (data: Data, post: Posting): Data["applications"][number] | undefined => data.applications.find((a) => a.posting_id === post.id)

/**
 * The value a sort uses for the properties that come from your own search rather than from the posting: your status, the day you applied, when to follow up, and
 * your own properties. A job with no value (not applied, ended) goes last either way.
 */
export function trackerSortValue(data: Data, key: string, post: Posting): string | number | null {
  if (key === "status") {
    const step = stepOf(data, post)

    return ENDED.has(step) ? null : STEPS.findIndex((c) => c.step === step)
  }
  const typed = (k: string): string => overrideOf(data.profile.notes, post.id, k)
  if (key === "applied") {
    return appliedDay(applicationOf(data, post), typed("applied")) ?? null
  }
  if (key === "deadline") {
    const v = typed("deadline") || post.valid_through || ""

    return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null
  }
  if (key === "followup") {
    return followUpFor(applicationOf(data, post), typed("followup"), appliedDay(applicationOf(data, post), typed("applied")), new Date(), daysOr(data.profile.followUpDays, FOLLOW_UP_DAYS))?.on ?? null
  }
  if (key.startsWith("p:")) {
    return data.profile.notes[post.id]?.[key.slice(2)] || null
  }

  return null
}
