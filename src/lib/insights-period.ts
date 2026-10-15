export type InsightsPeriod = "this_week" | "last_week" | "two_weeks" | "eight_weeks"
export const INSIGHTS_PERIODS: Array<{ key: InsightsPeriod; label: string }> = [{ key: "this_week", label: "This week" }, { key: "last_week", label: "Last week" }, { key: "two_weeks", label: "Last 2 weeks" }, { key: "eight_weeks", label: "Last 8 weeks" }]
const DAY = 86_400_000
/** Calendar weeks start on Monday; date-only application records are compared as dates, independent of DST. */
export function insightsPeriod(period: InsightsPeriod, now = new Date()): { from: number; to: number; dates: string[]; includes: (iso: string) => boolean } {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const weekday = (now.getDay() + 6) % 7
  const monday = today - weekday * DAY
  const from = period === "this_week" ? monday : period === "last_week" ? monday - 7 * DAY : today - (period === "two_weeks" ? 13 : 55) * DAY
  const to = period === "last_week" ? monday - DAY : today
  return { from, to, dates: Array.from({ length: Math.round((to - from) / DAY) + 1 }, (_, k) => new Date(from + k * DAY).toISOString().slice(0, 10)), includes: (iso) => { const date = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`); return date >= from && date <= to } }
}
