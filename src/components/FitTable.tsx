import { useMemo, useRef, useState } from "react"
import { FilterEditor } from "@/components/JobFilters"
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon, XIcon } from "@/components/icons"
import { JobRow } from "@/components/JobBoard"
import { DEFAULT_FILTERS, FIELD_OPTIONS, applyFilters, type JobFilters } from "@/lib/filters"
import { useSavedViews } from "@/lib/use-saved-views"
import { Button } from "@/components/ui/button"
import { useData, type Data } from "@/lib/data"
import { profileFields } from "@/lib/field"
import { fitFilters, withFitLanguage } from "@/lib/fit-filters"
import { openLinkedInImport } from "@/lib/open-profile"
import { CV_ACCEPT, profileWithCv } from "@/lib/cv-profile"
import { oddsV2 } from "@/lib/odds-v2"
import { tailor } from "@/lib/tailor"
import { useCompanyProfiles } from "@/lib/company-profile"
import { useFitEngine } from "@/lib/use-fit-engine"
import type { Posting } from "@/lib/types"

/** How many rows are shown at each step: a first look, a longer one, then everything. */
const STEPS = [5, 20] as const

/** The last row of the list or table: "Show more" for a longer look, then "Show less" and "Show all". Underlined, inside the table. */
function MoreRow({ total, step, setStep }: { total: number; step: 0 | 1 | 2; setStep: (s: 0 | 1 | 2) => void }): React.JSX.Element | null {
  const link = "cursor-pointer text-sm underline underline-offset-4 hover:text-foreground"
  const first = STEPS[0]
  const second = STEPS[1]
  if (total <= first) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-5 px-4 py-3 text-muted-foreground">
      {step === 0 ? (
        <button type="button" onClick={() => setStep(1)} className={link}>
          Show more
        </button>
      ) : (
        <>
          <button type="button" onClick={() => setStep(0)} className={link}>
            Show less
          </button>
          {step === 1 && total > second ? (
            <button type="button" onClick={() => setStep(2)} className={link}>
              Show all
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

/**
 * Jobs tailored to you: your preferences and the lines of work your profile points to, together with jobs like the ones you saved or
 * applied to and the roles on your own CV, ranked by what you are into, then the newest, then your interview chance (src/lib/tailor.ts). Each row says why it is here. Where you saved jobs in a line of work
 * your profile does not reach yet, a line says so and what would change it. Jobs you kept, applied to or dismissed are left out.
 * Five show first; "Show more" makes it twenty, and "Show all" everything.
 */
export function FitTable({ onOpen }: { onOpen: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const saved = useSavedViews("fit")
  const { filters } = saved
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const profiles = useCompanyProfiles()
  const engine = useFitEngine()

  const fields = useMemo(() => profileFields(data.profile), [data.profile])
  // English unless a language is chosen, and until a line of work is chosen, the ones your profile points to (src/lib/fit-filters.ts, shared with the morning message).
  const effective = useMemo(() => fitFilters(filters, data.profile, fields), [filters, data.profile, fields])
  const needsProfile = data.profile.positions.length === 0 && data.profile.education.length === 0
  const { strengthFor } = data

  const rows = useMemo(() => {
    if (!data.reference || !data.shares || needsProfile) return []
    const ref = data.reference
    const pool = notYours({ postings: data.postings, applications: data.applications, saved: data.saved, passed: data.passed })
    const ctx = { signals: data.signals, reference: ref }
    const fitting = new Set(applyFilters(pool, effective, ctx).map((p) => p.id))
    const applied = new Set(data.applications.map((a) => a.posting_id))
    const mine = [...data.postings, ...data.keptExtra].filter((p) => data.saved.has(p.id) || applied.has(p.id))
    if (!engine) return []
    const { chanceOf, fitOf } = engine
    const liftOf = (post: Posting): string | null => {
      const top = oddsV2(post, data.profile, { record: strengthFor(post) }).parts.filter((x) => x.z > 0.05).sort((a, b) => b.z - a.z)[0]

      return top ? top.label.replace(/^Most relevant: /, "").replace(/ \((same|a neighbouring|another) line of work\)$/, "") : null
    }
    // Your own choices (language, level, place) still hold; only the automatic lines of work are widened by what you saved.
    const candidates = applyFilters(pool, withFitLanguage(filters), ctx)

    const own = [...data.profile.positions.map((p) => p.Title ?? ""), data.profile.headline].filter((t) => t.trim() !== "")

    return tailor({ candidates, fitting, saved: mine, chanceOf, profiles, liftOf, own, fieldOrder: filters.field, fitOf })
  }, [data.postings, data.keptExtra, data.profile, data.reference, data.shares, data.saved, data.applications, data.passed, data.signals, strengthFor, effective, filters, profiles, needsProfile, engine])

  if (!data.reference) return null
  const rowLimit = step === 2 ? rows.length : STEPS[step]

  return (
    <FitSection label="Jobs tailored to you" heading="Jobs tailored to you" what="the jobs tailored to you" filters={filters} auto={fields} onChange={saved.setFilters} needsProfile={needsProfile} empty={rows.length === 0}>
      <ul className="overflow-hidden rounded-xl border-[1.5px] border-line bg-card max-md:-mx-5 max-md:rounded-none max-md:border-x-0">
        {rows.slice(0, rowLimit).map((r) => (
          <li key={r.post.id} className="relative after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border last:after:hidden md:after:left-4">
            <JobRow post={r.post} onOpen={() => onOpen(r.post)} note={r.note} chance={r.chance} dismissible />
          </li>
        ))}
      </ul>
      <MoreRow total={rows.length} step={step} setStep={setStep} />
    </FitSection>
  )
}

/** The tailored list's heading with the pencil for your preferences, then the jobs, or the import prompt until a profile is in. */
function FitSection({ label, heading, what, filters, auto, onChange, needsProfile, empty, children }: { label: string; heading: string; what: string; filters: JobFilters; auto: string[]; onChange: (next: JobFilters) => void; needsProfile: boolean; empty: boolean; children: React.ReactNode }): React.JSX.Element {
  const [editing, setEditing] = useState<boolean>(false)

  return (
    <section aria-label={label} className="mt-10 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
        <button type="button" aria-label="Edit your job preferences" title="Edit your job preferences" onClick={() => setEditing(true)} className="flex size-9 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-line bg-card text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
          <PencilIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {editing ? <PreferencesDialog filters={withFitLanguage(filters)} auto={auto} onChange={onChange} onClose={() => setEditing(false)} /> : null}
      {needsProfile ? <ImportPrompt what={what} /> : empty ? <p className="text-sm text-muted-foreground">Nothing here fits your preferences. Loosen them with the pencil.</p> : children}
    </section>
  )
}

/** Shown in both job lists until a profile is in: the same box, the same button, so the two sections match. */
function ImportPrompt({ what }: { what: string }): React.JSX.Element {
  const data = useData()
  const input = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState<boolean>(false)
  const [problem, setProblem] = useState<string | null>(null)

  // The CV is the other way in: read in the browser, it fills the profile and the list appears.
  async function take(file: File | undefined): Promise<void> {
    if (!file) return
    setReading(true)
    setProblem(null)
    try {
      data.setProfile(await profileWithCv(data.profile, file))
    } catch (caught) {
      setProblem(caught instanceof Error ? caught.message : "We could not read that file.")
    } finally {
      setReading(false)
      if (input.current) input.current.value = ""
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] border-dashed border-line bg-secondary/30 px-5 py-6">
      <p className="font-medium">Import your LinkedIn or upload your CV to see {what}.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={openLinkedInImport} className="cursor-pointer">
          Import LinkedIn
        </Button>
        <input ref={input} type="file" accept={CV_ACCEPT} aria-label="Your CV" className="sr-only" onChange={(e) => void take(e.target.files?.[0])} />
        <Button type="button" variant="outline" disabled={reading} onClick={() => input.current?.click()} className="cursor-pointer">
          {reading ? "Reading…" : "Upload your CV"}
        </Button>
      </div>
      {problem ? <p role="alert" className="text-sm text-destructive">{problem}</p> : null}
    </div>
  )
}

/**
 * What you want, set in one place, the way a job site asks: how recent, what level of job, where, which line of work, which language. The jobs that fit you are narrowed to these,
 * then ranked by your interview chance. They are kept with the profile.
 */
function PreferencesDialog({ filters, auto, onChange, onClose }: { filters: JobFilters; auto: string[]; onChange: (next: JobFilters) => void; onClose: () => void }): React.JSX.Element {
  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()} className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Job preferences" onKeyDown={(e) => e.key === "Escape" && onClose()} className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border-[1.5px] bg-card shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b-[1.5px] px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight">Job preferences</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <p className="mb-4 text-sm text-muted-foreground">These help tailor the jobs that fit you.</p>
          <FieldRanking value={filters.field} auto={auto} onChange={(field) => onChange({ ...filters, field })} />
          <FilterEditor filters={filters} onChange={onChange} hide={["field"]} />
          <NotInterested />
        </div>
        <div className="flex items-center justify-between gap-2 border-t-[1.5px] px-5 py-3">
          <button type="button" onClick={() => onChange({ ...DEFAULT_FILTERS })} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Reset preferences
          </button>
          <Button type="button" onClick={onClose} className="cursor-pointer">
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}

/** How many lines of work you can rank. */
const MAX_FIELDS = 3

/** Up to three lines of work, in your order. Empty: the list follows the lines of work your profile points to (`auto`), and says which. */
function FieldRanking({ value, auto, onChange }: { value: string[]; auto: string[]; onChange: (next: string[]) => void }): React.JSX.Element {
  const move = (i: number, by: -1 | 1): void => {
    const next = [...value]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    onChange(next)
  }
  const left = FIELD_OPTIONS.filter((f) => !value.includes(f))
  const button = "flex size-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"

  return (
    <div className="mb-4 rounded-xl border-[1.5px] bg-secondary/30 p-3">
      <p className="text-sm font-medium">Your job fields, in order</p>
      <p className="mb-2 text-xs text-muted-foreground">Pick up to {MAX_FIELDS}. The list shows only these, the first one on top.</p>
      {value.length === 0 && auto.length > 0 ? <p className="mb-2 text-xs text-muted-foreground">None picked: the list follows your profile ({auto.slice(0, MAX_FIELDS).join(", ")}).</p> : null}
      <ol className="flex flex-col gap-1.5">
        {value.map((f, i) => (
          <li key={f} className="flex items-center gap-2 rounded-lg border-[1.5px] bg-card px-3 py-1.5 text-sm">
            <span className="w-4 font-semibold tabular-nums text-brand">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">{f}</span>
            <button type="button" aria-label={`Move ${f} up`} disabled={i === 0} onClick={() => move(i, -1)} className={button}>
              <ChevronUpIcon className="size-3.5" aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Move ${f} down`} disabled={i === value.length - 1} onClick={() => move(i, 1)} className={button}>
              <ChevronDownIcon className="size-3.5" aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Remove ${f}`} onClick={() => onChange(value.filter((x) => x !== f))} className={button}>
              <XIcon className="size-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      {value.length < MAX_FIELDS ? (
        <label className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <PlusIcon className="size-4" aria-hidden="true" />
          <select value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])} aria-label="Add a job field" className="h-9 min-w-0 flex-1 cursor-pointer rounded-lg border-[1.5px] bg-card px-2 text-sm text-foreground">
            <option value="">{value.length === 0 ? "Add your first job field" : "Add another"}</option>
            {left.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}

/** The jobs you pressed X on, with a way to bring each back. They stay out of the recommendations until you do. */
function NotInterested(): React.JSX.Element | null {
  const data = useData()
  const ids = data.profile.dismissed ?? []
  if (ids.length === 0) return null

  return (
    <div className="mt-5 border-t-[1.5px] pt-4">
      <p className="mb-2 text-sm font-medium">Not interested ({ids.length})</p>
      <ul className="flex flex-col gap-1.5">
        {ids.map((id) => {
          const post = data.byId.get(id)

          return (
            <li key={id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-muted-foreground">{post ? `${post.title} · ${post.employer_display}` : "A job that is no longer listed"}</span>
              <button type="button" onClick={() => data.setPassed(id, false)} className="shrink-0 cursor-pointer underline underline-offset-4 hover:text-foreground">
                Show again
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The open jobs that are not yours yet: not kept, applied to or dismissed, and not added by you. */
export function notYours(data: Pick<Data, "postings" | "applications" | "saved" | "passed">): Posting[] {
  const applied = new Set(data.applications.map((a) => a.posting_id))

  return data.postings.filter((post) => !post.local && !post.closed_at && !data.saved.has(post.id) && !applied.has(post.id) && !data.passed.has(post.id))
}
