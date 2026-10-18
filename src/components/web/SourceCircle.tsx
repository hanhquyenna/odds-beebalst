/** A small round logo for where a fact came from, shown beside the source's name. LinkedIn first, then Wikidata, the company's own site; Glassdoor only for reviews. */
export type SourceName = "LinkedIn" | "Wikidata" | "Company site" | "Glassdoor"

export function SourceCircle({ name, size = 16 }: { name: SourceName; size?: number }): React.JSX.Element {
  const box = { width: size, height: size }
  if (name === "LinkedIn" || name === "Glassdoor") {
    return <img src={name === "LinkedIn" ? "/sources/linkedin.com.svg" : "/sources/glassdoor.com.svg"} alt="" style={box} className="shrink-0 rounded-full object-cover" />
  }
  if (name === "Wikidata") {
    return (
      <svg viewBox="0 0 24 24" style={box} className="shrink-0 rounded-full bg-white" aria-hidden="true">
        <rect x="3" y="5" width="2" height="14" fill="#990000" />
        <rect x="6" y="5" width="1" height="14" fill="#339966" />
        <rect x="8" y="5" width="2" height="14" fill="#006699" />
        <rect x="12" y="5" width="2" height="14" fill="#990000" />
        <rect x="15" y="5" width="1" height="14" fill="#339966" />
        <rect x="17" y="5" width="2" height="14" fill="#006699" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" style={box} className="shrink-0 rounded-full bg-[#1C1A18] p-[3px] text-white" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </svg>
  )
}

/** "[logo] LinkedIn, Wikidata, company site": the sources, each with its own circle. */
export function SourceLine({ names }: { names: SourceName[] }): React.JSX.Element | null {
  if (names.length === 0) return null

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      {names.map((n) => (
        <span key={n} className="inline-flex items-center gap-1">
          <SourceCircle name={n} />
          {n === "Company site" ? "company site" : n}
        </span>
      ))}
    </span>
  )
}
