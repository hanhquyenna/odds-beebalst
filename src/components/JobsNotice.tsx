import { useEffect, useState } from "react"
import { XIcon } from "@/components/icons"
import { SourceLogo } from "@/components/SourceChips"

/**
 * The job boards shown on the board. Only boards the sync really reads belong here (public/sources has more logos,
 * but Indeed and Glassdoor are not read). Edit this list and CLAIM when the sync changes.
 */
const BOARDS = ["LinkedIn", "Magnet.me", "AcademicTransfer"]
const CLAIM_PLAIN = "the boards students use, in one"
const CLAIM_ACCENT = "place."

/**
 * The board at the top of the jobs: what this is and which job boards the jobs are taken from. It can be
 * closed with the cross, and brought back from the link beside the job count.
 */
export function JobsNotice({ closed, onClose }: { closed: boolean; onClose: () => void }): React.JSX.Element | null {

  // One logo at a time, turning to the next every few seconds, round and round the list.
  const [at, setAt] = useState<number>(0)
  useEffect(() => {
    if (closed) {
      return
    }
    const timer = window.setInterval(() => setAt((i) => (i + 1) % BOARDS.length), 2600)

    return () => window.clearInterval(timer)
  }, [closed])
  const name = BOARDS[at]

  if (closed) {
    return null
  }

  return (
    <section aria-label="Where the jobs come from" className="relative flex flex-col gap-6 overflow-hidden rounded-3xl bg-foreground px-5 py-6 text-background md:flex-row md:items-center md:justify-between md:gap-10 md:px-8 md:py-8">
      <button type="button" onClick={onClose} aria-label="Close this" className="absolute top-3 right-3 z-10 flex size-8 cursor-pointer items-center justify-center rounded-full text-background/60 transition-colors hover:bg-background/15 hover:text-background">
        <XIcon className="size-4" aria-hidden="true" />
      </button>

      <p className="min-w-0 max-w-2xl flex-1 pr-8 text-[clamp(1.5rem,5vw,2rem)] leading-[1] font-bold tracking-[-0.04em] md:pr-0">
        a centralized job search in the netherlands.
        <span className="mt-1.5 block">
          {CLAIM_PLAIN} <span className="text-brand">{CLAIM_ACCENT}</span>
        </span>
      </p>

      <div className="flex shrink-0 flex-col gap-4 md:w-60">
        <div className="flex h-14 items-center gap-3" aria-live="off">
          <span key={name} className="board-turn flex shrink-0">
            <SourceLogo name={name} size={48} />
          </span>
          <span key={`${name}-label`} className="board-turn min-w-0 text-xl leading-tight font-bold tracking-[-0.02em]">
            {name}
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("careersim:open-research", { detail: "reading-postings-and-limits" }))}
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-background"
        >
          <span className="underline underline-offset-4">see how we collect them</span> <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
