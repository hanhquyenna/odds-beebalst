import type { Profile, PropertyType } from "@/lib/types"

/**
 * Properties of your own, for the job table and the people table alike. The usual ones from the popular job-tracker and outreach templates are offered with one press
 * (Priority, Deadline for jobs; Channel, Warmth for people); a select has its choices written here.
 */
export type TableKind = "jobs" | "people"

export interface PropertyPreset {
  name: string
  type: PropertyType
  options?: string[]
  /** One short line for what it is for. */
  hint: string
}

export const PROPERTY_PRESETS: ReadonlyArray<PropertyPreset> = [
  { name: "Priority", type: "select", options: ["High", "Medium", "Low"], hint: "Which to do first" },
  { name: "Next action", type: "text", hint: "What you will do next" },
  { name: "Last contacted", type: "date", hint: "When you last wrote to them" },
  { name: "Interview date", type: "date", hint: "Shows on the calendar" },
  { name: "Deadline", type: "date", hint: "Apply by" },
  { name: "Source", type: "select", options: ["LinkedIn", "Company site", "Recruiter", "Referral", "Other"], hint: "Where you found it" },
  { name: "Resume version", type: "text", hint: "Which CV you sent" },
  { name: "Recruiter", type: "text", hint: "Who is handling it" },
  { name: "Notes", type: "text", hint: "Anything to remember" },
]

export const PEOPLE_PRESETS: ReadonlyArray<PropertyPreset> = [
  { name: "Channel", type: "select", options: ["LinkedIn", "Email", "Event", "Intro", "Alumni network"], hint: "How you reach them" },
  { name: "Relationship", type: "select", options: ["Alumni", "Recruiter", "Hiring manager", "Peer", "Interviewer", "Friend of a friend"], hint: "How you know them" },
  { name: "Warmth", type: "select", options: ["Cold", "Warm", "Hot"], hint: "How well they know you" },
  { name: "Follow-up date", type: "date", hint: "Shows on the calendar" },
  { name: "Next action", type: "text", hint: "What you will do next" },
  { name: "Introduced by", type: "text", hint: "Who sent you" },
  { name: "Topics to ask", type: "text", hint: "What you want to learn" },
  { name: "Where we met", type: "text", hint: "Event, call or message" },
]

/** Which fields of the profile hold each table's own properties. */
const FIELDS = {
  jobs: { columns: "columns", types: "columnTypes", options: "columnOptions", notes: "notes" },
  people: { columns: "peopleColumns", types: "peopleColumnTypes", options: "peopleColumnOptions", notes: "peopleNotes" },
} as const

export interface OwnColumns {
  columns: string[]
  types: Record<string, PropertyType>
  options: Record<string, string[]>
  notes: Record<string, Record<string, string>>
}

/** The properties of your own for one table, whichever fields they live in. */
export function columnsOf(profile: Profile, kind: TableKind = "jobs"): OwnColumns {
  const f = FIELDS[kind]

  return {
    columns: (profile[f.columns] as string[] | undefined) ?? [],
    types: (profile[f.types] as Record<string, PropertyType> | undefined) ?? {},
    options: (profile[f.options] as Record<string, string[]> | undefined) ?? {},
    notes: (profile[f.notes] as Record<string, Record<string, string>> | undefined) ?? {},
  }
}

function withColumns(profile: Profile, kind: TableKind, next: Partial<OwnColumns>): Profile {
  const f = FIELDS[kind]
  const patch: Record<string, unknown> = {}
  if (next.columns) patch[f.columns] = next.columns
  if (next.types) patch[f.types] = next.types
  if (next.options) patch[f.options] = next.options
  if (next.notes) patch[f.notes] = next.notes

  return { ...profile, ...patch }
}

/** The presets for a table that this profile does not have yet (by name, ignoring case). */
export function availablePresets(profile: Profile, kind: TableKind = "jobs"): PropertyPreset[] {
  const have = new Set(columnsOf(profile, kind).columns.map((c) => c.toLowerCase()))

  return (kind === "people" ? PEOPLE_PRESETS : PROPERTY_PRESETS).filter((p) => !have.has(p.name.toLowerCase()))
}

/** Adds a property of your own. A name that is empty or already there (any case) changes nothing. Choices are kept for a select. */
export function addColumn(profile: Profile, name: string, type: PropertyType, options?: ReadonlyArray<string>, kind: TableKind = "jobs"): Profile {
  const clean = name.trim()
  const own = columnsOf(profile, kind)
  if (!clean || own.columns.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    return profile
  }
  const choices = (type === "select" || type === "multiselect") && options && options.length > 0 ? [...new Set(options.map((o) => o.trim()).filter(Boolean))] : null

  return withColumns(profile, kind, {
    columns: [...own.columns, clean],
    types: { ...own.types, [clean]: type },
    ...(choices ? { options: { ...own.options, [clean]: choices } } : {}),
  })
}

/** Takes a property away, with what was written under it for every row and its choices. */
export function removeColumn(profile: Profile, name: string, kind: TableKind = "jobs"): Profile {
  const own = columnsOf(profile, kind)
  const notes = Object.fromEntries(Object.entries(own.notes).map(([id, row]) => [id, Object.fromEntries(Object.entries(row).filter(([k]) => k !== name))]))

  return withColumns(profile, kind, {
    columns: own.columns.filter((c) => c !== name),
    types: Object.fromEntries(Object.entries(own.types).filter(([k]) => k !== name)),
    options: Object.fromEntries(Object.entries(own.options).filter(([k]) => k !== name)),
    notes,
  })
}

/** Writes one value of one of your own properties for one row. */
export function setNote(profile: Profile, kind: TableKind, id: string, name: string, value: string): Profile {
  const own = columnsOf(profile, kind)

  return withColumns(profile, kind, { notes: { ...own.notes, [id]: { ...own.notes[id], [name]: value } } })
}
