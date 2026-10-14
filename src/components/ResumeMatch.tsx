import { CheckIcon } from "@/components/icons"
import type { Standing } from "@/lib/engine"
import { standardNames } from "@/lib/standard"
import type { Posting } from "@/lib/types"

/**
 * Which of the keywords the posting leans on are already on your CV. Only the ones it insists on or says help a lot count, and it is a
 * count of words found, not a verdict on you. Nothing shows until a CV or profile has been read, and when the posting names nothing.
 */
export function ResumeMatch({ post, st }: { post: Posting; st: Standing }): React.JSX.Element | null {
  if (st.needsProfile) return null
  const wanted = st.checklist.filter((c) => {
    const tier = post.tiers?.[c.skill]
    return !tier || tier === "must" || tier === "strong"
  })
  if (wanted.length === 0) return null
  const name = (skill: string): string => standardNames([skill])[0] ?? skill
  const found = wanted.filter((c) => c.have).map((c) => name(c.skill))
  const missing = wanted.filter((c) => !c.have).map((c) => name(c.skill))

  return (
    <section aria-label="Keywords on your CV" className="rounded-xl border-[1.5px] bg-card p-4 sm:p-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{found.length}<span className="text-muted-foreground"> of {wanted.length}</span></p>
          <p className="text-sm text-muted-foreground">keywords on your CV</p>
        </div>
        <div className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${found.length} of ${wanted.length}`}>
          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((found.length / wanted.length) * 100)}%` }} />
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {found.map((t) => (
          <li key={t} className="flex items-center gap-1.5 rounded-md bg-good px-2.5 py-1 text-sm font-medium text-good-foreground">
            <CheckIcon weight="bold" className="size-3.5" aria-hidden="true" />
            {t}
          </li>
        ))}
        {missing.map((t) => (
          <li key={t} className="rounded-md border-[1.5px] border-dashed px-2.5 py-1 text-sm text-muted-foreground">{t}</li>
        ))}
      </ul>
    </section>
  )
}
