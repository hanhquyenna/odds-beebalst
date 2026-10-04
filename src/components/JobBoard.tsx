import { BookmarkIcon, XIcon } from "@/components/icons"
import { useEffect, useMemo, useRef, useState } from "react"
import { setDrawerClose } from "@/lib/drawer"
import { createPortal } from "react-dom"
import { CompanyLogo } from "@/components/CompanyMark"
import { JobDetail } from "@/components/JobDetail"
import { RowStatus } from "@/components/StatusPicker"
import { Button } from "@/components/ui/button"
import { SourceCorner } from "@/components/SourceChips"
import { useData } from "@/lib/data"
import { DEFAULT_FILTERS } from "@/lib/filters"
import { useApplyFilter } from "@/lib/filter-bus"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { removeFromList, toggleSave } from "@/lib/save"
import { toast } from "sonner"
import { formatAge, formatPlace } from "@/lib/format"
import type { Posting } from "@/lib/types"

/** Jobs listed before "Show more", and how many each press adds. */
const FIRST = 10
const MORE = 10

export interface JobGroup {
  /** A heading over the group. Omitted when there is only one. */
  label?: string
  jobs: ReadonlyArray<Posting>
}

interface JobBoardProps {
  groups: ReadonlyArray<JobGroup>
  /** The public view: the personal part of each job is locked behind the questions. */
  locked?: { onUnlock: () => void }
  empty?: React.ReactNode
  /** When the page wants to open a job itself (a logo in the strip), it holds the selection. */
  selected?: Posting | null
  onSelect?: (post: Posting | null) => void
}

/**
 * The jobs as a ledger: one line each, the same facts in the same columns. A
 * click opens the whole job in a panel that slides in from the right, on a
 * phone as much as on a laptop, so there is one way to look at a job whatever
 * the screen.
 */
export function JobBoard({ groups, locked, empty, selected, onSelect }: JobBoardProps): React.JSX.Element {
  const flat = useMemo(() => groups.flatMap((group) => group.jobs), [groups])
  const [shown, setShown] = useState<number>(FIRST)
  const top = useRef<HTMLDivElement | null>(null)
  const [own, setOwn] = useState<Posting | null>(null)
  const open = selected !== undefined ? selected : own
  const setOpen = (post: Posting | null): void => {
    if (onSelect) {
      onSelect(post)
    } else {
      setOwn(post)
    }
  }
  const drawer = open ? <JobDrawer post={open} locked={locked} onClose={() => setOpen(null)} onSwitch={setOpen} /> : null

  if (flat.length === 0) {
    return (
      <>
        {empty ?? <NoMatches />}
        {drawer}
      </>
    )
  }

  // Groups are cut to the page as one list, so the heading of a group that has not started yet does not show.
  let budget = shown

  return (
    <>
      <div ref={top} className="@container scroll-mt-20 overflow-hidden rounded-xl border-[1.5px] bg-card text-foreground">
        {groups.map((group) => {
          const visible = group.jobs.slice(0, Math.max(0, budget))
          budget -= visible.length
          if (visible.length === 0) {
            return null
          }

          return (
            <section key={group.label ?? "all"}>
              {group.label ? <h3 className="border-b-[1.5px] bg-secondary/60 px-4 py-2.5 text-sm font-semibold @2xl:px-6">{group.label}</h3> : null}
              <ul>
                {visible.map((post) => (
                  <li key={post.id} className="relative after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px after:bg-border last:after:hidden @2xl:after:left-6">
                    <JobRow post={post} onOpen={() => setOpen(post)} />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {flat.length > shown || shown > FIRST ? (
          <div className="flex items-center justify-center gap-2 border-t-[1.5px] p-4 text-center">
            {shown > FIRST ? (
              <Button
                variant="outline"
                onClick={() => {
                  setShown(FIRST)
                  // The list gets short again, so bring its top back into view instead of leaving the reader far below it.
                  top.current?.scrollIntoView({ block: "start" })
                }}
                className="cursor-pointer"
              >
                Show less
              </Button>
            ) : null}
            {flat.length > shown ? (
              <Button variant="outline" onClick={() => setShown((count) => count + MORE)} className="cursor-pointer">
                Show more ({(flat.length - shown).toLocaleString()} left)
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {drawer}
    </>
  )
}

interface JobRowProps {
  post: Posting
  onOpen: () => void
  /** Shows the status under the job, so it can be changed from the list. */
  status?: boolean
  /** Shows an X to say you are not interested: the job goes and is not recommended again. */
  dismissible?: boolean
}

/**
 * One job, the same on every list: logo, title, company, place and how long ago
 * it went up. Everything else is inside. The whole row opens the job; the
 * bookmark saves it.
 */
export function JobRow({ post, onOpen, status, dismissible }: JobRowProps): React.JSX.Element {
  const data = useData()
  const kept = data.saved.has(post.id) || data.applications.some((a) => a.posting_id === post.id)
  const [asking, setAsking] = useState<boolean>(false)
  // The way a row leaves: it jumps down to the jobs that fit you when you take it off your list, up to your list when you save it, and aside when you dismiss it. The change is made as it goes.
  const [flying, setFlying] = useState<"up" | "down" | "away" | null>(null)
  const go = (way: "up" | "down" | "away", act: () => void): void => {
    setFlying(way)
    window.setTimeout(act, 380)
  }
  // A job someone pasted in has no posting date, so the line is left out (its "Date added" is a property inside the job).
  const posted = post.local || (post.source === "linkedin_user" && post.days_open === null) ? null : formatAge(post)

  return (
    <div className={`relative flex items-center gap-4 border-l-4 px-3 py-4 transition-colors duration-150 hover:bg-accent/60 @2xl:px-5 ${flying ? `row-fly-${flying}` : ""} ${post.dutch_required ? "border-brand bg-brand/[0.04]" : "border-transparent"}`}>
      <div className={`flex min-w-0 flex-1 flex-col pr-12 ${status ? "@lg:pr-48" : ""}`}>
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 text-left after:absolute after:inset-0 after:content-['']">
          <span className="flex size-12 shrink-0 items-center justify-center">
            <CompanyLogo employer={post.employer} name={post.employer_display} size={48} wide={1.3} url={post.url} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="line-clamp-2 text-base leading-snug font-semibold">{post.title}</span>
            <span className="truncate text-[0.95rem]">{post.employer_display}</span>
            <span className="truncate text-sm text-muted-foreground">{formatPlace(post.region)}</span>
            {post.closed_at ? <span className="w-fit rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white">Closed</span> : null}
            {post.dutch_required ? <span className="w-fit rounded-md border-[1.5px] border-brand/60 bg-brand/10 px-2 py-0.5 text-xs font-medium">Dutch needed</span> : null}
            {posted ? <span className={posted === "Date not shown" ? "text-sm text-muted-foreground" : "text-sm font-medium text-good-foreground"}>{posted}</span> : null}
          </span>
        </button>
        {/* On a narrow list the status sits under the job; from a medium width it moves to the side, in line on every row. */}
        {status ? (
          <div className="pt-1 pl-16 @lg:hidden">
            <RowStatus post={post} />
          </div>
        ) : null}
      </div>
      {status ? (
        <div className="absolute top-1/2 right-[4.25rem] z-10 hidden -translate-y-1/2 @lg:block">
          <RowStatus post={post} />
        </div>
      ) : null}

      <div className="absolute top-1/2 right-3 z-10 flex w-12 -translate-y-1/2 flex-col items-center gap-0.5">
        <button
          type="button"
          aria-label={kept ? `Remove ${post.title} from your saved jobs` : `Save ${post.title}`}
          aria-pressed={kept}
          onClick={() => (kept ? setAsking(true) : go("up", () => toggleSave(data, post)))}
          className={`flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 ${kept ? "text-brand" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
        >
          <BookmarkIcon weight={kept ? "fill" : "bold"} className="size-5" aria-hidden="true" />
        </button>
        <SourceCorner post={post} />
      </div>
      {dismissible && !kept ? (
        <button
          type="button"
          aria-label={`Not interested in ${post.title}`}
          title="Not interested: don't recommend this again"
          onClick={() =>
            go("away", () => {
              data.setPassed(post.id, true)
              toast(`${post.title} will not be recommended again`, { id: "job-undo", duration: 4000, action: { label: "Undo", onClick: () => data.setPassed(post.id, false) } })
            })
          }
          className="absolute top-2 right-3 z-10 flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      ) : null}
      {asking ? (
        <ConfirmDialog
          title="Remove this job from your list?"
          body={data.applications.some((a) => a.posting_id === post.id) ? `${post.title} goes back to the jobs that fit you, and the application you logged on it is removed.` : `${post.title} goes back to the jobs that fit you.`}
          confirm="Remove"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false)
            go("down", () => removeFromList(data, post))
          }}
        />
      ) : null}
    </div>
  )
}

interface JobDrawerProps {
  post: Posting
  locked?: { onUnlock: () => void }
  onClose: () => void
  /** Shows a different job in the same panel. */
  onSwitch?: (post: Posting) => void
}

/**
 * The job, sliding in from the right over the list. Esc, the backdrop, the close
 * button and the phone's back gesture all close it, and the page behind does not
 * scroll while it is open.
 */
export function JobDrawer({ post, locked, onClose, onSwitch }: JobDrawerProps): React.JSX.Element {
  useEffect(() => {
    const scrollY = window.scrollY
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const here = history.state && typeof history.state === "object" && history.state.drawer === post.id
    // An entry for this job that we did not add (left over from before a reload) is not ours to go back from.
    if (!here) {
      history.pushState({ drawer: post.id }, "")
      pushedFor = post.id
    }
    const onPop = (): void => {
      pushedFor = null
      onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        close()
      }
    }
    function close(): void {
      // The panel closes at once, whatever the browser's history says: a close that waited for history to go back did nothing when the entry and the panel were out of step.
      // The history entry this panel added is then taken off afterwards, so the back button does not stop on a job that is already closed.
      const added = pushedFor === post.id
      pushedFor = null
      onClose()
      if (added) {
        history.back()
      }
    }
    window.addEventListener("popstate", onPop)
    window.addEventListener("keydown", onKey)
    closeRef = close
    setDrawerClose(close)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("keydown", onKey)
      window.scrollTo(0, scrollY)
    }
    // The drawer is keyed on the post by its parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])

  // Drawn at the top of the page, not where the list is: the list sits in a band
  // that is moved sideways, which would make "fixed" mean "fixed to the band".
  return createPortal(
    <div className="fixed inset-0 z-40 text-foreground">
      <button type="button" aria-label="Close" onClick={() => closeRef()} className="absolute inset-0 cursor-default bg-[oklch(0.2_0.03_265_/_0.5)] animate-in fade-in duration-200" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${post.title} at ${post.employer_display}`}
        className="absolute inset-y-0 right-0 flex w-full max-w-[46rem] flex-col overflow-y-auto bg-background shadow-2xl animate-in slide-in-from-right duration-300"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-[1.5px] bg-background px-4 py-3 sm:px-6">
          <span className="text-sm font-medium text-muted-foreground">Job</span>
          <button type="button" aria-label="Close" onClick={() => closeRef()} className="flex size-9 cursor-pointer items-center justify-center rounded-full border-[1.5px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
        <JobDetail key={post.id} pane post={post} locked={locked} onBack={() => undefined} onPick={() => closeRef()} onOpenJob={onSwitch} />
      </aside>
    </div>,
    document.body,
  )
}

/** The job whose history entry the open drawer added, so it only goes back from an entry it made. */
let pushedFor: string | null = null

/** The close action of the open drawer, set by its effect so the buttons and the key share one way out. */
let closeRef: () => void = () => undefined

/** What the list says when nothing matches, so an empty page never looks broken. Where the page can change its filters, one press puts them back. */
function NoMatches(): React.JSX.Element {
  const apply = useApplyFilter()

  return (
    <div role="status" className="flex flex-col items-center gap-3 rounded-xl border-[1.5px] bg-card px-6 py-12 text-center text-foreground">
      <p className="text-lg font-semibold">No jobs match that</p>
      <p className="max-w-md text-sm text-muted-foreground">Try fewer or shorter words, or loosen a filter. Jobs that need Dutch are hidden while English is on.</p>
      {apply ? (
        <Button variant="outline" onClick={() => apply({ ...DEFAULT_FILTERS })} className="cursor-pointer">
          Clear the search and filters
        </Button>
      ) : null}
    </div>
  )
}
