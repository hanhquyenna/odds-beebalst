import { useData } from "@/lib/data"
import { FOLLOW_UP_DAYS } from "@/lib/tracker"
import { NUDGE_AFTER_DAYS } from "@/lib/outreach-stage"

/** A number of days as someone may have set it: a whole number of at least 1, else the starting one. */
export const daysOr = (value: unknown, fallback: number): number => (typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : fallback)

/** How many days after applying a follow-up is due, and after a stage change a nudge is due, as this person set them. */
export function useFollowDays(): { followUp: number; nudge: number } {
  const { profile } = useData()

  return { followUp: daysOr(profile.followUpDays, FOLLOW_UP_DAYS), nudge: daysOr(profile.nudgeDays, NUDGE_AFTER_DAYS) }
}
