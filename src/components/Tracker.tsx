import { XIcon } from "@/components/icons"
import { useMemo, useRef, useState } from "react"
import { JobRow } from "@/components/JobBoard"
import { trackerSortValue } from "@/components/tracker-values"
import { AddFromLinkedIn } from "@/components/AddJob"
import { Button } from "@/components/ui/button"
import { useData } from "@/lib/data"
import { sortJobs } from "@/lib/sort"
import { useViewConfig } from "@/lib/views"
import { parseCsv } from "@/lib/csv"
import { addJob, JOB_LINK } from "@/lib/add-job"
import { TARGETS, guessMapping, readJobs, type ImportedJob, type Mapping, type Target } from "@/lib/import"
import type { Posting, ViewName } from "@/lib/types"

const TEMPLATE = "Title,Company,Location,Link,Pay,Contact,Deadline\nFinancial Analyst,ING,Amsterdam,https://example.com/job,,Sanne de Vries,2026-11-15\n"

interface TrackerProps {
  posts: ReadonlyArray<Posting>
  onOpen: (post: Posting) => void
}

/**
 * The jobs you kept, as the same rows the job list uses: logo, title, company,
 * place, posted. Status, pay, fit and your own properties are inside each job.
 */
export function Tracker({ posts, onOpen, viewName, rowLimit, footer, dismissible }: TrackerProps & { viewName: ViewName; /** Each row has an X: not interested, not recommended again. */ dismissible?: boolean; /** Show only this many rows, with `footer` as the last row (the way to see more). */ rowLimit?: number; footer?: React.ReactNode }): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const view = useViewConfig(viewName)

  const sorted = useMemo(() => {
    if (!view.config.sortKey) {
      return posts
    }
    const key = view.config.sortKey
    const extra = (post: Posting): string | number | null => trackerSortValue(data, key, post)

    return sortJobs(posts, key, view.config.sortDir, { reference: data.reference, shares: data.shares, profile, referrals: data.referrals }, extra)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, view.config.sortKey, view.config.sortDir, profile, data.applications, data.reference, data.shares, data.referrals])

  return (
    <div className="@container overflow-hidden rounded-xl border-[1.5px] border-line bg-card">
      <ul>
        {sorted.slice(0, rowLimit ?? sorted.length).map((post) => (
          <li key={post.id} className="relative after:absolute after:right-0 after:bottom-0 after:left-4 after:h-px after:bg-border last:after:hidden @2xl:after:left-6">
            <JobRow post={post} onOpen={() => onOpen(post)} status dismissible={dismissible} />
          </li>
        ))}
        {footer ? <li className="border-t-[1.5px] border-line">{footer}</li> : null}
      </ul>
    </div>
  )
}

/** Bring your own jobs: add one by hand (the small link under the jobs), or upload a spreadsheet saved as CSV (the button beside Sort). The form opens below the jobs. */
export type AddPanel = "one" | "upload" | null

export function AddJobs({ panel, setPanel }: { panel: AddPanel; setPanel: (p: AddPanel) => void }): React.JSX.Element {
  const data = useData()
  const { profile } = data
  const file = useRef<HTMLInputElement>(null)
  const open = panel !== null
  const [message, setMessage] = useState<string | null>(null)
  // A file that was read and is waiting for you to say which column is which.
  const [pending, setPending] = useState<{ name: string; rows: Array<Record<string, string>>; mapping: Mapping } | null>(null)
  const [one, setOne] = useState({ title: "", company: "", place: "", link: "", text: "" })

  function finish(rows: Array<Record<string, string>>, mapping?: Mapping): void {
    const result = readJobs(rows, data.postings.filter((p) => !p.local), mapping)
    const same = (a: Posting, b: Posting): boolean => a.title.toLowerCase() === b.title.toLowerCase() && a.employer_display.toLowerCase() === b.employer_display.toLowerCase()
    const mine = data.postings.filter((p) => p.local)
    const duplicates = result.jobs.filter((j) => mine.some((m) => same(m, j.post))).length
    result.jobs = result.jobs.filter((j) => !mine.some((m) => same(m, j.post)))
    if (result.jobs.length === 0) {
      setMessage(duplicates ? "Those jobs are already in your tracker." : "No jobs found. Each row needs a title.")

      return
    }
    data.addLocalPostings(result.jobs.map((j) => j.post))
    const notes = { ...profile.notes }
    for (const job of result.jobs) {
      data.setSaved(job.post.id, true)
      if (Object.keys(job.extras).length) {
        notes[job.post.id] = job.extras
      }
    }
    const fresh = result.columns.filter((c) => !profile.columns.includes(c))
    const next = {
      ...profile,
      columns: [...profile.columns, ...fresh],
      columnTypes: { ...profile.columnTypes, ...Object.fromEntries(fresh.map((c) => [c, result.types[c] ?? "text"])) },
      columnOptions: { ...profile.columnOptions, ...Object.fromEntries(fresh.filter((c) => result.options[c]).map((c) => [c, result.options[c]])) },
      notes,
    }
    data.setProfile(next)
    const linked = result.jobs.filter((j) => j.post.url && JOB_LINK.test(j.post.url)).length
    setMessage(
      `Added ${result.jobs.length} job${result.jobs.length === 1 ? "" : "s"}.` +
        (result.columns.length ? ` ${result.columns.join(", ")} became ${result.columns.length === 1 ? "a property" : "properties"}.` : "") +
        (duplicates ? ` ${duplicates} already in your tracker.` : "") +
        (result.skipped ? ` ${result.skipped} row${result.skipped === 1 ? " was" : "s were"} skipped for having no title.` : "") +
        (linked ? ` Reading ${linked} LinkedIn link${linked === 1 ? "" : "s"} for the logo, company and pay…` : ""),
    )
    if (linked) {
      enrichLinked(result.jobs, next).catch(() => undefined)
    }
  }

  /**
   * Jobs that came with a LinkedIn job link are read by the same backend as "Add a job from LinkedIn": the real posting replaces the typed one, with its logo, company facts,
   * pay, level and language, and joins the shared list. What you wrote in your own columns moves with it. A link that is closed, abroad or unreadable leaves the typed job as it is.
   * Every link is read, one after another (about half a cent each).
   */
  async function enrichLinked(jobs: ImportedJob[], base: typeof profile): Promise<void> {
    const swaps: Array<[string, string]> = []
    for (const job of jobs.filter((j) => j.post.url && JOB_LINK.test(j.post.url))) {
      try {
        const found = await addJob(job.post.url as string)
        if (found.status === "added" || found.status === "exists") {
          swaps.push([job.post.id, found.id])
        }
      } catch {
        // Left as typed.
      }
    }
    if (swaps.length === 0) {
      setMessage((m) => `${m ?? ""} None of the links could be read, so those jobs stay as you typed them.`.trim())

      return
    }
    await data.refreshPostings()
    const notes = { ...base.notes }
    for (const [from, to] of swaps) {
      data.setSaved(to, true)
      data.setSaved(from, false)
      data.removeLocalPosting(from)
      if (notes[from]) {
        notes[to] = { ...notes[to], ...notes[from] }
        delete notes[from]
      }
    }
    data.setProfile({ ...base, notes })
    setMessage(`Read ${swaps.length} of your LinkedIn links: the logo, company, pay and the rest now come from the real posting.`)
  }

  function upload(files: FileList | null): void {
    const first = files?.[0]
    if (!first) {
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsv(typeof reader.result === "string" ? reader.result : "")
      if (rows.length === 0) {
        setMessage("Nothing to read in that file. It needs a header row and at least one row below it.")

        return
      }
      setMessage(null)
      setPending({ name: first.name, rows, mapping: guessMapping(Object.keys(rows[0]), rows) })
    }
    reader.readAsText(first)
    if (file.current) {
      file.current.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p>
        <button type="button" aria-expanded={panel === "one"} onClick={() => setPanel(panel === "one" ? null : "one")} className="cursor-pointer text-sm underline underline-offset-4 hover:text-foreground">
          Add a job manually
        </button>
      </p>
      {open ? (
        <div className="relative grid max-w-3xl gap-5 rounded-xl border-[1.5px] bg-card p-4 sm:p-5">
          <button type="button" aria-label="Close" onClick={() => { setPanel(null); setMessage(null) }} className="absolute top-3 right-3 flex size-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
          {panel === "upload" ? (
          <div className="flex flex-col gap-3">
            <h3 className="font-heading text-lg font-medium">Upload a list</h3>
            {pending ? (
              <ColumnMapper pending={pending} onChange={(mapping) => setPending({ ...pending, mapping })} onCancel={() => setPending(null)} onImport={() => { finish(pending.rows, pending.mapping); setPending(null) }} />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Any spreadsheet saved as CSV, with any columns. You say which column is the job title, company and so on; the rest can become properties of yours. A job needs only a title. With a company name we add its logo and sponsor status when we know it; with a LinkedIn job link we read the whole posting for you (logo, company, pay, level, language).</p>
                <input ref={file} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" aria-label="Upload a CSV of jobs" onChange={(e) => upload(e.target.files)} className="text-sm" />
                <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="my-jobs-template.csv" className="w-fit text-sm font-medium text-primary underline">
                  Download a template
                </a>
              </>
            )}
          </div>
          ) : (
          <>
          <AddFromLinkedIn onDone={setMessage} />
          <details className="group">
            <summary className="w-fit cursor-pointer text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">Or add a job by hand</summary>
          <form
            className="mt-3 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              finish([{ Title: one.title, Company: one.company, Location: one.place, Link: one.link, Description: one.text }])
              setOne({ title: "", company: "", place: "", link: "", text: "" })
            }}
          >
            {(["title", "company", "place", "link"] as const).map((k) => (
              <input
                key={k}
                aria-label={k === "place" ? "Location" : k[0].toUpperCase() + k.slice(1)}
                placeholder={k === "place" ? "Location" : k[0].toUpperCase() + k.slice(1)}
                value={one[k]}
                onChange={(e) => setOne({ ...one, [k]: e.target.value })}
                className="h-9 rounded-lg border-[1.5px] bg-background px-3 text-sm"
              />
            ))}
            <textarea
              aria-label="The posting text"
              placeholder="Paste the posting text. We read years asked, Dutch, degree and skills from it."
              value={one.text}
              onChange={(e) => setOne({ ...one, text: e.target.value })}
              className="min-h-24 rounded-lg border-[1.5px] bg-background px-3 py-2 text-sm"
            />
            <Button type="submit" disabled={!one.title.trim() || !one.company.trim()} className="w-fit cursor-pointer">
              Add to tracker
            </Button>
          </form>
          </details>
          </>
          )}
          {message ? (
            <p role="status" className="text-sm font-medium">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Which column of an uploaded file is which: each column with a few of its values and a choice of what it is. Only a title is needed. */
function ColumnMapper({ pending, onChange, onCancel, onImport }: { pending: { name: string; rows: Array<Record<string, string>>; mapping: Mapping }; onChange: (m: Mapping) => void; onCancel: () => void; onImport: () => void }): React.JSX.Element {
  const headers = Object.keys(pending.rows[0] ?? {})
  const hasTitle = headers.some((h) => pending.mapping[h] === "title")
  // A field can come from one column only: choosing it for another column frees the first.
  const set = (header: string, target: Target): void => {
    const next: Mapping = { ...pending.mapping, [header]: target }
    if (target !== "property" && target !== "ignore") {
      for (const h of headers) if (h !== header && next[h] === target) next[h] = "property"
    }
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {pending.name}: {pending.rows.length} {pending.rows.length === 1 ? "row" : "rows"}. Check what each column is.
      </p>
      <div className="max-h-80 overflow-auto rounded-lg border-[1.5px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="text-left text-[0.8125rem] text-muted-foreground">
              <th className="border-b-[1.5px] px-3 py-2 font-medium">Column</th>
              <th className="border-b-[1.5px] px-3 py-2 font-medium">Examples</th>
              <th className="border-b-[1.5px] px-3 py-2 font-medium">Is</th>
            </tr>
          </thead>
          <tbody>
            {headers.map((h) => (
              <tr key={h}>
                <td className="border-b-[1.5px] px-3 py-2 font-medium">{h}</td>
                <td className="max-w-56 truncate border-b-[1.5px] px-3 py-2 text-muted-foreground">{pending.rows.slice(0, 3).map((r) => r[h]).filter(Boolean).join(" · ") || "—"}</td>
                <td className="border-b-[1.5px] px-3 py-2">
                  <select aria-label={`What ${h} is`} value={pending.mapping[h] ?? "property"} onChange={(e) => set(h, e.target.value as Target)} className="h-8 cursor-pointer rounded-md border-[1.5px] bg-background px-2">
                    {TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasTitle ? null : <p className="text-sm text-red-600">Choose which column is the job title.</p>}
      <div className="flex items-center gap-2">
        <Button type="button" disabled={!hasTitle} onClick={onImport} className="cursor-pointer">
          Import {pending.rows.length} {pending.rows.length === 1 ? "job" : "jobs"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} className="cursor-pointer">
          Cancel
        </Button>
      </div>
    </div>
  )
}
