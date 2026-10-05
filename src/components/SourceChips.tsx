import { BuildingsIcon } from "@/components/icons"
import { sourceOf, type JobSource } from "@/lib/sources"
import type { Posting } from "@/lib/types"

/** Where this job was found. A job found in several places lists every one. */
function sourcesOf(post: Posting): JobSource[] {
  if (post.local) {
    return []
  }

  return post.sources && post.sources.length > 0 ? post.sources : [sourceOf(post)]
}

/** The platforms that have a logo of their own, saved in public/sources. Most are vector files, so they stay sharp at any size. */
const LOGO: Record<string, string> = {
  LinkedIn: "linkedin.com.svg",
  "Magnet.me": "magnet.me.svg",
  AcademicTransfer: "academictransfer.com.png",
  Indeed: "indeed.com.svg",
  Glassdoor: "glassdoor.com.svg",
}

/** Marks drawn as a bare shape with no square of their own. They sit on a white rounded tile so they read on any background. */
const GLYPH = new Set(["Indeed", "Glassdoor"])

/** A platform's logo, small and square. Without one, a plain building mark stands for the employer's own site. */
export function SourceLogo({ name, size }: { name: string; size: number }): React.JSX.Element {
  const file = LOGO[name]
  if (!file) {
    return <BuildingsIcon weight="bold" aria-hidden="true" style={{ width: size, height: size }} className="shrink-0 text-muted-foreground" />
  }
  const glyph = GLYPH.has(name)
  const pad = glyph ? Math.round(size * 0.18) : 0

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] ${glyph ? "bg-white" : ""}`} style={{ width: size, height: size, padding: pad }}>
      <img src={`/sources/${file}`} alt="" loading="lazy" decoding="async" width={size - pad * 2} height={size - pad * 2} className="size-full object-contain" />
    </span>
  )
}

const unique = (post: Posting): string[] => [...new Set(sourcesOf(post).map((s) => s.name))]

/** The sources as small logos under the bookmark, in the same place on every row. Not links: the whole row opens the job. */
export function SourceCorner({ post }: { post: Posting }): React.JSX.Element | null {
  const names = unique(post)
  if (names.length === 0) {
    return null
  }

  return (
    <span className="pointer-events-none flex h-5 items-center justify-center gap-1" role="img" aria-label={`Found on ${names.join(", ")}`}>
      {names.map((name) => (
        <span key={name} title={name} className="flex">
          <SourceLogo name={name} size={16} />
        </span>
      ))}
    </span>
  )
}

/**
 * The way into the job: one Apply button to the posting that leads to the application (the employer's own page where we have it, since sources are ranked that way),
 * with the logo of the place it leads to beside it, and the logos of any other place the job was found, each a link. The logos carry the names (hover, and for screen
 * readers), so the line stays short and sits at the corner of the header, level with the status.
 */
export function SourceLinks({ post }: { post: Posting }): React.JSX.Element | null {
  // One entry per platform: two postings of the same job on LinkedIn show as one LinkedIn link.
  const sources = sourcesOf(post).filter((s, i, all) => all.findIndex((x) => x.name === s.name) === i)
  if (sources.length === 0) {
    return null
  }
  const main = sources.find((s) => s.url)
  const others = sources.filter((s) => s !== main)

  return (
    <span className="flex items-center gap-3">
      {main ? (
        <>
          <a
            href={main.url as string}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Apply on ${main.name} (opens in a new tab)`}
            title={`Apply on ${main.name}`}
            className="inline-flex h-8 items-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition-colors duration-150 outline-none hover:bg-blue-700 focus-visible:ring-3 focus-visible:ring-blue-600/40 active:translate-y-px"
          >
            Apply
          </a>
          <span title={main.name} className="flex" role="img" aria-label={`on ${main.name}`}>
            <SourceLogo name={main.name} size={22} />
          </span>
        </>
      ) : null}
      {others.map((s, i) =>
        s.url ? (
          <a key={`${s.ats}-${i}`} href={s.url} target="_blank" rel="noopener noreferrer" title={`Also on ${s.name}`} aria-label={`Also on ${s.name} (opens in a new tab)`} className="flex opacity-80 transition-opacity hover:opacity-100">
            <SourceLogo name={s.name} size={20} />
          </a>
        ) : (
          <span key={`${s.ats}-${i}`} title={`Found on ${s.name}`} role="img" aria-label={`Found on ${s.name}`} className="flex opacity-80">
            <SourceLogo name={s.name} size={20} />
          </span>
        ),
      )}
    </span>
  )
}
