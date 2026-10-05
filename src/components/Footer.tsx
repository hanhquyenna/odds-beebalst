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
    // The orange runs edge to edge (the shadow and clip widen it past the column) while the words stay in the page's column, under the header's.
    <footer className="mt-10 -mb-7 bg-brand pt-10 pb-6 text-sm text-foreground shadow-[0_0_0_100vmax_var(--color-brand)] [clip-path:inset(0_-100vmax)]">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[26ch]">
          <p className="text-2xl font-bold tracking-tight">
            odds
          </p>
          <p className="mt-2 leading-6">jobs in the netherlands, for international students.</p>
        </div>
        <nav aria-label="Footer" className="max-w-xl">
          <ul className="flex flex-wrap gap-x-6 gap-y-3 sm:justify-end">
            {LINKS.map(([page, label]) => (
              <li key={page}>
                <button type="button" onClick={() => onOpenPage(page)} className="cursor-pointer text-foreground underline-offset-4 hover:underline">
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mt-12 flex flex-col gap-6 border-t-[1.5px] border-foreground/25 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-xs leading-5">
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
