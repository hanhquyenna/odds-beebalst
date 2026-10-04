import { AllMark, BulkBar, DeleteDialog, RowMark, useSelection } from "@/components/TableSelect"
import { GroupByButton } from "@/components/GroupByButton"
import { Fragment, useMemo, useState } from "react"
import { AddPropertyForm } from "@/components/AddProperty"
import { PencilIcon, PlusIcon, XIcon } from "@/components/icons"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ChanceCell, useFit } from "@/components/FitCells"
import { CompanyLogo } from "@/components/CompanyMark"
import { PropertyField } from "@/components/JobProperties"
import { STEPS, stepOf } from "@/components/PipelineBoard"
import { applicationOf, trackerSortValue } from "@/components/tracker-values"
import { RowStatus } from "@/components/StatusPicker"
import { choicesFor } from "@/components/ViewSettings"
import { useData } from "@/lib/data"
import { removeColumn } from "@/lib/columns"
import { downloadCsv, toCsv } from "@/lib/export-csv"
import { appliedDay, cellKey, followUpFor, followUpText, overrideOf } from "@/lib/cells"
import { daysOr } from "@/lib/follow-days"
import { LEVELS, levelOf } from "@/lib/engine"
import { placeOf } from "@/lib/format"
import { INDUSTRIES, industryOf } from "@/lib/industries"
import { sortJobs } from "@/lib/sort"
import { FOLLOW_UP_DAYS, appliedOn } from "@/lib/tracker"
import { payOf } from "@/lib/spec"
import { useViewConfig } from "@/lib/views"
import type { Posting, PropertyType, ViewName } from "@/lib/types"

/** What the table can be grouped by. */
const GROUPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "", label: "No grouping" },
  { key: "status", label: "Status" },
  { key: "open", label: "Still open" },
  { key: "company", label: "Company" },
  { key: "level", label: "Level" },
  { key: "industry", label: "Industry" },
  { key: "location", label: "Location" },
]

/** The sort a property's header stands for (sort.ts), where it differs from its own name. */
const SORT_OF: Record<string, string> = { posted: "newest" }

/** The first rows shown, and how many more each press adds: a hundred jobs scroll inside the table, and the browser draws only these. */

/** The built-in properties you can edit in the table, and how each is edited. Whatever you type is kept with the job and wins over what we read, until you clear it. The interview chance and the status picker are not here: the chance is an estimate, and the status has its own menu. */
const EDITABLE: Record<string, { type: PropertyType; options?: ReadonlyArray<string> }> = {
  applied: { type: "date" },
  followup: { type: "text" },
  pay: { type: "text" },
  location: { type: "text" },
  posted: { type: "date" },
  deadline: { type: "date" },
  open: { type: "select", options: ["Open", "Closed"] },
  level: { type: "select", options: LEVELS },
  industry: { type: "select", options: ["Not stated", ...INDUSTRIES] },
  language: { type: "select", options: ["English", "Dutch needed"] },
  sponsor: { type: "select", options: ["IND sponsor", "Not a sponsor"] },
  contact: { type: "text" },
  applicants: { type: "text" },
  added: { type: "date" },
}

const BIG_FIRST = new Set(["pay", "chance", "newest", "level", "applicants", "added"])

function ChanceTd({ post }: { post: Posting }): React.JSX.Element {
  return <ChanceCell st={useFit(post)} post={post} />
}

/**
 * The jobs you kept as a table, like a Notion database: one row per job, one column per property. The properties are the same ones every job shows inside it, and the same
 * choice of which to show (Properties). A header sorts by its column and the same press reverses it; Group puts the rows under headings. Closed jobs stay, marked.
 * Any property you added yourself is a column you can edit in place.
 */
export function TrackerTable({ posts, onOpen, viewName, toolbar, manage = true, rowLimit, footer, onDismiss, showCount = true, lead }: { posts: ReadonlyArray<Posting>; onOpen: (post: Posting) => void; viewName: ViewName; /** The Table, Sort and Properties buttons, kept in the table's own bar. */ toolbar?: React.ReactNode; /** False for a table of jobs that are not yours yet (the ones that fit you): no Clear all and no Delete, since there is nothing of yours to remove. */ manage?: boolean; /** Show only this many rows, with `footer` as the last row inside the table (the way to see more). */ rowLimit?: number; footer?: React.ReactNode; /** Gives each row an X: not interested, not recommended again. */ onDismiss?: (post: Posting) => void; /** False to leave out the number of jobs in the bar. */ showCount?: boolean; /** Stands in the place of the count (the Filter toggle). */ lead?: React.ReactNode }): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const view = useViewConfig(viewName)
  const [deleting, setDeleting] = useState<"chosen" | null>(null)
  const followDays = daysOr(profile.followUpDays, FOLLOW_UP_DAYS)
  const [editing, setEditing] = useState<string | null>(null)
  const { sortKey, sortDir } = view.config
  const groupBy = view.config.groupBy ?? ""
  const typeOf = (name: string): PropertyType => profile.columnTypes[name] ?? "text"
  const note = (post: Posting, name: string): string => profile.notes[post.id]?.[name] ?? ""
  const setNote = (post: Posting, name: string, value: string): void => {
    data.setProfile({ ...profile, notes: { ...profile.notes, [post.id]: { ...profile.notes[post.id], [name]: value } } })
  }

  const columns = choicesFor("table", profile.columns).properties.filter((p) => view.show(p.key))

  /** A built-in property as we read it, before anything you typed. */
  const baseOf = (post: Posting, key: string): string => {
    switch (key) {
      case "applied":
        return appliedOn(applicationOf(data, post)) ?? ""
      case "followup":
        return followUpText(applicationOf(data, post), "", followDays)
      case "pay": {
        const pay = payOf(post, data.reference)

        return pay.text ? `${pay.text}${pay.perHour ? " an hour" : ""}` : ""
      }
      case "location":
        return placeOf(post.region)
      case "posted":
        return post.posted_at ? post.posted_at.slice(0, 10) : ""
      case "deadline":
        return post.valid_through && /^\d{4}-\d{2}-\d{2}/.test(post.valid_through) ? post.valid_through.slice(0, 10) : ""
      case "open":
        return post.closed_at ? "Closed" : "Open"
      case "level":
        return levelOf(post)
      case "industry":
        return industryOf(post) ?? "Not stated"
      case "language":
        return post.dutch_required ? "Dutch needed" : "English"
      case "sponsor":
        return post.ind_sponsor ? "IND sponsor" : "Not a sponsor"
      case "contact":
        return data.people.filter((p) => p.jobId === post.id).map((p) => p.name).join(", ")
      case "applicants":
        return post.applicants_text ?? ""
      case "added":
        return post.fetched_at ? post.fetched_at.slice(0, 10) : ""
      default:
        return ""
    }
  }
  /** What the table shows and sorts by: what you typed, else what we read. */
  const valueOf = (post: Posting, key: string): string => {
    const typed = overrideOf(profile.notes, post.id, key)

    return typed !== "" ? typed : baseOf(post, key)
  }
  const titleOf = (post: Posting): string => overrideOf(profile.notes, post.id, "title") || post.title
  const companyOf = (post: Posting): string => overrideOf(profile.notes, post.id, "company") || post.employer_display
  const saveCell = (post: Posting, key: string, value: string): void => setNote(post, cellKey(key), value === baseOf(post, key) ? "" : value)

  const sorted = useMemo(() => {
    if (!sortKey) {
      return [...posts]
    }
    const extra = (post: Posting): string | number | null => trackerSortValue(data, sortKey, post)
    // A property you have typed over is sorted by what is shown; empty values go last either way.
    if (EDITABLE[sortKey] && posts.some((p) => overrideOf(profile.notes, p.id, sortKey) !== "")) {
      const rank = (post: Posting): string | number | null => {
        const v = sortKey === "followup" ? (followUpFor(applicationOf(data, post), overrideOf(profile.notes, post.id, "followup"), appliedDay(applicationOf(data, post), overrideOf(profile.notes, post.id, "applied")), new Date(), followDays)?.on ?? "") : sortKey === "applied" ? (appliedDay(applicationOf(data, post), overrideOf(profile.notes, post.id, "applied")) ?? "") : valueOf(post, sortKey)

        return v === "" ? null : sortKey === "level" ? LEVELS.length - LEVELS.indexOf(v as (typeof LEVELS)[number]) : v
      }
      const sign = sortDir === "asc" ? 1 : -1

      return [...posts].sort((a, b) => {
        const x = rank(a)
        const y = rank(b)
        if (x === null && y === null) return 0
        if (x === null) return 1
        if (y === null) return -1

        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sign
      })
    }

    return sortJobs(posts, sortKey, sortDir, { reference: data.reference, shares: data.shares, profile, referrals: data.referrals }, extra)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, sortKey, sortDir, profile, data.applications, data.reference, data.shares, data.referrals])

  const groupOf = (post: Posting): string => {
    switch (groupBy) {
      case "status":
        return STEPS.find((c) => c.step === stepOf(data, post))?.title ?? "Saved"
      case "open":
        return post.closed_at ? "Closed" : "Open"
      case "company":
        return post.employer_display
      case "level":
        return levelOf(post)
      case "industry":
        return industryOf(post) ?? "No industry"
      case "location":
        return placeOf(post.region)
      default:
        return ""
    }
  }
  const order = (label: string): number => (groupBy === "status" ? STEPS.findIndex((c) => c.title === label) : groupBy === "level" ? LEVELS.indexOf(label as (typeof LEVELS)[number]) : groupBy === "open" ? (label === "Open" ? 0 : 1) : 0)
  const groups = useMemo(() => {
    if (!groupBy) {
      return [{ label: "", posts: sorted }]
    }
    const map = new Map<string, Posting[]>()
    for (const post of sorted) {
      const label = groupOf(post)
      map.set(label, [...(map.get(label) ?? []), post])
    }

    return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).map(([label, list]) => ({ label, posts: list }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, groupBy, data.applications])

  const selection = useSelection(sorted.map((p) => p.id))
  const rowsOf = (ids: ReadonlySet<string> | null): Posting[] => (ids ? sorted.filter((p) => ids.has(p.id)) : sorted)

  /** The text of a property for the file you export. The interview chance is a live estimate and is left out. */
  const textOf = (post: Posting, key: string): string => {
    if (key.startsWith("p:")) return note(post, key.slice(2))
    if (key === "status") return STEPS.find((c) => c.step === stepOf(data, post))?.title ?? "Not saved"

    return valueOf(post, key)
  }
  const exportRows = (ids: ReadonlySet<string> | null): void => {
    const exported = columns.filter((c) => c.key !== "chance")
    downloadCsv("my-jobs", toCsv(["Job", "Company", "Link", ...exported.map((c) => c.label)], rowsOf(ids).map((post) => [titleOf(post), companyOf(post), post.url, ...exported.map((c) => textOf(post, c.key))])))
  }
  const removeJobs = (ids: ReadonlySet<string> | null): void => {
    const gone = rowsOf(ids)
    // What you wrote on those jobs goes with them.
    data.setProfile({ ...profile, notes: Object.fromEntries(Object.entries(profile.notes).filter(([id]) => !gone.some((p) => p.id === id))) })
    for (const post of gone) {
      data.setSaved(post.id, false)
      const app = applicationOf(data, post)
      if (app) data.removeApplication(app.id).catch(() => undefined)
      if (post.local) data.removeLocalPosting(post.id)
    }
    selection.clear()
    setDeleting(null)
  }

  function press(sort: string): void {
    const on = sortKey === sort
    view.update({ sortKey: sort, sortDir: on ? (sortDir === "asc" ? "desc" : "asc") : BIG_FIRST.has(sort) ? "desc" : "asc" })
  }
  const arrow = (sort: string): React.ReactNode => (sortKey === sort ? <span aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span> : null)
  const header = (label: string, sort: string): React.JSX.Element => (
    <button type="button" onClick={() => press(sort)} aria-label={`Sort by ${label}`} className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-left text-[0.8125rem] font-medium hover:text-foreground ${sortKey === sort ? "text-foreground" : "text-muted-foreground"}`}>
      {label}
      {arrow(sort)}
    </button>
  )

  const cell = (post: Posting, key: string): React.ReactNode => {
    if (key.startsWith("p:")) {
      const name = key.slice(2)

      return <PropertyField post={post} name={name} type={typeOf(name)} value={note(post, name)} onChange={(v) => setNote(post, name, v)} />
    }
    const edit = EDITABLE[key]
    if (edit) {
      const f = key === "followup" ? followUpFor(applicationOf(data, post), overrideOf(profile.notes, post.id, "followup"), appliedDay(applicationOf(data, post), overrideOf(profile.notes, post.id, "applied")), new Date(), followDays) : null

      return (
        <span className={`-mx-2 block ${f?.due ? "font-semibold text-red-600" : ""}`}>
          <PropertyField post={post} name={key} type={edit.type} value={valueOf(post, key)} choices={edit.options ? [...edit.options] : undefined} wide onChange={(v) => saveCell(post, key, v)} />
        </span>
      )
    }
    switch (key) {
      case "status":
        return <RowStatus post={post} />
      case "chance":
        return <ChanceTd post={post} />
      default:
        return null
    }
  }

  // The running number of each row, down the whole table in the order it is shown, groups included.
  const numbers = new Map<string, number>()
  for (const g of groups) for (const post of g.posts) numbers.set(post.id, numbers.size + 1)
  const rowNumber = (post: Posting): number => numbers.get(post.id) ?? 0
  let drawn = 0
  const total = sorted.length

  return (
    <div className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-[1.5px] border-line px-4 py-2.5 text-sm">
        <span className="text-muted-foreground">
          {lead ?? (showCount ? `${total} ${total === 1 ? "job" : "jobs"}` : null)}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {toolbar}
          <GroupByButton value={groupBy} groups={GROUPS} onChange={(key) => view.update({ groupBy: key })} />
        </span>
      </div>

      {selection.some ? <BulkBar count={selection.chosen.size} onExport={() => exportRows(selection.chosen)} onDelete={manage ? () => setDeleting("chosen") : undefined} onClear={selection.clear} /> : null}
      {deleting ? <DeleteDialog count={selection.chosen.size} noun={{ one: "job", many: "jobs" }} onConfirm={() => removeJobs(selection.chosen)} onCancel={() => setDeleting(null)} /> : null}

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-max min-w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr>
              <th scope="col" className="sticky left-0 z-30 w-12 min-w-12 border-b-[1.5px] border-line bg-card px-2 py-2.5 text-center">
                <AllMark checked={selection.all} some={selection.some} onToggle={selection.toggleAll} />
              </th>
              <th scope="col" className="sticky left-12 z-30 w-96 border-b-[1.5px] border-line bg-card px-4 py-2.5 text-left">
                {header("Job", "title")}
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`${c.key.startsWith("p:") ? "w-52" : "w-40"} border-b-[1.5px] border-line px-3 py-2.5 text-left`}>
                  <span className="flex items-center gap-2">
                    {header(c.label, SORT_OF[c.key] ?? c.key)}
                    {c.key.startsWith("p:") ? (
                      <button type="button" aria-label={`Delete ${c.label}`} title={`Delete ${c.label}`} onClick={() => data.setProfile(removeColumn(profile, c.label))} className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-60 hover:text-destructive hover:opacity-100">
                        <XIcon className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </span>
                </th>
              ))}
              <th scope="col" className="w-12 border-b-[1.5px] border-line px-3 py-2.5 text-left">
                <Popover>
                  <PopoverTrigger aria-label="Add a property" title="Add a property" className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
                    <PlusIcon className="size-4" aria-hidden="true" />
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-1.5">
                    <AddPropertyForm />
                  </PopoverContent>
                </Popover>
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const room = Math.max(0, (rowLimit ?? Infinity) - drawn)
              const rows = g.posts.slice(0, room)
              drawn += rows.length
              if (rows.length === 0) {
                return null
              }

              return (
                <Fragment key={g.label || "all"}>
                  {g.label ? (
                    <tr>
                      <td colSpan={columns.length + 3} className="sticky left-0 border-b-[1.5px] border-line bg-secondary/60 px-4 py-2 text-[0.8125rem] font-semibold">
                        {g.label} <span className="font-normal text-muted-foreground">· {g.posts.length}</span>
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((post) => (
                    <tr key={post.id} className={`group hover:bg-accent/40 ${post.closed_at ? "opacity-70" : ""}`}>
                      <td className="sticky left-0 z-[15] w-12 min-w-12 border-b-[1.5px] border-line bg-card px-2 py-2.5 group-hover:bg-accent/40">
                        <RowMark n={rowNumber(post)} label={`Choose ${post.title}`} checked={selection.chosen.has(post.id)} onToggle={() => selection.toggle(post.id)} />
                      </td>
                      <td className="sticky left-12 z-[15] w-96 border-b-[1.5px] border-line bg-card px-4 py-2.5 group-hover:bg-accent/40">
                        {editing === post.id ? (
                          <span className="flex w-full items-start gap-3">
                            <span className="flex size-9 shrink-0 items-center justify-center">
                              <CompanyLogo employer={post.employer} name={companyOf(post)} size={32} wide={1.3} url={post.url} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <input autoFocus aria-label={`Job title of ${post.title}`} value={titleOf(post)} onChange={(e) => setNote(post, cellKey("title"), e.target.value === post.title ? "" : e.target.value)} onKeyDown={(e) => e.key === "Enter" && setEditing(null)} className="h-8 rounded-md border-[1.5px] border-input bg-background px-2 font-semibold focus:border-ring focus:outline-none" />
                              <input aria-label={`Company of ${post.title}`} value={companyOf(post)} onChange={(e) => setNote(post, cellKey("company"), e.target.value === post.employer_display ? "" : e.target.value)} onKeyDown={(e) => e.key === "Enter" && setEditing(null)} className="h-8 rounded-md border-[1.5px] border-input bg-background px-2 focus:border-ring focus:outline-none" />
                            </span>
                            <button type="button" onClick={() => setEditing(null)} className="mt-1 cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                              Done
                            </button>
                          </span>
                        ) : (
                          <span className="flex w-full items-center gap-1">
                            <button type="button" onClick={() => onOpen(post)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                              <span className="flex size-9 shrink-0 items-center justify-center">
                                <CompanyLogo employer={post.employer} name={companyOf(post)} size={32} wide={1.3} url={post.url} />
                              </span>
                              <span className="flex min-w-0 flex-col">
                                <span className="line-clamp-1 font-semibold">{titleOf(post)}</span>
                                <span className="line-clamp-1 text-muted-foreground">{companyOf(post)}</span>
                              </span>
                              {post.closed_at ? <span className="ml-auto shrink-0 rounded-md bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white">Closed</span> : null}
                            </button>
                            <button type="button" aria-label={`Edit the name of ${post.title}`} title="Edit job title and company" onClick={() => setEditing(post.id)} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100">
                              <PencilIcon className="size-4" aria-hidden="true" />
                            </button>
                          </span>
                        )}
                      </td>
                      {columns.map((c) => (
                        <td key={c.key} className="overflow-hidden border-b-[1.5px] border-line px-3 py-2.5 align-middle text-ellipsis whitespace-nowrap">
                          {cell(post, c.key)}
                        </td>
                      ))}
                      <td className="border-b-[1.5px] border-line px-3 py-2.5">
                        {onDismiss ? (
                          <button type="button" aria-label={`Not interested in ${post.title}`} title="Not interested: don't recommend this again" onClick={() => onDismiss(post)} className="flex size-7 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground">
                            <XIcon className="size-4" aria-hidden="true" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            {footer ? (
              <tr>
                <td colSpan={columns.length + 3} className="border-b-[1.5px] border-line p-0">
                  <div className="sticky left-0 w-[min(100vw-3rem,64rem)] max-w-full">{footer}</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

    </div>
  )
}
