import { useState } from "react"
import { RowStatus } from "@/components/StatusPicker"
import { JOB_GROUPS, groupJobs } from "@/components/job-groups"
import { BoardIcon, ChevronDownIcon } from "@/components/icons"
import { usePhone } from "@/lib/use-phone"
import { CompanyLogo } from "@/components/CompanyMark"
import { ENDED, STEPS, moveJob, type Step } from "@/components/job-steps"
import { useFit } from "@/components/FitCells"
import { useData } from "@/lib/data"
import { sortJobs } from "@/lib/sort"
import { useViewConfig } from "@/lib/views"
import { sourcesOf } from "@/components/SourceChips"
import { applySourceOf } from "@/lib/apply-source"
import { daysOr } from "@/lib/follow-days"
import { appliedOn, followUpOf, followUpText } from "@/lib/tracker"
import { formatAge, formatPlace } from "@/lib/format"
import type { Application, Posting, ViewName } from "@/lib/types"

const COLUMNS: ReadonlyArray<{ step: Step; title: string; hint: string; dot: string }> = [
  { step: "saved", title: "Saved", hint: "Kept, not applied yet", dot: "#6B645C" },
  { step: "applied", title: "Applied", hint: "Waiting to hear", dot: "#0A66C2" },
  { step: "interview", title: "Interview", hint: "They want to talk", dot: "#B4561A" },
  { step: "offer", title: "Offer", hint: "An offer or a hire", dot: "#1F7A4D" },
  { step: "rejected", title: "Closed", hint: "Turned down, no reply, or withdrawn", dot: "#6B645C" },
]

interface Card {
  id: string
  post: Posting
  step: Step
  appId?: Application["id"]
}

/** Which column an application sits in. A hire is an offer that was taken. */
const columnOf = (step: Step): Step => (step === "hired" ? "offer" : ENDED.has(step) ? "rejected" : step)

/**
 * The tracker as a board, the way job-search tools lay it out: a column per
 * step, a card per job. Drag a card, or use the menu on it, to move it. Moving
 * a saved job to any step after Saved logs an application; moving it back to
 * Saved takes the application away.
 */
export function PipelineBoard({ onOpen, viewName, include }: { onOpen: (post: Posting) => void; viewName: ViewName; include: (post: Posting) => boolean }): React.JSX.Element {
  const data = useData()
  const view = useViewConfig(viewName)
  const [over, setOver] = useState<Step | null>(null)
  const [phone, setPhone] = useState<Step>("saved")
  const onPhone = usePhone()

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
  const cards = all.filter((c) => include(c.post))

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
  // What the columns are: the steps unless this board was set to something else, so two boards can show the same jobs two ways.
  const columnsBy = view.config.groupBy && view.config.groupBy !== "status" ? view.config.groupBy : "status"

  if (columnsBy !== "status") {
    const lanes = groupJobs(data, cards.map((c) => c.post), columnsBy)
    const cardOf = new Map(cards.map((c) => [c.post.id, c]))

    return (
      <div className="flex flex-col gap-3">
        <div className={onPhone ? "no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2" : "no-scrollbar flex gap-4 overflow-x-auto pb-2"}>
          {lanes.map((lane) => (
            <section key={lane.label} aria-label={`${lane.label}, ${lane.posts.length} jobs`} className={`flex shrink-0 snap-start flex-col gap-2 self-start rounded-2xl bg-secondary p-2 ${onPhone ? "w-[86%]" : "w-72"}`}>
              <h3 className="flex items-center justify-between gap-2 px-2 pt-1 text-sm font-semibold">
                <span className="truncate">{lane.label}</span>
                <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums">{lane.posts.length}</span>
              </h3>
              <ul className="flex flex-col gap-2">
                {lane.posts.map((post) => {
                  const card = cardOf.get(post.id)

                  return card ? <BoardCard key={post.id} post={post} onOpen={() => onOpen(post)} /> : null
                })}
              </ul>
            </section>
          ))}
          {lanes.length === 0 ? <p className="px-1 py-8 text-sm text-muted-foreground">Nothing here yet.</p> : null}
        </div>
      </div>
    )
  }

  if (onPhone) {
    // A phone gets a board it can hold: one step at a time across the screen, swiped sideways, with the next step showing at the edge so it is plain there is more.
    // Each job is the same row as every other list; its status moves it to another step.
    return (
      <div className="flex flex-col gap-3">
      <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-3 overflow-x-auto px-5 pb-2">
        {COLUMNS.map((column) => {
          const here = cards.filter((c) => columnOf(c.step) === column.step)

          return (
            <section key={column.step} aria-label={`${column.title}, ${here.length} jobs`} className="flex w-[86%] shrink-0 snap-start flex-col gap-2 self-start rounded-2xl bg-secondary p-2">
              <h3 className="flex items-center justify-between px-2 pt-1 text-sm font-semibold">
                {column.title}
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums">{here.length}</span>
              </h3>
              {here.length === 0 ? (
                <p className="rounded-xl border-[1.5px] border-dashed border-line px-3 py-8 text-center text-sm text-muted-foreground">Nothing here</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {here.map((card) => (
                    <BoardCard key={card.id} post={card.post} onOpen={() => onOpen(card.post)} />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* On a tablet the board is one column at a time, chosen from this strip. A phone has its own board, above. */}
      <div role="tablist" aria-label="Steps" className="grid grid-cols-5 gap-1.5 max-md:hidden lg:hidden">
        {COLUMNS.map((column) => (
          <button
            key={column.step}
            type="button"
            role="tab"
            aria-selected={phone === column.step}
            onClick={() => setPhone(column.step)}
            className={`flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-lg border-[1.5px] px-1 py-2 text-xs font-medium transition-colors duration-150 sm:text-sm ${phone === column.step ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
          >
            <span className="max-w-full truncate">{column.title}</span>
            <span className={`rounded-full px-1.5 text-xs tabular-nums ${phone === column.step ? "bg-primary-foreground/20" : "bg-secondary text-muted-foreground"}`}>{countOf(column.step)}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 max-md:gap-6 lg:grid-cols-5">
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
              className={`min-h-32 flex-col gap-3 rounded-[18px] max-md:min-h-0 max-md:gap-2 lg:flex lg:min-h-[28rem] lg:border-[1.5px] lg:border-dashed lg:border-line lg:p-3 ${phone === column.step ? "flex" : "hidden"} ${here.length > 0 ? "max-md:flex" : "max-md:hidden"} ${over === column.step ? "bg-accent ring-2 ring-brand/30" : "lg:bg-secondary/60"}`}
            >
              <header className="hidden flex-col px-1 lg:flex">
                <h3 className="flex items-center gap-2 text-base font-extrabold tracking-tight">
                  <span className="size-2.5 rounded-full" style={{ background: column.dot }} aria-hidden="true" />
                  {column.title}
                  <span className="font-bold text-muted-foreground tabular-nums">{here.length}</span>
                </h3>
                <span className="pl-[1.125rem] text-xs text-muted-foreground">{column.hint}</span>
              </header>
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
  const data = useData()
  const st = useFit(post)
  const fit = st ? (st.failing === 0 ? "met every requirement" : st.failing === 1 ? "missing one requirement" : "missing several requirements") : ""
  const closed = ENDED.has(card.step)
  const app = data.applications.find((a) => a.posting_id === post.id)
  const day = appliedOn(app)
  const ago = day ? Math.max(0, Math.round((Date.now() - new Date(`${day}T12:00:00Z`).getTime()) / 86_400_000)) : null
  const follow = followUpOf(app, new Date(), daysOr(data.profile.followUpDays, 7))
  const canApply = card.step === "saved" && !post.closed_at && Boolean(applySourceOf(sourcesOf(post))?.url)
  const line = card.step === "saved" ? (post.local ? null : formatAge(post)) : ago !== null ? (ago === 0 ? "Applied today" : `Applied ${ago} ${ago === 1 ? "day" : "days"} ago`) : null

  return (
    <article draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", card.id)} className={`flex cursor-grab flex-col gap-2.5 rounded-xl border-[1.5px] border-line bg-card p-3.5 active:cursor-grabbing ${closed ? "opacity-70" : ""}`}>
      <button type="button" onClick={onOpen} className="flex cursor-pointer items-start gap-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-card shadow-[0_0_0_1.5px_var(--line)]">
          <CompanyLogo employer={post.employer} name={post.employer_display} size={28} wide={1.2} url={post.url} />
        </span>
        <span className="min-w-0">
          <span className="line-clamp-3 block text-[0.95rem] leading-snug font-extrabold break-words">{post.title}</span>
          <span className="block text-[0.8125rem] text-muted-foreground">{post.employer_display}</span>
        </span>
      </button>
      {line ? <span className="text-xs text-muted-foreground">{closed && card.step !== "rejected" ? `${STEPS.find((c) => c.step === card.step)?.title} · ${line}` : line}</span> : closed && card.step !== "rejected" ? <span className="text-xs text-muted-foreground">{STEPS.find((c) => c.step === card.step)?.title}</span> : null}
      <div className="flex flex-wrap gap-1.5">
        {canApply ? <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-extrabold text-[#8A3F10]">Odds can apply</span> : null}
        {follow && card.step === "applied" ? <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${follow.due ? "bg-[#FBE9E6] text-[#9B2C1F]" : "bg-[#E6F0FB] text-[#0A4F96]"}`}>{follow.due ? followUpText(follow) : `Reminder in ${follow.inDays} ${follow.inDays === 1 ? "day" : "days"}`}</span> : null}
      </div>
      <select aria-label={`Move ${post.title}`} value={columnOf(card.step)} onChange={(e) => onMove(e.target.value as Step, fit).catch(() => undefined)} className="h-9 w-full cursor-pointer rounded-lg border-[1.5px] border-line bg-card px-2 text-sm font-bold text-foreground">
        {COLUMNS.map((c) => (
          <option key={c.step} value={c.step}>
            {c.title}
          </option>
        ))}
      </select>
    </article>
  )
}

/**
 * What a board's columns are, as in Notion: the steps of your search, or any other property of the jobs. It sits in the toolbar beside
 * the layout; on a phone it is a compact pill (the choice only) so the whole toolbar stays on one line.
 */
export function ColumnsBy({ viewName }: { viewName: ViewName }): React.JSX.Element {
  const view = useViewConfig(viewName)
  const value = view.config.groupBy && view.config.groupBy !== "status" ? view.config.groupBy : "status"
  const label = JOB_GROUPS.find((g) => g.key === value)?.label ?? "Status"

  return (
    <label className="relative flex h-10 min-w-0 shrink! items-center gap-1.5 rounded-lg border-[1.5px] bg-card px-3 text-sm font-medium transition-colors duration-150 focus-within:ring-3 focus-within:ring-ring/50 hover:bg-accent max-md:gap-1 max-md:rounded-full max-md:px-3">
      <BoardIcon className="size-4 shrink-0 max-md:hidden" aria-hidden="true" />
      <span className="text-muted-foreground max-md:hidden">Columns by</span>
      <span className="truncate font-semibold">{label}</span>
      <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <select aria-label="Columns by" value={value} onChange={(e) => view.update({ groupBy: e.target.value })} className="absolute inset-0 size-full cursor-pointer opacity-0">
        {JOB_GROUPS.filter((g) => g.key !== "").map((g) => (
          <option key={g.key} value={g.key}>
            {g.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A board card: smaller than a list row, so a column reads as a column. The logo and the job, where and when, and its status to move it. */
function BoardCard({ post, onOpen }: { post: Posting; onOpen: () => void }): React.JSX.Element {
  const place = formatPlace(post.region).split(",")[0]
  const age = post.local ? null : formatAge(post)

  return (
    <li className="flex flex-col gap-2.5 rounded-xl bg-card p-3 shadow-sm">
      <button type="button" onClick={onOpen} className="flex w-full min-w-0 cursor-pointer items-start gap-3 text-left">
        <span className="flex w-9 shrink-0 justify-center pt-0.5">
          <CompanyLogo employer={post.employer} name={post.employer_display} size={30} wide={1.3} url={post.url} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="line-clamp-2 text-sm leading-snug font-semibold">{post.title}</span>
          <span className="truncate text-xs text-muted-foreground">{[post.employer_display, place].filter(Boolean).join(" · ")}</span>
          {age ? <span className={`text-xs ${age === "Date not shown" ? "text-muted-foreground" : "font-medium text-good-foreground"}`}>{age}</span> : null}
        </span>
      </button>
      <span className="pl-12 [&>span]:h-7 [&>span]:w-full [&>span]:text-[0.8125rem]">
        <RowStatus post={post} onOpen={() => onOpen()} />
      </span>
    </li>
  )
}
