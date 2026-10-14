import { CheckIcon } from "@/components/icons"
import type { Posting } from "@/lib/types"

const KIND: Record<string, string> = { internship: "Internship", working_student: "Working student", traineeship: "Traineeship", entry_job: "Entry job" }
const DEGREE: Record<string, string> = { bachelor: "Bachelor's", master: "Master's", phd: "PhD" }
const WORKPLACE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site" }

/** "Closes 30 Oct" for a closing date still ahead, nothing otherwise. */
function closes(post: Posting, now: Date): string | null {
  if (!post.valid_through || !/^\d{4}-\d{2}-\d{2}/.test(post.valid_through)) return null
  const end = new Date(`${post.valid_through.slice(0, 10)}T23:59:59Z`)
  if (end.getTime() < now.getTime()) return null

  return `Closes ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`
}

/** What the posting is, in a few words: only what the database holds for this job. Nothing is filled in to look complete. */
export function JobFacts({ post, now = new Date() }: { post: Posting; now?: Date }): React.JSX.Element | null {
  const facts: Array<{ text: string; good?: boolean }> = []
  if (post.role_kind && KIND[post.role_kind]) facts.push({ text: KIND[post.role_kind] })
  if (post.degree_asked && DEGREE[post.degree_asked]) facts.push({ text: DEGREE[post.degree_asked] })
  if (post.enrollment === "required") facts.push({ text: "Students only" })
  if (post.enrollment === "recent") facts.push({ text: "Students and recent graduates" })
  if (post.workplace && WORKPLACE[post.workplace]) facts.push({ text: WORKPLACE[post.workplace] })
  if (post.years_min && post.years_min > 0) facts.push({ text: `${post.years_min}+ years` })
  if (post.dutch_required) facts.push({ text: "Dutch needed" })
  if (post.ind_sponsor) facts.push({ text: "IND sponsor", good: true })
  const applicants = post.applicants_text?.trim() || (post.applicants ? `${post.applicants} applicants` : "")
  if (applicants) facts.push({ text: applicants })
  const end = closes(post, now)
  if (end) facts.push({ text: end })
  if (facts.length === 0) return null

  return (
    <ul aria-label="About this job" className="flex flex-wrap gap-1.5">
      {facts.map((f) => (
        <li key={f.text} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${f.good ? "bg-good text-good-foreground" : "bg-secondary"}`}>
          {f.good ? <CheckIcon weight="bold" className="size-3.5" aria-hidden="true" /> : null}
          {f.text}
        </li>
      ))}
    </ul>
  )
}
