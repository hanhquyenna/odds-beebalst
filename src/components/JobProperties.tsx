import { useState } from "react"
import { ChevronDownIcon, ExternalLinkIcon, EyeIcon, EyeSlashIcon, XIcon } from "@/components/icons"
import { AddPropertyForm } from "@/components/AddProperty"
import { ChanceCell } from "@/components/FitCells"
import { AddPerson } from "@/components/People"
import { choicesFor } from "@/components/ViewSettings"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { removeColumn as removeColumnFrom } from "@/lib/columns"
import { useData } from "@/lib/data"
import { useNow } from "@/lib/use-now"
import type { Standing } from "@/lib/engine"
import { LEVELS, levelOf } from "@/lib/engine"
import { INDUSTRIES, industryOf } from "@/lib/industries"
import { formatAge, placeOf } from "@/lib/format"
import { openStatusOf, openStatusText } from "@/lib/open-status"
import { daysOr } from "@/lib/follow-days"
import { appliedOn, followUpOf, followUpText } from "@/lib/tracker"
import { payOf } from "@/lib/spec"
import { useViewConfig } from "@/lib/views"
import type { Posting, PropertyType } from "@/lib/types"

/** A soft colour per select value, the same every time, like Notion's option tags. */
function tint(value: string): string {
  let h = 0
  for (const ch of value) {
    h = (h * 31 + ch.charCodeAt(0)) % 360
  }

  return `oklch(0.94 0.045 ${h})`
}

/** One property of one job, edited in place, in whatever type the property was given. */
export function PropertyField({ post, name, type, value, onChange, wide = false, choices: given, suggestions }: { post: { title: string }; name: string; type: PropertyType; value: string; onChange: (v: string) => void; wide?: boolean; /** The choices of a select, when they are not the jobs' (people have their own). */ choices?: string[]; /** Values already used, offered to a select with no fixed choices. */ suggestions?: string[] }): React.JSX.Element {
  const data = useData()
  const label = `${name} for ${post.title}`
  const look = `h-8 rounded-md border-[1.5px] border-transparent bg-transparent px-2 hover:border-input focus:border-ring focus:bg-background focus:outline-none ${wide ? "w-full" : "w-44"}`
  const listId = `opts-${name.replace(/\W+/g, "-")}`

  if (type === "checkbox") {
    return <input type="checkbox" aria-label={label} checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "")} className="mx-3 size-4 cursor-pointer" />
  }
  if (type === "date") {
    return <input type="date" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={look} />
  }
  const choices = given ?? data.profile.columnOptions?.[name]
  if (type === "select" && choices && choices.length > 0) {
    // A select with its own choices (Priority: High, Medium, Low): pick one, shown as a coloured tag.
    return (
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={value ? { background: tint(value) } : undefined} className={`${look} cursor-pointer appearance-none ${value ? "rounded-full font-medium" : "text-muted-foreground"}`}>
        <option value="">—</option>
        {[...new Set([...choices, ...(value && !choices.includes(value) ? [value] : [])])].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  if (type === "select") {
    return (
      <>
        <input list={listId} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={value ? { background: tint(value) } : undefined} className={`${look} ${value ? "rounded-full font-medium" : ""}`} />
        <datalist id={listId}>
          {[...new Set(suggestions ?? Object.values(data.profile.notes).map((r) => r[name]).filter(Boolean))].map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </>
    )
  }
  if (type === "multiselect") {
    const chosen = value.split(",").map((x) => x.trim()).filter(Boolean)
    const all = [...new Set([...(given ?? data.profile.columnOptions?.[name] ?? []), ...(suggestions ?? []), ...chosen])]
    const flip = (o: string): void => onChange((chosen.includes(o) ? chosen.filter((x) => x !== o) : [...chosen, o]).join(", "))

    return (
      <Popover>
        <PopoverTrigger aria-label={label} className={`flex min-h-8 cursor-pointer flex-wrap items-center gap-1 rounded-md border-[1.5px] border-transparent px-2 py-1 text-left hover:border-input ${wide ? "w-full" : "w-44"}`}>
          {chosen.length === 0 ? <span className="text-muted-foreground">—</span> : chosen.map((c) => (
            <span key={c} style={{ background: tint(c) }} className="rounded-full px-2 py-0.5 text-[0.8125rem] font-medium">
              {c}
            </span>
          ))}
        </PopoverTrigger>
        <PopoverContent align="start" className="flex max-h-72 w-64 flex-col gap-0.5 overflow-y-auto p-1.5">
          {all.map((o) => (
            <button key={o} type="button" role="checkbox" aria-checked={chosen.includes(o)} onClick={() => flip(o)} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent">
              <span className={`flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] text-[0.625rem] ${chosen.includes(o) ? "border-foreground bg-foreground text-background" : "border-border"}`}>{chosen.includes(o) ? "✓" : ""}</span>
              {o}
            </button>
          ))}
          <input
            aria-label={`Add a choice to ${name}`}
            placeholder="Add a choice, press Enter"
            onKeyDown={(e) => {
              const input = e.currentTarget
              if (e.key === "Enter" && input.value.trim()) {
                e.preventDefault()
                if (!chosen.includes(input.value.trim())) onChange([...chosen, input.value.trim()].join(", "))
                input.value = ""
              }
            }}
            className="mt-1 h-8 rounded-md border-[1.5px] bg-background px-2 text-sm"
          />
        </PopoverContent>
      </Popover>
    )
  }
  if (type === "email" || type === "phone") {
    const href = type === "email" ? `mailto:${value}` : `tel:${value.replace(/\s/g, "")}`

    return (
      <span className="flex items-center gap-1">
        <input type={type === "email" ? "email" : "tel"} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={look} />
        {value.trim() ? (
          <a href={href} aria-label={`${type === "email" ? "Write to" : "Call"} ${value}`} className="text-muted-foreground hover:text-foreground">
            <ExternalLinkIcon className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </span>
    )
  }
  if (type === "url") {
    return (
      <span className="flex items-center gap-1">
        <input aria-label={label} value={value} placeholder="https://" onChange={(e) => onChange(e.target.value)} className={look} />
        {/^https?:\/\//.test(value) ? (
          <a href={value} target="_blank" rel="noreferrer noopener" aria-label={`Open ${name}`} className="text-muted-foreground hover:text-foreground">
            <ExternalLinkIcon className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </span>
    )
  }

  return <input type={type === "number" ? "number" : "text"} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={look} />
}

/**
 * Every job's properties, in one format whatever it came from: the ones we read
 * from the posting, then your own (columns from a sheet you uploaded become
 * these). The eye hides the ones you do not want to see; the same choice holds
 * for every job.
 */
export function JobProperties({ post, st }: { post: Posting; st: Standing | null }): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const view = useViewConfig("table")
  const now = useNow()
  const [menu, setMenu] = useState<boolean>(false)
  const [adding, setAdding] = useState<boolean>(false)
  const linked = data.people.filter((p) => p.jobId === post.id)
  const pay = payOf(post, data.reference)
  const note = (key: string): string => profile.notes[post.id]?.[key] ?? ""
  const setNote = (column: string, value: string): void => {
    data.setProfile({ ...profile, notes: { ...profile.notes, [post.id]: { ...profile.notes[post.id], [column]: value } } })
  }
  // A property read from the posting, in a fixed set of values, that you can change. Yours wins until you reset it.
  const choice = (key: string, read: string, options: ReadonlyArray<string>): React.ReactNode => (
    <span className="flex items-center gap-2">
      <select
        aria-label={`${key} of ${post.title}`}
        value={note(`@${key}`) || read}
        onChange={(e) => setNote(`@${key}`, e.target.value === read ? "" : e.target.value)}
        className="field-sizing-content max-w-full cursor-pointer appearance-none bg-transparent p-0 font-medium underline decoration-foreground/30 decoration-dotted underline-offset-4 hover:decoration-solid focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {note(`@${key}`) ? (
        <button type="button" onClick={() => setNote(`@${key}`, "")} className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          Reset
        </button>
      ) : null}
    </span>
  )
  const values: Record<string, React.ReactNode> = {
    chance: <ChanceCell st={st} post={post} />,
    pay: pay.text ? <span className="tabular-nums">{pay.text}{pay.perHour ? " an hour" : ""}</span> : <span className="text-muted-foreground">No figure</span>,
    location: <span>{placeOf(post.region)}</span>,
    // When the job went up. A job someone pasted in has no posting date.
    posted: post.local || formatAge(post) === "Date not shown" ? <span className="text-muted-foreground">Not known</span> : <span>{formatAge(post)}</span>,
    // The day you applied, and when to ask after it (a week later, while it is still waiting).
    applied: (() => {
      const day = appliedOn(data.applications.find((a) => a.posting_id === post.id))

      return day ? <span>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span> : <span className="text-muted-foreground">Not applied</span>
    })(),
    deadline: (() => {
      const v = note("@deadline") || post.valid_through || ""

      return /^\d{4}-\d{2}-\d{2}/.test(v) ? <span>{new Date(`${v.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span> : <span className="text-muted-foreground">Not known</span>
    })(),
    followup: (() => {
      const f = followUpOf(data.applications.find((a) => a.posting_id === post.id), now, daysOr(data.profile.followUpDays, 7))

      return f ? <span className={f.due ? "font-semibold text-red-600" : ""}>{followUpText(f)}</span> : <span className="text-muted-foreground">—</span>
    })(),
    // Whether our checks found the job still open, and when we last looked.
    open: (() => {
      const st = openStatusOf(post)

      return <span className={st.open ? "" : "font-semibold text-bad-foreground"}>{openStatusText(st)}</span>
    })(),
    // How many people had applied when we read it. LinkedIn only, and it stops counting at 200: a snapshot, so it starts hidden.
    applicants: post.applicants_text ? <span>{post.applicants_text}</span> : <span className="text-muted-foreground">Not known</span>,
    level: choice("level", levelOf(post), LEVELS),
    industry: choice("industry", industryOf(post) ?? "Not stated", ["Not stated", ...INDUSTRIES]),
    language: choice("language", post.dutch_required ? "Dutch needed" : "English", ["English", "Dutch needed"]),
    contact: null,
    sponsor: choice("sponsor", post.ind_sponsor ? "IND sponsor" : "Not a sponsor", ["IND sponsor", "Not a sponsor"]),
    // When odds first held this job (for a job someone pasted in, the day it was added). Starts hidden.
    added: post.fetched_at ? <span>{new Date(`${post.fetched_at.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span> : <span className="text-muted-foreground">Not known</span>,
  }
  const { properties } = choicesFor("table", profile.columns)
  // A column of yours called Contact stands in for ours, so the name is not shown twice.
  const standard = properties.filter((p) => p.key in values && !(p.key === "contact" && profile.columns.some((c) => c.toLowerCase() === "contact")))
  const all = [...standard.map((p) => ({ ...p, label: view.config.names?.[p.key] || p.label, custom: false })), ...profile.columns.map((c) => ({ key: `p:${c}`, label: c, custom: true }))]
  const toggle = view.toggle
  const typeOf = (name: string): PropertyType => profile.columnTypes[name] ?? "text"

  function removeColumn(name: string): void {
    data.setProfile(removeColumnFrom(profile, name))
  }

  /** A name you choose. Ours are kept as a label on this view; your own are renamed everywhere they are used. */
  function rename(key: string, raw: string): void {
    const to = raw.trim()
    if (!key.startsWith("p:")) {
      view.update({ names: { ...view.config.names, [key]: to } })

      return
    }
    const from = key.slice(2)
    if (!to || to === from || profile.columns.includes(to)) {
      return
    }
    const notes = Object.fromEntries(Object.entries(profile.notes).map(([id, row]) => [id, Object.fromEntries(Object.entries(row).map(([k, v]) => [k === from ? to : k, v]))]))
    const types = Object.fromEntries(Object.entries(profile.columnTypes).map(([k, v]) => [k === from ? to : k, v]))
    data.setProfile({
      ...profile,
      columns: profile.columns.map((c) => (c === from ? to : c)),
      columnTypes: types,
      notes,
      views: { ...profile.views, table: { ...view.config, hidden: view.config.hidden.map((k) => (k === key ? `p:${to}` : k)), sortKey: view.config.sortKey === key ? `p:${to}` : view.config.sortKey } },
    })
  }

  const eye = (key: string, label: string): React.ReactNode => (
    <button
      type="button"
      aria-label={`${view.show(key) ? "Hide" : "Show"} ${label}`}
      title={view.show(key) ? "Hide" : "Show"}
      onClick={() => toggle(key)}
      className="cursor-pointer rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
    >
      {view.show(key) ? <EyeSlashIcon className="size-3.5" aria-hidden="true" /> : <EyeIcon className="size-3.5" aria-hidden="true" />}
    </button>
  )
  const hiddenValue = <span className="text-muted-foreground">Hidden</span>

  return (
    <section aria-label="Properties" className="flex flex-col gap-3 rounded-xl border-[1.5px] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Properties</h2>
        <Popover open={menu} onOpenChange={setMenu}>
          <PopoverTrigger aria-label="Edit properties" className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
            Edit
            <ChevronDownIcon className="size-3.5" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-0.5 p-1.5">
            {all.map((p) => (
              <div key={p.key} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent">
                <button type="button" aria-label={`${view.show(p.key) ? "Hide" : "Show"} ${p.label}`} onClick={() => toggle(p.key)} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-foreground">
                  {view.show(p.key) ? <EyeIcon className="size-4" aria-hidden="true" /> : <EyeSlashIcon className="size-4" aria-hidden="true" />}
                </button>
                <input
                  key={p.label}
                  aria-label={`Name of ${p.label}`}
                  defaultValue={p.label}
                  onBlur={(e) => rename(p.key, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className={`h-7 min-w-0 flex-1 rounded border-[1.5px] border-transparent bg-transparent px-1.5 text-sm focus:border-ring focus:bg-background focus:outline-none ${view.show(p.key) ? "" : "text-muted-foreground"}`}
                />
                {p.custom ? (
                  <button type="button" aria-label={`Delete ${p.label}`} onClick={() => removeColumn(p.label)} className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:text-destructive">
                    <XIcon className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            ))}
            <div className="mt-1 border-t-[1.5px] pt-1">
              <AddPropertyForm onDone={() => setMenu(false)} />
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        {all.map((p) => {
          const on = view.show(p.key)
          const name = p.key.startsWith("p:") ? p.key.slice(2) : ""

          return (
            <div key={p.key} className={`group min-w-0 ${on ? "" : "opacity-60"}`}>
              <dt className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
                {p.label}
                {eye(p.key, p.label)}
              </dt>
              <dd className="mt-0.5 min-h-7 font-medium break-words">
                {!on ? (
                  hiddenValue
                ) : p.key === "contact" ? (
                  <span className="flex flex-col items-start gap-1">
                    {linked.map((c) => (
                      <span key={c.id}>
                        {c.name}{c.role ? <span className="font-normal text-muted-foreground"> · {c.role}</span> : null}
                      </span>
                    ))}
                    {adding ? null : (
                      <button type="button" onClick={() => setAdding(true)} className="cursor-pointer font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                        {linked.length > 0 ? "Add another" : "Add"}
                      </button>
                    )}
                  </span>
                ) : name ? (
                  <PropertyField post={post} name={name} type={typeOf(name)} value={profile.notes[post.id]?.[name] ?? ""} onChange={(v) => setNote(name, v)} wide />
                ) : (
                  values[p.key]
                )}
              </dd>
            </div>
          )
        })}
      </dl>

      {adding ? <AddPerson fixedJob={post} onDone={() => setAdding(false)} /> : null}
    </section>
  )
}
