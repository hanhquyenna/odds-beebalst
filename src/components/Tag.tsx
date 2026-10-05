import { levelOf } from "@/lib/engine"
import { useApplyFilter } from "@/lib/filter-bus"
import type { JobFilters } from "@/lib/filters"
import { formatAge } from "@/lib/format"
import { industryOf } from "@/lib/industries"
import type { Posting } from "@/lib/types"

/** "Today", "3 days ago": the same shape every time. */
export function ageText(post: Posting): string {
  const age = formatAge(post)

  return age === "Date not shown" ? "Date not shown" : age === "Today" ? "Posted today" : age === "Yesterday" ? "Posted yesterday" : `Posted ${age}`
}

/** The four standard facts of a job, in this order and these words, for a line of plain text or a key-facts block. */
function factsOf(post: Posting): Array<{ label: string; value: string; known: boolean; filter?: Partial<JobFilters>; hint?: string }> {
  const industry = industryOf(post)
  const level = levelOf(post)

  return [
    { label: "Industry", value: industry ?? "Unknown", known: industry !== null, filter: industry ? { industry: [industry] } : undefined, hint: industry ? `Show only ${industry} jobs` : undefined },
    { label: "Level", value: level === "Not stated" ? "Not stated" : level, known: level !== "Not stated", filter: level === "Not stated" ? undefined : { level: [level] }, hint: `Show only ${level} jobs` },
    {
      label: "Language",
      value: post.dutch_required ? "Dutch needed" : "English",
      known: true,
      filter: { language: [post.dutch_required ? "dutch" : "english"] },
      hint: post.dutch_required ? "Show only jobs that need Dutch" : "Show only jobs in English",
    },
    { label: "Sponsor", value: post.ind_sponsor ? "IND sponsor" : "No sponsor", known: post.ind_sponsor, filter: post.ind_sponsor ? { sponsorOnly: true } : undefined, hint: "Show only IND sponsors" },
  ]
}

/**
 * The four facts as a block of labelled values at the top of a job. Each
 * value that has a matching filter can be pressed to follow it up.
 */
export function KeyFacts({ post, onPick }: { post: Posting; onPick?: () => void }): React.JSX.Element {
  const apply = useApplyFilter()

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {factsOf(post).map((f) => (
        <div key={f.label} className="min-w-0">
          <dt className="text-[0.8125rem] text-muted-foreground">{f.label}</dt>
          <dd className={`mt-0.5 font-medium ${f.known ? "" : "text-muted-foreground"}`}>
            {apply && f.filter ? (
              <button
                type="button"
                title={f.hint}
                onClick={() => {
                  apply(f.filter!)
                  onPick?.()
                }}
                className="max-w-full cursor-pointer text-left underline decoration-foreground/30 decoration-dotted underline-offset-4 hover:decoration-solid"
              >
                {f.value}
              </button>
            ) : (
              f.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
