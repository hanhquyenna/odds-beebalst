import { Fragment, useMemo, useState } from "react"
import { AddPropertyHeader, DeletePropertyButton } from "@/components/AddProperty"
import { ChevronDownIcon, ExternalLinkIcon } from "@/components/icons"
import { AllMark, BulkBar, DeleteDialog, RowMark, TableBar, useSelection } from "@/components/TableSelect"
import { PersonAvatar } from "@/components/PersonAvatar"
import { PropertyField } from "@/components/JobProperties"
import { EDIT_COLORS, openStatusColors } from "@/components/StatusPicker"
import { peopleChoices } from "@/components/ViewSettings"
import { overrideOf } from "@/lib/cells"
import { useData } from "@/lib/data"
import { downloadCsv, toCsv } from "@/lib/export-csv"
import { useFollowDays } from "@/lib/follow-days"
import { STAGES, stamp } from "@/lib/outreach-stage"
import { lastUpdate, nudgeFor, sortPeople } from "@/lib/people-table"
import { saved } from "@/lib/saved"
import { personColors, personLook } from "@/lib/status-colors"
import { isUrl, linkedinHref } from "@/lib/suggest"
import { CONTACT_STATUSES, type ContactStatus, type Person, type Posting, type PropertyType, type ViewName } from "@/lib/types"
import { useViewConfig } from "@/lib/views"

const GROUPS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "", label: "No grouping" },
  { key: "status", label: "Stage" },
  { key: "company", label: "Company" },
  { key: "job", label: "Linked job" },
]

const BIG_FIRST = new Set(["update", "messages"])
const day = (iso: string): string => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
const dash = <span className="text-muted-foreground">—</span>
const field = "h-8 w-full min-w-0 rounded-md border-[1.5px] border-transparent bg-transparent px-2 hover:border-input focus:border-ring focus:bg-background focus:outline-none"

/** The stage of one person as a coloured select: the colour is the one you chose for that stage. */
function StageSelect({ person }: { person: Person }): React.JSX.Element {
  const data = useData()
  const look = personLook(person.status, personColors(data.profile.statusColors))

  return (
    <span style={look ? { backgroundColor: look.background, color: look.ink, borderColor: "transparent" } : undefined} className="relative inline-flex h-8 w-36 items-center rounded-lg border-[1.5px] pr-7 pl-3 text-sm font-medium transition-colors duration-150 focus-within:ring-3 focus-within:ring-ring/50 hover:brightness-95">
      <span className="truncate">{person.status}</span>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 size-3.5 opacity-80" aria-hidden="true" />
      <select
        aria-label={`Stage of ${person.name}`}
        value={person.status}
        onChange={(e) => {
          if (e.target.value === EDIT_COLORS) {
            openStatusColors()

            return
          }
          data.updatePerson(person.id, stamp(e.target.value as ContactStatus))
          saved()
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        {CONTACT_STATUSES.map((s) => (
          <option key={s}>{s}</option>
        ))}
        <option value={EDIT_COLORS}>Edit colors</option>
      </select>
    </span>
  )
}

/**
 * The people you write to as a table, laid out like the jobs: one row per person, one column per property, the same Properties, Sort and Group controls and the same way to add
 * a property of your own. Every property is edited in place; the nudge is text ("7 days" or a date) and turns red when it is due. The arrow by a name opens everything about that person.
 */
export function PeopleTable({ people, onOpenPerson, onOpenJob, viewName, toolbar }: { people: ReadonlyArray<Person>; onOpenPerson: (p: Person) => void; onOpenJob: (post: Posting) => void; viewName: ViewName; toolbar?: React.ReactNode }): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const view = useViewConfig(viewName)
  const [deleting, setDeleting] = useState<"chosen" | null>(null)
  const nudgeDays = useFollowDays().nudge
  const { sortKey, sortDir } = view.config
  const groupBy = view.config.groupBy ?? ""
  const custom = profile.peopleColumns ?? []
  const typeOf = (name: string): PropertyType => profile.peopleColumnTypes?.[name] ?? "text"
  const note = (p: Person, name: string): string => profile.peopleNotes?.[p.id]?.[name] ?? ""
  const setNote = (p: Person, name: string, value: string): void => {
    data.setProfile({ ...profile, peopleNotes: { ...profile.peopleNotes, [p.id]: { ...profile.peopleNotes?.[p.id], [name]: value } } })
  }
  const typedNudge = (p: Person): string => overrideOf(profile.peopleNotes, p.id, "nudge")
  const postOf = (p: Person): Posting | null => (p.jobId ? (data.byId.get(p.jobId) ?? null) : null)
  const companyOf = (p: Person): string => postOf(p)?.employer_display ?? p.company
  const put = (p: Person, patch: Partial<Omit<Person, "id">>): void => data.updatePerson(p.id, patch)
  const kept = [...data.postings, ...data.keptExtra].filter((post) => data.saved.has(post.id) || data.applications.some((a) => a.posting_id === post.id))

  const columns = peopleChoices(custom).properties.filter((c) => view.show(c.key))

  const sorted = useMemo(
    () => sortPeople(people, sortKey, sortDir, (p) => postOf(p)?.title ?? "", note, nudgeDays),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, sortKey, sortDir, data.byId, profile.peopleNotes, nudgeDays],
  )

  const groupOf = (p: Person): string => {
    switch (groupBy) {
      case "status":
        return p.status
      case "company":
        return companyOf(p) || "No company yet"
      case "job":
        return postOf(p)?.title ?? "Not linked to a job"
      default:
        return ""
    }
  }
  const groups = useMemo(() => {
    if (!groupBy) return [{ label: "", people: sorted }]
    const map = new Map<string, Person[]>()
    for (const p of sorted) map.set(groupOf(p), [...(map.get(groupOf(p)) ?? []), p])
    const order = (label: string): number => (groupBy === "status" ? CONTACT_STATUSES.indexOf(label as ContactStatus) : 0)

    return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0])).map(([label, list]) => ({ label, people: list }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, groupBy, data.byId])

  const selection = useSelection(sorted.map((p) => p.id))
  const rowsOf = (ids: ReadonlySet<string> | null): Person[] => (ids ? sorted.filter((p) => ids.has(p.id)) : sorted)
  const nudgeText = (p: Person): string => typedNudge(p) || (STAGES[p.status]?.waiting ? `${nudgeDays} days` : "")
  const textOf = (p: Person, key: string): string => {
    if (key.startsWith("p:")) return note(p, key.slice(2))
    switch (key) {
      case "status":
        return p.status
      case "company":
        return companyOf(p)
      case "job":
        return postOf(p)?.title ?? ""
      case "role":
        return p.role ?? ""
      case "update":
        return lastUpdate(p) ?? ""
      case "nudge":
        return nudgeFor(p, typedNudge(p), new Date(), nudgeDays)?.on ?? typedNudge(p)
      case "contact":
        return p.contact
      case "place":
        return p.place ?? ""
      case "messages":
        return String(p.messages?.length ?? 0)
      case "notes":
        return p.notes
      default:
        return ""
    }
  }
  const exportRows = (ids: ReadonlySet<string> | null): void => {
    downloadCsv("my-people", toCsv(["Name", ...columns.map((c) => c.label)], rowsOf(ids).map((p) => [p.name, ...columns.map((c) => textOf(p, c.key))])))
  }
  const removePeople = (ids: ReadonlySet<string> | null): void => {
    for (const p of rowsOf(ids)) data.removePerson(p.id)
    selection.clear()
    setDeleting(null)
  }

  const press = (sort: string): void => view.update({ sortKey: sort, sortDir: sortKey === sort ? (sortDir === "asc" ? "desc" : "asc") : BIG_FIRST.has(sort) ? "desc" : "asc" })
  const header = (label: string, sort: string): React.JSX.Element => (
    <button type="button" onClick={() => press(sort)} aria-label={`Sort by ${label}`} className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-left text-[0.8125rem] font-medium hover:text-foreground ${sortKey === sort ? "text-foreground" : "text-muted-foreground"}`}>
      {label}
      {sortKey === sort ? <span aria-hidden="true">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
    </button>
  )

  const cell = (p: Person, key: string): React.ReactNode => {
    if (key.startsWith("p:")) {
      const name = key.slice(2)

      return <PropertyField post={{ title: p.name }} name={name} type={typeOf(name)} value={note(p, name)} onChange={(v) => setNote(p, name, v)} choices={profile.peopleColumnOptions?.[name]} wide />
    }
    switch (key) {
      case "status":
        return <StageSelect person={p} />
      case "company":
        return <input aria-label={`Company of ${p.name}`} placeholder="Company" value={companyOf(p)} onChange={(e) => put(p, { company: e.target.value })} className={field} />
      case "job": {
        const post = postOf(p)

        return (
          <span className="flex items-center gap-1">
            <select aria-label={`Linked job of ${p.name}`} value={p.jobId ?? ""} onChange={(e) => put(p, { jobId: e.target.value || null })} className={`${field} cursor-pointer`}>
              <option value="">Not linked</option>
              {[...kept, ...(post && !kept.some((k) => k.id === post.id) ? [post] : [])].map((k) => (
                <option key={k.id} value={k.id}>
                  {k.title} · {k.employer_display}
                </option>
              ))}
            </select>
            {post ? (
              <button type="button" aria-label={`Open ${post.title}`} onClick={() => onOpenJob(post)} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                <ExternalLinkIcon className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        )
      }
      case "role":
        return <input aria-label={`Current job of ${p.name}`} placeholder="Current job" value={p.role ?? ""} onChange={(e) => put(p, { role: e.target.value })} className={field} />
      case "update": {
        const d = lastUpdate(p)

        return <input type="date" aria-label={`Last update of ${p.name}`} value={d ?? ""} onChange={(e) => e.target.value && put(p, { statusAt: new Date(`${e.target.value}T12:00:00Z`).toISOString() })} className={field} />
      }
      case "nudge": {
        const n = nudgeFor(p, typedNudge(p), new Date(), nudgeDays)
        const base = STAGES[p.status]?.waiting ? `${nudgeDays} days` : ""

        return (
          <input
            aria-label={`Nudge for ${p.name}`}
            placeholder="e.g. 7 days"
            title={n ? `Due ${day(n.on)}` : "Type a number of days or a date"}
            value={nudgeText(p)}
            onChange={(e) => setNote(p, "@nudge", e.target.value === base ? "" : e.target.value)}
            className={`${field} ${n?.due ? "font-semibold text-red-600" : ""}`}
          />
        )
      }
      case "contact":
        return (
          <span className="flex items-center gap-1">
            <input aria-label={`Link for ${p.name}`} placeholder="LinkedIn, email or phone" value={p.contact} onChange={(e) => put(p, { contact: e.target.value })} className={field} />
            <a href={linkedinHref(p)} target="_blank" rel="noreferrer" title={isUrl(p.contact) ? `Open ${p.name} on LinkedIn` : `Search LinkedIn for ${p.name}`} aria-label={`Connect with ${p.name}`} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
              <ExternalLinkIcon className="size-4" aria-hidden="true" />
            </a>
          </span>
        )
      case "place":
        return <input aria-label={`Place of ${p.name}`} placeholder="Place" value={p.place ?? ""} onChange={(e) => put(p, { place: e.target.value })} className={field} />
      case "messages":
        return p.messages?.length ? p.messages.length : dash
      case "notes":
        return <input aria-label={`Notes on ${p.name}`} placeholder="Notes" value={p.notes} onChange={(e) => put(p, { notes: e.target.value })} className={field} />
      default:
        return null
    }
  }

  const numbers = new Map<string, number>()
  for (const g of groups) for (const p of g.people) numbers.set(p.id, numbers.size + 1)
  let drawn = 0
  const total = sorted.length

  return (
    <div className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
      <TableBar lead={`${total} ${total === 1 ? "person" : "people"}`} toolbar={toolbar} groupBy={groupBy} groups={GROUPS} onGroupBy={(key) => view.update({ groupBy: key })} />

      {selection.some ? <BulkBar count={selection.chosen.size} onExport={() => exportRows(selection.chosen)} onDelete={() => setDeleting("chosen")} onClear={selection.clear} /> : null}
      {deleting ? <DeleteDialog count={selection.chosen.size} noun={{ one: "person", many: "people" }} onConfirm={() => removePeople(selection.chosen)} onCancel={() => setDeleting(null)} /> : null}

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-card">
            <tr>
              <th scope="col" className="sticky left-0 z-30 w-10 min-w-10 border-b-[1.5px] sm:w-12 sm:min-w-12 border-line bg-card px-2 py-2.5 text-center">
                <AllMark checked={selection.all} some={selection.some} onToggle={selection.toggleAll} />
              </th>
              <th scope="col" className="sticky left-10 z-30 w-40 border-b-[1.5px] border-line bg-card px-3 py-2.5 text-left sm:left-12 sm:w-96 sm:px-4">
                {header("Name", "name")}
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`border-b-[1.5px] border-line px-3 py-2.5 text-left ${c.key === "contact" || c.key === "notes" || c.key === "role" || c.key === "job" || c.key.startsWith("p:") ? "w-52" : "w-40"}`}>
                  <span className="flex items-center justify-between gap-2">
                    {header(c.label, c.key)}
                    {c.key.startsWith("p:") ? (
                      <DeletePropertyButton label={c.label} kind="people" />
                    ) : null}
                  </span>
                </th>
              ))}
              <AddPropertyHeader kind="people" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const rows = g.people
              drawn += rows.length
              if (rows.length === 0) return null

              return (
                <Fragment key={g.label || "all"}>
                  {g.label ? (
                    <tr>
                      <td colSpan={columns.length + 3} className="sticky left-0 border-b-[1.5px] border-line bg-secondary/60 px-4 py-2 text-[0.8125rem] font-semibold">
                        {g.label} <span className="font-normal text-muted-foreground">· {g.people.length}</span>
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((p) => (
                    <tr key={p.id} className="group hover:bg-accent/40">
                      <td className="sticky left-0 z-[15] w-10 min-w-10 border-b-[1.5px] sm:w-12 sm:min-w-12 border-line bg-card px-2 py-2.5 group-hover:bg-accent/40">
                        <RowMark n={numbers.get(p.id) ?? 0} label={`Choose ${p.name}`} checked={selection.chosen.has(p.id)} onToggle={() => selection.toggle(p.id)} />
                      </td>
                      <td className="sticky left-10 z-[15] w-40 border-b-[1.5px] border-line bg-card px-3 py-2.5 group-hover:bg-accent/40 sm:left-12 sm:w-96 sm:px-4">
                        <span className="flex w-full items-center gap-2">
                          <PersonAvatar name={p.name} photo={p.photo} />
                          <input aria-label={`Name of ${p.name}`} placeholder="Name" value={p.name} onChange={(e) => put(p, { name: e.target.value })} className={`${field} min-w-0 flex-1 font-semibold`} />
                          <button type="button" aria-label={`Open ${p.name}`} title="Open details" onClick={() => onOpenPerson(p)} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-accent hover:text-foreground focus:opacity-100">
                            <ExternalLinkIcon className="size-4" aria-hidden="true" />
                          </button>
                        </span>
                      </td>
                      {columns.map((c) => (
                        <td key={c.key} className="overflow-hidden border-b-[1.5px] border-line px-3 py-2.5 align-middle text-ellipsis whitespace-nowrap">
                          {cell(p, c.key)}
                        </td>
                      ))}
                      <td className="border-b-[1.5px] border-line" />
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}
