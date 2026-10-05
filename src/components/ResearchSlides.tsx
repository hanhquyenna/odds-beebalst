import { REPORTS } from "@/content/research"
import type { Report } from "@/content/research/types"
import type { StaticPage } from "@/lib/pages"

function Slide({ report, onOpen }: { report: Report; onOpen: (slug: string) => void }): React.JSX.Element {
  return (
    <li className="w-[17rem] shrink-0 sm:w-[20rem]">
      <button
        type="button"
        onClick={() => onOpen(report.slug)}
        className="group flex h-full w-full cursor-pointer flex-col rounded-2xl border-2 border-[oklch(0.17_0.004_60)] p-6 text-left text-[oklch(0.17_0.004_60)] transition-colors duration-200 hover:bg-brand"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="ix-num" style={{ fontSize: "4.5rem" }}>
            {String(report.order).padStart(2, "0")}
          </span>
          <span className="mt-2 text-xs font-medium tracking-[0.16em] uppercase">{report.category}</span>
        </span>
        <span className="mt-5 text-xl leading-snug font-semibold tracking-tight">{report.title}</span>
        <span className="mt-auto flex flex-col pt-6">
          <span className="flex items-center justify-between border-t-2 border-[oklch(0.17_0.004_60)] pt-3 text-sm font-medium">
            <span>{report.references.length} references</span>
            <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
              →
            </span>
          </span>
        </span>
      </button>
    </li>
  )
}

/** The research behind the numbers, as slides that drift past. Paused under the pointer, still for anyone who asked for less motion. */
export function ResearchSlides({ onOpenPage }: { onOpenPage?: (page: StaticPage) => void }): React.JSX.Element | null {
  if (REPORTS.length === 0) {
    return null
  }
  const open = (slug: string): void => {
    onOpenPage?.("research")
    history.replaceState({}, "", `/research/${slug}`)
  }
  const row = (
    <ul className="flex shrink-0 gap-5 pr-5 sm:gap-6 sm:pr-6">
      {REPORTS.map((r) => (
        <Slide key={r.slug} report={r} onOpen={open} />
      ))}
    </ul>
  )

  return (
    <section aria-labelledby="research-heading" className="relative left-1/2 -mb-7 w-screen -translate-x-1/2 overflow-hidden bg-background py-10 text-[oklch(0.17_0.004_60)] sm:py-14">
      <div className="mx-auto w-full max-w-sm px-5 sm:max-w-2xl sm:px-6 lg:max-w-6xl lg:px-10">
        <h2 id="research-heading" className="text-3xl leading-[0.95] font-bold tracking-[-0.045em] sm:text-5xl">
          built on research.
        </h2>
      </div>
      <div className="mt-8 overflow-hidden">
        <div className="odds-marquee-track flex w-max" style={{ ["--glide" as string]: "70s" }}>
          {row}
          {row}
        </div>
      </div>
    </section>
  )
}
