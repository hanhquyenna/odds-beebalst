import { useMemo } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import { PersonAvatar } from "@/components/PersonAvatar"
import { useData } from "@/lib/data"
import { useFollowDays } from "@/lib/follow-days"
import { nextStep } from "@/lib/outreach-stage"
import { followUpOf, followUpText } from "@/lib/tracker"
import type { Posting } from "@/lib/types"

/** What is waiting on you today: applications whose follow-up day has come, and people whose one nudge is due. Nothing shows when nothing is due. */
export function DueNow({ onOpenJob, onOpenPeople }: { onOpenJob: (post: Posting) => void; onOpenPeople: () => void }): React.JSX.Element | null {
  const data = useData()
  const days = useFollowDays()
  const rows = useMemo(() => {
    const now = new Date()
    const byId = new Map([...data.postings, ...data.keptExtra].map((p) => [p.id, p]))
    const jobs = data.applications
      .map((a) => ({ app: a, post: byId.get(a.posting_id), follow: followUpOf(a, now, days.followUp) }))
      .filter((r): r is { app: typeof r.app; post: Posting; follow: NonNullable<typeof r.follow> } => Boolean(r.post) && Boolean(r.follow?.due))
      .sort((a, b) => a.follow.inDays - b.follow.inDays)
    const people = data.people.filter((p) => nextStep(p, now, days.nudge).due)

    return { jobs, people }
  }, [data.applications, data.postings, data.keptExtra, data.people, days.followUp, days.nudge])
  const total = rows.jobs.length + rows.people.length
  if (total === 0) return null

  return (
    <section aria-label="Follow up" className="overflow-hidden rounded-xl border-[1.5px] bg-card">
      <h2 className="flex items-center gap-2 px-4 pt-4 pb-2 font-heading text-lg font-semibold tracking-tight sm:px-5">
        Follow up
        <span className="rounded-md bg-bad px-2 py-0.5 text-sm font-medium text-bad-foreground tabular-nums">{total}</span>
      </h2>
      <ul className="divide-y-[1.5px]">
        {rows.jobs.slice(0, 5).map(({ post, follow }) => (
          <li key={post.id}>
            <button type="button" onClick={() => onOpenJob(post)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 sm:px-5">
              <span className="flex h-9 w-11 shrink-0 items-center justify-center">
                <CompanyLogo employer={post.employer} name={post.employer_display} size={32} wide={1.4} url={post.url} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{post.title}</span>
                <span className="block truncate text-sm text-muted-foreground">{post.employer_display}</span>
              </span>
              <span className="shrink-0 rounded-md bg-bad px-2.5 py-1 text-sm font-medium text-bad-foreground">{followUpText(follow)}</span>
            </button>
          </li>
        ))}
        {rows.people.slice(0, 5).map((p) => (
          <li key={p.id}>
            <button type="button" onClick={onOpenPeople} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-secondary/50 sm:px-5">
              <PersonAvatar name={p.name} photo={p.photo} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-sm text-muted-foreground">{p.role ? `${p.role}, ${p.company}` : p.company}</span>
              </span>
              <span className="shrink-0 rounded-md bg-bad px-2.5 py-1 text-sm font-medium text-bad-foreground">Nudge due</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
