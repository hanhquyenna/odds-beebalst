import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { Art } from "@/components/ResearchArt"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "cn"
import type { Block, Report } from "@/content/research/types"
import type { StaticPage } from "@/lib/pages"

interface Props {
  onBack: () => void
  onOpenPage?: (page: StaticPage) => void
}

const modules = import.meta.glob<{ default?: Report }>("../content/research/reports/*.ts", { eager: true })
const REPORTS: Report[] = Object.values(modules)
  .map((m) => m.default)
  .filter((r): r is Report => Boolean(r))
  .sort((a, b) => a.order - b.order)

const slugFromPath = (): string | null => location.pathname.match(/^\/research\/([^/]+)/)?.[1] ?? null
const pad = (n: number): string => String(n).padStart(2, "0")

/** Research reports: an index, and each report laid out the same way, as a paper. */
export function ResearchPage({ onBack }: Props): React.JSX.Element {
  const [slug, setSlug] = useState<string | null>(slugFromPath)
  const report = REPORTS.find((r) => r.slug === slug) ?? null

  useEffect(() => {
    const onPop = (): void => setSlug(slugFromPath())
    window.addEventListener("popstate", onPop)

    return () => window.removeEventListener("popstate", onPop)
  }, [])

  useEffect(() => {
    const old = document.title
    document.title = `${report ? report.title : "Research"} · odds`

    return () => {
      document.title = old
    }
  }, [report])

  function open(next: string | null): void {
    history.pushState({}, "", next ? `/research/${next}` : "/research")
    setSlug(next)
    window.scrollTo(0, 0)
  }

  return report ? <Paper report={report} onIndex={() => open(null)} onOpen={open} /> : <Index onBack={onBack} onOpen={open} />
}

/** A figure and its unit. A unit that is a word ("postings") is set apart by a space; a symbol ("%", "€") stays attached. */
function Amount({ value, unit, quiet = false }: { value: string; unit: string; quiet?: boolean }): React.JSX.Element {
  const word = /^[\s]*[A-Za-z]/.test(unit)
  const symbolFirst = /^[€$£]/.test(unit)
  const text = unit.trim()
  // A long unit goes under the figure so the two do not crowd each other.
  const long = text.length > 16

  return (
    <span className={`tabular-nums ${long && !quiet ? "flex flex-col items-end" : "shrink-0 whitespace-nowrap"} ${quiet ? "" : "text-base font-semibold"}`}>
      {symbolFirst ? text : null}
      {value}
      {!symbolFirst && text ? <span className={`${quiet ? "" : "text-sm font-normal text-muted-foreground"} ${long && !quiet ? "text-xs" : ""}`}>{word && (!long || quiet) ? " " : ""}{text}</span> : null}
    </span>
  )
}

const CATEGORIES = ["All", "Odds", "Pay", "Permits", "Careers", "Method"] as const
const TOPICS = CATEGORIES.map((c) => ({ value: c, label: c === "All" ? "All topics" : c }))

function Index({ onBack, onOpen }: { onBack: () => void; onOpen: (slug: string) => void }): React.JSX.Element {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All")
  const shown = REPORTS.filter((r) => category === "All" || r.category === category)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
      <button type="button" onClick={onBack} className="w-fit cursor-pointer text-sm font-medium text-primary">
        ← Back to jobs
      </button>

      <header className="mt-8 flex flex-col gap-5">
        <h1 className="max-w-3xl text-[clamp(2.5rem,7vw,4.5rem)] leading-[0.95] font-bold tracking-[-0.045em] text-balance">
          the numbers behind <span className="text-brand">the odds.</span>
        </h1>
      </header>

      <div className="mt-8">
        <Select items={TOPICS} value={category} onValueChange={(next) => setCategory(next ?? "All")}>
          <SelectTrigger aria-label="Topic" className={cn(buttonVariants({ variant: "outline" }), "h-10 cursor-pointer gap-2 border-border bg-background px-3 font-medium", category !== "All" && "border-brand bg-accent")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOPICS.map((t) => (
              <SelectItem key={t.value} value={t.value} className="cursor-pointer">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ol className="mt-6 border-t-[1.5px]">
        {shown.map((r) => (
          <li key={r.slug} className="border-b-[1.5px]">
            <button type="button" onClick={() => onOpen(r.slug)} className="group grid w-full cursor-pointer grid-cols-[2rem_1fr] items-baseline py-6 text-left md:grid-cols-[2.5rem_1fr] md:py-8">
              <span className="text-sm font-medium text-muted-foreground tabular-nums">{pad(r.order)}</span>
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="text-xl leading-tight font-semibold tracking-tight text-balance decoration-brand decoration-2 underline-offset-4 group-hover:underline md:text-2xl">{r.title}</span>
                <span className="line-clamp-2 max-w-2xl text-sm leading-snug text-muted-foreground md:line-clamp-none md:text-base md:leading-6">{r.subtitle}</span>
                <span className="mt-1 flex items-center justify-between gap-4 text-sm text-muted-foreground">
                  <span>
                    {r.minutes} min read · {r.references.length} sources
                  </span>
                  <span aria-hidden="true" className="text-foreground transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

interface Numbering {
  /** Block id to "Table 2" or "Figure 3". */
  labels: Record<string, string>
  /** Block (by section and position) to its number. */
  number: (sec: number, at: number) => number
}

const Numbers = createContext<Numbering>({ labels: {}, number: () => 0 })

function numberBlocks(report: Report): Numbering {
  const labels: Record<string, string> = {}
  const nums: Record<string, number> = {}
  let table = 0
  let figure = 0
  report.sections.forEach((sec, s) =>
    sec.blocks.forEach((b, i) => {
      if (b.type === "table" || b.type === "bars" || b.type === "ranges" || b.type === "art") {
        const n = b.type === "table" ? ++table : ++figure
        nums[`${s}:${i}`] = n
        if (b.id) {
          labels[b.id] = `${b.type === "table" ? "Table" : "Figure"} ${n}`
        }
      }
    }),
  )

  return { labels, number: (sec, at) => nums[`${sec}:${at}`] ?? 0 }
}

function Paper({ report, onIndex, onOpen }: { report: Report; onIndex: () => void; onOpen: (slug: string) => void }): React.JSX.Element {
  const numbering = useMemo(() => numberBlocks(report), [report])
  const next = REPORTS.find((r) => r.order === report.order + 1) ?? REPORTS[0]

  return (
    <Numbers value={numbering}>
      <article className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <button type="button" onClick={onIndex} className="w-fit cursor-pointer text-sm font-medium text-primary">
          ← All research
        </button>

        <header className="mt-8">
          <p className="text-sm font-medium tracking-wide text-brand-ink uppercase">
            Research report {pad(report.order)} <span className="font-normal text-muted-foreground normal-case">· {report.category}</span>
          </p>
          <h1 className="mt-3 text-3xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-[2.6rem]">{report.title}</h1>
          <p className={`mt-4 text-xl leading-8 text-muted-foreground`}>{report.subtitle}</p>
          <p className="mt-5 text-sm text-muted-foreground">
            odds research · 30 September 2026 · {report.minutes} min read · {report.references.length} references
          </p>
        </header>

        <section className="mt-8 border-y-[1.5px] py-6">
          <h2 className="text-xs font-semibold tracking-[0.14em] uppercase">Abstract</h2>
          <p className={`mt-3 text-[1.0625rem] leading-8 text-foreground/90`}>
            <Inline text={report.abstract} />
          </p>
          <h2 className="mt-6 text-xs font-semibold tracking-[0.14em] uppercase">Key findings</h2>
          <ol className={`mt-3 flex list-decimal flex-col gap-2 pl-6 text-[1.0625rem] leading-7 text-foreground/90 marker:text-brand-ink`}>
            {report.findings.map((f, i) => (
              <li key={i}>
                <Inline text={f} />
              </li>
            ))}
          </ol>
        </section>

        <nav aria-label="Contents" className="mt-6 text-sm">
          <h2 className="text-xs font-semibold tracking-[0.14em] uppercase">Contents</h2>
          <ol className="mt-3 flex flex-col gap-1.5 text-muted-foreground">
            {report.sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#sec-${i + 1}`} className="hover:text-foreground hover:underline">
                  {i + 1}. {s.heading}
                </a>
              </li>
            ))}
            <li>
              <a href="#references" className="hover:text-foreground hover:underline">
                References
              </a>
            </li>
          </ol>
        </nav>

        {report.sections.map((sec, s) => (
          <section key={sec.heading} id={`sec-${s + 1}`} className="mt-12 scroll-mt-24">
            <h2 className="text-2xl leading-snug font-semibold tracking-tight">
              {s + 1}. {sec.heading}
            </h2>
            <div className="mt-4 flex flex-col gap-5">
              {sec.blocks.map((b, i) => (
                <BlockView key={i} block={b} n={numbering.number(s, i)} />
              ))}
            </div>
          </section>
        ))}

        <section id="references" className="mt-14 scroll-mt-24 border-t-[1.5px] pt-8">
          <h2 className="text-2xl font-semibold tracking-tight">References</h2>
          <ol className={`mt-5 flex flex-col gap-3 text-[0.9375rem] leading-6 text-foreground/85`}>
            {report.references.map((ref, i) => (
              <li key={i} id={`ref-${i + 1}`} className="grid scroll-mt-24 grid-cols-[2.25rem_minmax(0,1fr)]">
                <span className="text-muted-foreground tabular-nums">[{i + 1}]</span>
                <span className="[overflow-wrap:anywhere]">{ref}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14 border-t-[1.5px] pt-8">
          <p className="text-sm text-muted-foreground">Next report</p>
          <button type="button" onClick={() => onOpen(next.slug)} className="mt-1 cursor-pointer text-left text-xl leading-snug font-semibold hover:underline hover:decoration-brand hover:underline-offset-4">
            {pad(next.order)}. {next.title}
          </button>
        </section>
      </article>
    </Numbers>
  )
}

/** **bold**, {ref:id} as "Table 2", and [3] or [2, 5] as links to the references. */
function Inline({ text }: { text: string }): React.JSX.Element {
  const { labels } = useContext(Numbers)

  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|\{ref:[^}]+\}|\[\d+(?:\s*,\s*\d+)*\])/g).map((part, i) => {
        if (part.startsWith("**")) {
          return <strong key={i} className="font-semibold text-foreground">{part.slice(2, -2)}</strong>
        }
        if (part.startsWith("{ref:")) {
          const id = part.slice(5, -1)

          return (
            <a key={i} href={`#fig-${id}`} className="font-medium text-foreground underline decoration-brand underline-offset-2">
              {labels[id] ?? id}
            </a>
          )
        }
        if (/^\[\d/.test(part)) {
          const nums = part.slice(1, -1).split(/\s*,\s*/)

          return (
            <span key={i} className="whitespace-nowrap">
              [
              {nums.map((n, k) => (
                <span key={n}>
                  {k > 0 ? ", " : ""}
                  <a href={`#ref-${n}`} className="text-brand-ink hover:underline">
                    {n}
                  </a>
                </span>
              ))}
              ]
            </span>
          )
        }

        return <span key={i}>{part}</span>
      })}
    </>
  )
}

const caption = "mt-3 text-sm leading-6 text-muted-foreground"

function BlockView({ block, n }: { block: Block; n: number }): React.JSX.Element | null {
  switch (block.type) {
    case "p":
      return (
        <p className={`text-[1.125rem] leading-[1.85] text-foreground/90`}>
          <Inline text={block.text} />
        </p>
      )
    case "h3":
      return <h3 className="mt-3 text-lg font-semibold tracking-tight">{block.text}</h3>
    case "list": {
      const List = block.ordered ? "ol" : "ul"

      return (
        <List className={`flex flex-col gap-2 pl-6 text-[1.125rem] leading-8 text-foreground/90 marker:text-brand-ink ${block.ordered ? "list-decimal" : "list-disc"}`}>
          {block.items.map((item, i) => (
            <li key={i}>
              <Inline text={item} />
            </li>
          ))}
        </List>
      )
    }
    case "table":
      return (
        <figure id={block.id ? `fig-${block.id}` : undefined} className="my-3 scroll-mt-24 font-sans">
          <figcaption className="mb-2 text-sm leading-6">
            <span className="font-semibold">Table {n}.</span> <Inline text={block.caption} />
          </figcaption>
          <div className="overflow-x-auto border-y-2 border-foreground/80">
            <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-[1.5px] border-foreground/40">
                  {block.head.map((h) => (
                    <th key={h} className="px-2 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, r) => (
                  <tr key={r} className="align-top">
                    {row.map((cell, c) => (
                      <td key={c} className={`px-2 py-2 ${c === 0 ? "font-medium" : "tabular-nums"}`}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.note ? (
            <p className="mt-2 text-[0.8125rem] leading-5 text-muted-foreground">
              <Inline text={block.note} />
            </p>
          ) : null}
        </figure>
      )
    case "bars": {
      const max = Math.max(...block.items.map((i) => i.value), 1)

      return (
        <figure id={block.id ? `fig-${block.id}` : undefined} className="my-3 scroll-mt-24 font-sans">
          <ul className="flex flex-col gap-5 border-y-[1.5px] py-6">
            {block.items.map((item) => (
              <li key={item.label} className="flex flex-col gap-2">
                <span className="flex items-baseline justify-between gap-6">
                  <span className="text-sm leading-5 font-medium">{item.label}</span>
                  <Amount value={item.value.toLocaleString()} unit={block.unit} />
                </span>
                <span className="h-2.5 rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.max(1.5, (item.value / max) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <figcaption className={caption}>
            <span className="font-semibold text-foreground">Figure {n}.</span> <Inline text={block.caption} />
            {block.note ? <> <Inline text={block.note} /></> : null}
          </figcaption>
        </figure>
      )
    }
    case "ranges":
      return (
        <figure id={block.id ? `fig-${block.id}` : undefined} className="my-3 scroll-mt-24 font-sans">
          <div className="border-y-[1.5px] py-6">
            <ul className="flex flex-col gap-5">
              {block.items.map((item) => (
                <li key={item.label} className="flex flex-col gap-2">
                  <span className="flex items-baseline justify-between gap-6">
                    <span className="text-sm leading-5 font-medium">{item.label}</span>
                    <Amount value={`${item.low.toLocaleString()} to ${item.high.toLocaleString()}`} unit={block.unit} />
                  </span>
                  <span className="relative h-2.5 rounded-full bg-secondary">
                    <span className="absolute h-full rounded-full bg-brand" style={{ left: `${(item.low / block.max) * 100}%`, width: `${Math.max(1.5, ((item.high - item.low) / block.max) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-right text-xs text-muted-foreground tabular-nums">
              axis 0 to <Amount value={block.max.toLocaleString()} unit={block.unit} quiet />
            </p>
          </div>
          <figcaption className={caption}>
            <span className="font-semibold text-foreground">Figure {n}.</span> <Inline text={block.caption} />
            {block.note ? <> <Inline text={block.note} /></> : null}
          </figcaption>
        </figure>
      )
    case "message":
      return <Message title={block.title} text={block.text} note={block.note} />
    case "art":
      return (
        <figure id={block.id ? `fig-${block.id}` : undefined} className="my-3 scroll-mt-24 font-sans">
          <div className="border-y-[1.5px] py-6 text-foreground">
            <Art kind={block.kind} className="mx-auto h-44 w-full max-w-sm" />
          </div>
          <figcaption className={caption}>
            <span className="font-semibold text-foreground">Figure {n}.</span> <Inline text={block.caption} />
          </figcaption>
        </figure>
      )
  }
}

/** Words to send. Hover the block and it says Copy; press it and it says Copied. */
function Message({ title, text, note }: { title: string; text: string; note?: string }): React.JSX.Element {
  const [done, setDone] = useState<boolean>(false)

  function copy(): void {
    const ok = (): void => {
      setDone(true)
      window.setTimeout(() => setDone(false), 1500)
    }
    const fallback = (): void => {
      const box = document.createElement("textarea")
      box.value = text
      box.style.position = "fixed"
      box.style.opacity = "0"
      document.body.appendChild(box)
      box.select()
      if (document.execCommand("copy")) ok()
      document.body.removeChild(box)
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(ok, fallback)
    } else {
      fallback()
    }
  }

  return (
    <div className="my-1 flex flex-col gap-1.5 font-sans">
      <p className="text-sm font-semibold">{title}</p>
      <div
        role="button"
        tabIndex={0}
        aria-label={`Copy: ${title}`}
        onClick={copy}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            copy()
          }
        }}
        className="group relative cursor-copy border-l-4 border-brand bg-secondary/50 px-4 py-3 pr-16 text-[0.9375rem] leading-7 whitespace-pre-line transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        {text}
        <span className={`absolute top-3 right-3 text-xs font-medium transition-opacity ${done ? "text-brand-ink opacity-100" : "text-muted-foreground opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100"}`}>{done ? "Copied" : "Copy"}</span>
      </div>
      {note ? <p className="text-[0.8125rem] leading-5 text-muted-foreground">{note}</p> : null}
    </div>
  )
}
