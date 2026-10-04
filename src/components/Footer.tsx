import { useData } from "@/lib/data"
import { PoweredByBeeBlast } from "@/components/BeeBlastMark"
import type { StaticPage } from "@/lib/pages"

interface FooterProps {
  onOpenPage: (page: StaticPage) => void
}

const LINKS: ReadonlyArray<readonly [StaticPage, string]> = [
  ["how-it-works", "How it works"],
  ["research", "Research"],
  ["about", "About"],
  ["privacy", "Privacy"],
  ["terms", "Terms"],
]

export function Footer({ onOpenPage }: FooterProps): React.JSX.Element {
  const { collected } = useData()

  return (
    <footer className="mt-10 pt-8 pb-4 text-sm">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[26ch]">
          <p className="text-2xl font-bold tracking-tight">
            <span className="text-brand-ink">o</span>dds
          </p>
          <p className="mt-2 leading-6 text-muted-foreground">jobs in the netherlands, for international students.</p>
        </div>
        <nav aria-label="Footer" className="max-w-xl">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 sm:justify-end">
            {LINKS.map(([page, label]) => (
              <li key={page}>
                <button type="button" onClick={() => onOpenPage(page)} className="cursor-pointer text-foreground transition-colors hover:text-brand-ink">
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mt-12 flex flex-col gap-6 border-t-[1.5px] pt-6 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-xs leading-5 text-muted-foreground">
          Figures come from CBS, the Belastingdienst, the IND and employers&apos; own career sites. Postings were collected on {collected}. Estimates are for orientation and are not
          immigration, tax or employment advice.
        </p>
        <div className="shrink-0">
          <PoweredByBeeBlast />
        </div>
      </div>
    </footer>
  )
}
