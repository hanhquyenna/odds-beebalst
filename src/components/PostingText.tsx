import { useMemo } from "react"
import { parsePosting, type Block } from "@/lib/job-sections"
import { stripMarkup } from "@/lib/format"

function Blocks({ blocks }: { blocks: Block[] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) =>
        block.kind === "p" ? (
          <p key={i} className="text-[0.95rem] leading-relaxed">
            {block.text}
          </p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 text-[0.95rem] leading-relaxed marker:text-muted-foreground">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  )
}

/**
 * The posting sectioned, not edited: every line is the employer's, under the employer's own heading in bold. Sections are only put in a familiar order
 * (the role, the team, what you'll do, what they ask, what they offer, how to apply), lines broken mid-sentence are joined, and bullets are lists.
 */
export function PostingText({ body }: { body: string }): React.JSX.Element {
  const text = useMemo(() => stripMarkup(body), [body])
  const parsed = useMemo(() => parsePosting(text), [text])
  const shown = parsed.sections

  return (
    <div className="flex flex-col gap-6">
      {parsed.details.length > 0 ? (
        <dl className="grid grid-cols-1 overflow-hidden rounded-lg border-[1.5px] text-sm sm:grid-cols-2">
          {parsed.details.map((d, i) => (
            <div key={`${d.label}-${i}`} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 border-b-[1.5px] px-3 py-2 last:border-b-0 sm:odd:border-r-[1.5px] sm:[&:nth-last-child(-n+2)]:border-b-0">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="min-w-0 break-words">{d.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {shown.map((section, i) => (
        <section key={`${section.key}-${section.title}-${i}`} className="flex flex-col gap-3">
          {section.title ? <h3 className="text-base font-bold tracking-tight">{section.title}</h3> : null}
          {section.blocks.length > 0 ? <Blocks blocks={section.blocks} /> : null}
        </section>
      ))}
    </div>
  )
}
