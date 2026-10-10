import { ExternalLinkIcon } from "@/components/icons"
import { Section } from "@/components/Section"
import { useCompanyResearch, type ResearchItem, type Sourced } from "@/lib/company-research"
import type { Posting } from "@/lib/types"

/** "Annual report 2024" linking to the page it was read on. */
function Source({ s }: { s: Sourced }): React.JSX.Element | null {
  if (!s.source_url) return null

  return (
    <a href={s.source_url} target="_blank" rel="noopener noreferrer" title={s.source_url} className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
      {s.source_name || "Source"}
      <ExternalLinkIcon className="size-3" aria-hidden="true" />
    </a>
  )
}

function Items({ title, items }: { title: string; items: ResearchItem[] | undefined }): React.JSX.Element | null {
  const list = (items ?? []).filter((x) => x.text)
  if (list.length === 0) return null

  return (
    <div className="mt-5">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <ul className="flex flex-col gap-2">
        {list.map((x, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
            <span>
              {x.text} <Source s={x} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What we found about the company on the open web: what it does, the key numbers (size, money, owner, listing), what it is known for,
 * and what matters to someone from abroad. Each line links to the page it came from. Shown only when the research found the company.
 */
export function CompanyResearch({ post }: { post: Posting }): React.JSX.Element | null {
  const r = useCompanyResearch(post.employer, post.employer_display)
  if (!r) return null
  const facts = (r.facts ?? []).filter((f) => f.label && f.value)

  return (
    <Section title={`Key facts about ${r.name ?? post.employer_display}`}>
      {r.about?.text ? (
        <p className="leading-relaxed">
          {r.about.text} <Source s={r.about} />
        </p>
      ) : null}
      {facts.length > 0 ? (
        <dl className="mt-4 rounded-xl border-[1.5px] bg-card px-4 py-1 text-sm">
          {facts.map((f, i) => (
            <div key={i} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-3 border-t py-2 first:border-t-0">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd className="min-w-0 break-words">
                <span className="font-medium">{f.value}</span> <Source s={f} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <Items title="Known for" items={r.achievements} />
      <Items title="For someone from abroad" items={r.for_internationals} />
      <p className="mt-4 text-xs text-muted-foreground">Researched from public sources{r.researched_on ? ` on ${r.researched_on}` : ""}. Every line links to where it was read.</p>
    </Section>
  )
}
