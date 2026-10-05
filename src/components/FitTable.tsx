import { useMemo, useState } from "react"
import { FilterEditor } from "@/components/JobFilters"
import { PencilIcon, XIcon } from "@/components/icons"
import { Tracker } from "@/components/Tracker"
import { DEFAULT_FILTERS, applyFilters } from "@/lib/filters"
import { useSavedViews } from "@/lib/use-saved-views"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { standing } from "@/lib/engine"
import { profileFields } from "@/lib/field"
import { openLinkedInImport } from "@/lib/open-profile"
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
 * The open jobs that fit you, from your profile the way a CV would be read. With no preferences chosen, the lines of work are the ones your profile points to (finance, data,
 * marketing and so on, from your job titles and degrees), and the newest jobs come first. Your preferences (the pencil) narrow it further. Jobs you have kept, applied to or
 * dismissed are left out. Five show first; "Show more" makes it twenty, and "Show all" everything.
 */
export function FitTable({ onOpen }: { onOpen: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const saved = useSavedViews("fit")
  const { filters } = saved
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [editing, setEditing] = useState<boolean>(false)

  const fields = useMemo(() => profileFields(data.profile), [data.profile])
  // Until a line of work is chosen in the preferences, it is the ones your profile points to.
  const effective = useMemo(() => (filters.field.length > 0 || fields.length === 0 ? filters : { ...filters, field: fields }), [filters, fields])
  const needsProfile = data.profile.positions.length === 0 && data.profile.education.length === 0

  const shown = useMemo(() => {
    const applied = new Set(data.applications.map((a) => a.posting_id))
    const open = data.postings.filter((post) => !post.local && !post.closed_at && !data.saved.has(post.id) && !applied.has(post.id) && !data.passed.has(post.id))
    // Newest first; a job with no posting date goes last.
    return [...applyFilters(open, effective, { signals: data.signals, reference: data.reference })].sort((x, y) => (x.days_open ?? 1e9) - (y.days_open ?? 1e9) || x.title.localeCompare(y.title))
  }, [data.postings, data.saved, data.applications, data.passed, data.signals, data.reference, effective])

  if (!data.reference) return null
  const rowLimit = step === 2 ? shown.length : STEPS[step]
  const footer = <MoreRow total={shown.length} step={step} setStep={setStep} />

  return (
    <section aria-label="Jobs that fit you" className="mt-10 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Jobs that fit you</h2>
        <button type="button" aria-label="Edit your job preferences" title="Edit your job preferences" onClick={() => setEditing(true)} className="flex size-9 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-line bg-card text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
          <PencilIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {editing ? <PreferencesDialog filters={effective} onChange={saved.setFilters} onClose={() => setEditing(false)} /> : null}
      {needsProfile ? (
        <ImportPrompt what="the jobs that fit you" />
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here fits your preferences. Loosen them with the pencil.</p>
      ) : (
        <Tracker posts={shown} onOpen={onOpen} viewName={saved.configName} rowLimit={rowLimit} footer={footer} dismissible />
      )}
    </section>
  )
}

/**
 * The open jobs where you are most likely to hear back: the same list, the same preferences, but ordered by your interview chance, the highest first, and the newest first among equals.
 * Jobs you have kept, applied to or dismissed are left out.
 */
export function HearBackTable({ onOpen }: { onOpen: (post: Posting) => void }): React.JSX.Element | null {
  const data = useData()
  const saved = useSavedViews("fit")
  const { filters } = saved
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [editing, setEditing] = useState<boolean>(false)
  const needsProfile = data.profile.positions.length === 0 && data.profile.education.length === 0
  const { strengthFor } = data

  const shown = useMemo(() => {
    if (!data.reference || !data.shares || needsProfile) return []
    const applied = new Set(data.applications.map((a) => a.posting_id))
    const open = data.postings.filter((post) => !post.local && !post.closed_at && !data.saved.has(post.id) && !applied.has(post.id) && !data.passed.has(post.id))
    const rows: Array<{ post: Posting; mid: number }> = []
    for (const post of applyFilters(open, filters, { signals: data.signals, reference: data.reference })) {
      const rate = standing(post, data.profile, data.reference, data.shares, undefined, data.referrals.has(post.id), strengthFor(post)).rate
      if (rate && !rate.thin) rows.push({ post, mid: rate.mid })
    }
    // The highest chance first; among equals, the newest.
    rows.sort((x, y) => y.mid - x.mid || (x.post.days_open ?? 1e9) - (y.post.days_open ?? 1e9) || x.post.title.localeCompare(y.post.title))

    return rows.map((r) => r.post)
  }, [data.postings, data.profile, data.reference, data.shares, data.referrals, data.saved, data.applications, data.passed, data.signals, strengthFor, filters, needsProfile])

  if (!data.reference) return null
  const rowLimit = step === 2 ? shown.length : STEPS[step]

  return (
    <section aria-label="Jobs you are most likely to hear back from" className="mt-10 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Jobs you&apos;re most likely to hear back</h2>
        <button type="button" aria-label="Edit your job preferences" title="Edit your job preferences" onClick={() => setEditing(true)} className="flex size-9 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-line bg-card text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground">
          <PencilIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {editing ? <PreferencesDialog filters={filters} onChange={saved.setFilters} onClose={() => setEditing(false)} /> : null}
      {needsProfile ? <ImportPrompt what="the jobs you're most likely to hear back from" /> : shown.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here fits your preferences. Loosen them with the pencil.</p> : <Tracker posts={shown} onOpen={onOpen} viewName={`${saved.configName}-hear` as `v:${string}`} rowLimit={rowLimit} footer={<MoreRow total={shown.length} step={step} setStep={setStep} />} dismissible />}
    </section>
  )
}

/** Shown in both job lists until a profile is in: the same box, the same button, so the two sections match. */
function ImportPrompt({ what }: { what: string }): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] border-dashed border-line bg-secondary/30 px-5 py-6">
      <p className="font-medium">Import your LinkedIn to see {what}.</p>
      <Button type="button" onClick={openLinkedInImport} className="cursor-pointer">
        Import LinkedIn
      </Button>
    </div>
  )
}

/**
 * What you want, set in one place, the way a job site asks: how recent, what level of job, where, which line of work, which language. The jobs that fit you are narrowed to these,
 * then ranked by your interview chance. They are kept with the profile.
 */
function PreferencesDialog({ filters, onChange, onClose }: { filters: Parameters<typeof applyFilters>[1]; onChange: (next: Parameters<typeof applyFilters>[1]) => void; onClose: () => void }): React.JSX.Element {
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
          <FilterEditor filters={filters} onChange={onChange} />
          <NotInterested />
        </div>
        <div className="flex items-center justify-between gap-2 border-t-[1.5px] px-5 py-3">
          <button type="button" onClick={() => onChange({ ...DEFAULT_FILTERS, language: [] })} className="cursor-pointer text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
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
