import { useMemo } from "react"
import { JobRow } from "@/components/JobBoard"
import { notYours } from "@/components/FitTable"
import { useCompanyProfiles } from "@/lib/company-profile"
import { useData } from "@/lib/data"
import { similarMix } from "@/lib/tailor"
import type { Posting } from "@/lib/types"

/**
 * Under your own list on Home: five open jobs like the ones you saved, in the same mix as your list (src/lib/tailor.ts, similarMix).
 * Save a job and this list changes with it.
 */
export function SimilarJobs({ onOpen }: { onOpen: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const profiles = useCompanyProfiles()
  const rows = useMemo(() => {
    const applied = new Set(data.applications.map((a) => a.posting_id))
    const mine = [...data.postings, ...data.keptExtra].filter((p) => data.saved.has(p.id) || applied.has(p.id))
    const pool = notYours({ postings: data.postings, applications: data.applications, saved: data.saved, passed: data.passed })

    return similarMix(mine, pool, profiles, 5)
  }, [data.postings, data.keptExtra, data.saved, data.applications, data.passed, profiles])

  if (rows.length === 0) return null

  return (
    <section aria-label="Like the jobs you saved" className="mt-4 flex flex-col gap-3">
      <h2 className="text-xl font-semibold tracking-tight">Like the jobs you saved</h2>
      <ul className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card max-md:-mx-5 max-md:rounded-none max-md:border-x-0">
        {rows.map((r) => (
          <li key={r.post.id} className="relative after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border last:after:hidden md:after:left-4">
            <JobRow post={r.post} onOpen={() => onOpen(r.post)} note={r.note} dismissible />
          </li>
        ))}
      </ul>
    </section>
  )
}
