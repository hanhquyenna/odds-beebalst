import { CheckIcon } from "@/components/icons"
import { Section } from "@/components/Section"
import type { Standing } from "@/lib/engine"
import { TIERS, TIER_LABEL, type Requirement, type Tier } from "@/lib/requirements"
import { standardNames, standardTiers } from "@/lib/standard"
import type { Posting } from "@/lib/types"

const ORDER = ["skills", "experience", "education", "language", "qualities", "conditions"] as const
const HEADING: Record<Tier, string> = { must: "They ask for", strong: "Helps a lot", optional: "Preferred", nice: "Nice to have" }
/** The more a posting insists, the more orange the chip: a missing must-have stands out, a nice-to-have barely does. */
const CHIP: Record<Tier, string> = {
  must: "border-[1.5px] border-brand/60 bg-brand/15",
  strong: "border-[1.5px] border-brand/35 bg-brand/[0.07]",
  optional: "border-[1.5px] bg-secondary/60",
  nice: "border-[1.5px] border-dashed text-muted-foreground",
}

/**
 * What to put on your CV for this job, in one card: everything the posting asks for, grouped by how much it insists, in the same words on every job.
 * Where a CV has been read, the skills already on it carry a tick and a count sits on top ("4 of 8"); it counts words found, it does not judge you.
 */
export function CvMatch({ post, st, requirements }: { post: Posting; st: Standing | null; requirements: Requirement[] }): React.JSX.Element | null {
  const rows = standardTiers(requirements, TIERS)
    .map(({ tier, std }) => ({ tier, items: ORDER.flatMap((kind) => std[kind].map((text) => ({ text, kind }))) }))
    .filter((row) => row.items.length > 0)
  // A posting with no requirements part still names things: those are listed without a tier.
  const mentioned = requirements.length === 0 ? standardNames(post.skills ?? []) : []
  if (rows.length === 0 && mentioned.length === 0) return null
  const known = st !== null && !st.needsProfile
  const have = new Set(known ? st.checklist.filter((c) => c.have).flatMap((c) => standardNames([c.skill])) : [])
  const counted = rows.filter((r) => r.tier === "must" || r.tier === "strong").flatMap((r) => r.items.filter((i) => i.kind === "skills"))
  const found = counted.filter((i) => have.has(i.text)).length

  return (
    <Section title="What to put on your CV">
      {known && counted.length > 0 ? (
        <div className="mb-4 flex items-center gap-4">
          <p className="shrink-0 text-2xl font-semibold tracking-tight tabular-nums">
            {found}
            <span className="text-muted-foreground"> of {counted.length}</span>
          </p>
          <div className="h-2 w-full max-w-48 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${found} of ${counted.length} skills on your CV`}>
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.round((found / counted.length) * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="divide-y-[1.5px] overflow-hidden rounded-xl border-[1.5px] bg-card">
          {rows.map(({ tier, items }) => (
            <div key={tier} className="grid gap-2 p-4 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
              <p className="pt-1 text-sm font-semibold">{HEADING[tier]}</p>
              <ul aria-label={TIER_LABEL[tier]} className="flex flex-wrap gap-1.5">
                {items.map(({ text, kind }) => {
                  const on = kind === "skills" && have.has(text)

                  return (
                    <li key={`${kind}:${text}`} className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${on ? "bg-good text-good-foreground" : CHIP[tier]}`}>
                      {on ? <CheckIcon weight="bold" className="size-3.5" aria-hidden="true" /> : null}
                      {text}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2 border-y-[1.5px] py-3">
          {mentioned.map((t) => (
            <li key={t} className="rounded-md bg-secondary px-2.5 py-1 text-sm font-medium">
              {t}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
