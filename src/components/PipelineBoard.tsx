import { askAboutOffer } from "@/components/OfferGate"
import { useState } from "react"
import { CompanyLogo } from "@/components/CompanyMark"
import { useFit } from "@/components/FitCells"
import { useData } from "@/lib/data"
import { sortJobs } from "@/lib/sort"
import { useViewConfig } from "@/lib/views"
import { formatAge, formatPlace } from "@/lib/format"
import type { Application, Posting, ViewName } from "@/lib/types"

/** The steps a job goes through, left to right. "Saved" is a job you kept but have not applied to. */
export type Step = "saved" | Application["stage"]

/**
 * Every status a job can have, in the order of a search. The board groups the three ways a job ends (turned down, never answered, you pulled out) in one column;
 * here they are separate, because "no reply" and "turned down" are different outcomes and both count as an application that did not reach an interview.
 */
export const STEPS: ReadonlyArray<{ step: Step; title: string }> = [
  { step: "saved", title: "Saved" },
  { step: "applied", title: "Applied" },
  { step: "interview", title: "Interview" },
  { step: "offer", title: "Offer" },
  { step: "rejected", title: "Rejected" },
  { step: "no_reply", title: "No reply" },
  { step: "withdrawn", title: "Withdrew" },
]

/** The steps where the search for this job has ended without an offer. */
export const ENDED: ReadonlySet<Step> = new Set<Step>(["rejected", "no_reply", "withdrawn"])

const COLUMNS: ReadonlyArray<{ step: Step; title: string; hint: string }> = [
  { step: "saved", title: "Saved", hint: "Kept, not applied yet" },
  { step: "applied", title: "Applied", hint: "Waiting to hear" },
  { step: "interview", title: "Interview", hint: "They want to talk" },
  { step: "offer", title: "Offer", hint: "An offer or a hire" },
  { step: "rejected", title: "Closed", hint: "Turned down, no reply, or withdrawn" },
]

interface Card {
  id: string
  post: Posting
  step: Step
  appId?: Application["id"]
}

type Data = ReturnType<typeof useData>

/** The step a job is at: its application's stage, or Saved when there is none. */
export function stepOf(data: Data, post: Posting): Step {
  const app = data.applications.find((a) => a.posting_id === post.id)

  return app ? (app.stage === "hired" ? "offer" : app.stage) : "saved"
}

/**
 * Moves a job to a step, from the board or the table. Moving a saved job to any
 * step after Saved logs an application; moving it back to Saved takes the
 * application away.
 */
export async function moveJob(data: Data, post: Posting, to: Step, fit: string, confirmed = false): Promise<void> {
  const app = data.applications.find((a) => a.posting_id === post.id)
  if ((app ? (app.stage === "hired" ? "offer" : app.stage) : "saved") === to) {
    return
  }
  if (to === "offer" && !confirmed) {
    askAboutOffer(post, fit)

    return
  }
  if (to === "saved") {
    if (app) {
      await data.removeApplication(app.id)
    }
    data.setSaved(post.id, true)

    return
  }
  if (app) {
    await data.changeStage(app.id, to)

    return
  }
  await data.logApplication(post, fit, to)
}


/** Which column an application sits in. A hire is an offer that was taken. */
const columnOf = (step: Step): Step => (step === "hired" ? "offer" : ENDED.has(step) ? "rejected" : step)

/**
 * The tracker as a board, the way job-search tools lay it out: a column per
 * step, a card per job. Drag a card, or use the menu on it, to move it. Moving
 * a saved job to any step after Saved logs an application; moving it back to
 * Saved takes the application away.
 */
export function PipelineBoard({ onOpen, viewName = "board", include }: { onOpen: (post: Posting) => void; viewName?: ViewName; include?: (post: Posting) => boolean }): React.JSX.Element {
  const data = useData()
  const view = useViewConfig(viewName)
  const [over, setOver] = useState<Step | null>(null)
  const [phone, setPhone] = useState<Step>("saved")

  const appliedIds = new Set(data.applications.map((a) => a.posting_id))
  const all: Card[] = [
    ...[...data.postings, ...data.keptExtra].filter((p) => data.saved.has(p.id) && !appliedIds.has(p.id)).map((post): Card => ({ id: post.id, post, step: "saved" })),
    ...data.applications.flatMap((a): Card[] => {
      const post = data.byId.get(a.posting_id)

      return post ? [{ id: post.id, post, step: a.stage, appId: a.id }] : []
    }),
  ]

  // Dropping a card in the column it is already in changes nothing (a job that got no reply stays "No reply", it does not become "Rejected").
  // The open view may keep only some of the jobs.
  const cards = include ? all.filter((c) => include(c.post)) : all

  const move = (card: Card, to: Step, fit: string): Promise<void> => (columnOf(card.step) === to ? Promise.resolve() : moveJob(data, card.post, to, fit))

  // Within a column, cards follow the sort chosen in Customize.
  if (view.config.sortKey) {
    const order = sortJobs(
      cards.map((c) => c.post),
      view.config.sortKey,
      view.config.sortDir,
      { reference: data.reference, shares: data.shares, profile: data.profile, referrals: data.referrals },
    )
    const rank = new Map(order.map((p, i) => [p.id, i]))
    cards.sort((a, b) => (rank.get(a.post.id) ?? 0) - (rank.get(b.post.id) ?? 0))
  }
  const countOf = (step: Step): number => cards.filter((c) => columnOf(c.step) === step).length

  return (
    <div className="flex flex-col gap-4">
      {/* On a phone or a tablet the board is one column at a time, chosen from this strip, the way tracker apps do it. */}
      <div role="tablist" aria-label="Steps" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
        {COLUMNS.map((column) => (
          <button
            key={column.step}
            type="button"
            role="tab"
            aria-selected={phone === column.step}
            onClick={() => setPhone(column.step)}
            className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] px-3.5 py-2 text-sm font-medium transition-colors duration-150 ${phone === column.step ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
          >
            {column.title}
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${phone === column.step ? "bg-primary-foreground/20" : "bg-secondary text-muted-foreground"}`}>{countOf(column.step)}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {COLUMNS.map((column) => {
          const here = cards.filter((c) => columnOf(c.step) === column.step)

          return (
            <section
              key={column.step}
              role="tabpanel"
              aria-label={`${column.title}, ${here.length} jobs`}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(column.step)
              }}
              onDragLeave={() => setOver((now) => (now === column.step ? null : now))}
              onDrop={(e) => {
                e.preventDefault()
                setOver(null)
                const card = cards.find((c) => c.id === e.dataTransfer.getData("text/plain"))
                if (card) {
                  move(card, column.step, "moved on the board").catch(() => undefined)
                }
              }}
              className={`min-h-32 flex-col gap-3 rounded-xl lg:flex lg:min-h-48 lg:border-[1.5px] lg:border-line lg:p-3 ${phone === column.step ? "flex" : "hidden"} ${over === column.step ? "bg-accent ring-2 ring-primary/30" : "lg:bg-secondary/40"}`}
            >
              <header className="hidden items-baseline justify-between gap-2 px-1 lg:flex">
                <div>
                  <h3 className="text-base font-semibold tracking-tight">{column.title}</h3>
                  <p className="text-xs text-muted-foreground">{column.hint}</p>
                </div>
                <span className="rounded-full bg-card px-2.5 py-0.5 text-sm font-medium tabular-nums">{here.length}</span>
              </header>
              <p className="text-sm text-muted-foreground lg:hidden">{column.hint}</p>
              {here.length === 0 ? <p className="rounded-xl border-[1.5px] border-dashed px-3 py-8 text-center text-sm text-muted-foreground">Nothing here</p> : null}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
                {here.map((card) => (
                  <JobCard key={card.id} card={card} onOpen={() => onOpen(card.post)} onMove={(to, fit) => move(card, to, fit)} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function JobCard({ card, onOpen, onMove }: { card: Card; onOpen: () => void; onMove: (to: Step, fit: string) => Promise<void> }): React.JSX.Element {
  const { post } = card
  const st = useFit(post)
  const fit = st ? (st.failing === 0 ? "met every requirement" : st.failing === 1 ? "missing one requirement" : "missing several requirements") : ""
  const closed = ENDED.has(card.step)

  return (
    <article
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", card.id)}
      className={`flex cursor-grab flex-col gap-3 rounded-lg border-[1.5px] border-line bg-card p-4 active:cursor-grabbing ${closed ? "opacity-60" : ""}`}
    >
      <button type="button" onClick={onOpen} className="flex cursor-pointer items-start gap-3 text-left">
        <span className="flex h-9 w-10 shrink-0 items-center justify-center">
          <CompanyLogo employer={post.employer} name={post.employer_display} size={32} wide={1.4} url={post.url} />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-3 block leading-snug font-semibold break-words">{post.title}</span>
          <span className="block text-[0.95rem]">{post.employer_display}</span>
          <span className="block text-sm text-muted-foreground">{formatPlace(post.region)}</span>
          {post.local ? null : <span className={`block text-sm ${formatAge(post) === "Date not shown" ? "text-muted-foreground" : "font-medium text-good-foreground"}`}>{formatAge(post)}</span>}
          {closed && card.step !== "rejected" ? <span className="block text-sm text-muted-foreground">{STEPS.find((c) => c.step === card.step)?.title}</span> : null}
        </span>
      </button>
      <select
        aria-label={`Move ${post.title}`}
        value={columnOf(card.step)}
        onChange={(e) => onMove(e.target.value as Step, fit).catch(() => undefined)}
        className="h-9 w-full cursor-pointer rounded-md border-[1.5px] bg-background px-2 text-sm text-foreground"
      >
        {COLUMNS.map((c) => (
          <option key={c.step} value={c.step}>
            {c.title}
          </option>
        ))}
      </select>
    </article>
  )
}

/** How many jobs are at each step, as one plain line under the title. Counts only. */
export function PipelineSummary(): React.JSX.Element {
  const data = useData()
  const applied = new Set(data.applications.map((a) => a.posting_id))
  const saved = [...data.postings, ...data.keptExtra].filter((p) => data.saved.has(p.id) && !applied.has(p.id)).length
  const count = (...stages: Array<Application["stage"]>): number => data.applications.filter((a) => stages.includes(a.stage)).length
  const parts = [
    [saved, "saved"],
    [count("applied"), "applied"],
    [count("interview"), count("interview") === 1 ? "interview" : "interviews"],
    [count("offer", "hired"), count("offer", "hired") === 1 ? "offer" : "offers"],
    [data.people.length, data.people.length === 1 ? "person" : "people"],
  ] as const
  const shown = parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`)

  return <p className="text-sm text-muted-foreground tabular-nums">{shown.length ? shown.join("  ·  ") : "Nothing tracked yet"}</p>
}
