import { ArrowLeftIcon, CameraIcon, PlusIcon, XIcon } from "@/components/icons"
import { Suspense, lazy, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { parseCsv } from "@/lib/csv"
import { isGuestEmail } from "@/lib/auth"
import { importLinkedIn, LINKEDIN_URL, mergeLinkedIn } from "@/lib/linkedin"
import { useData } from "@/lib/data"
import { shrink } from "@/lib/image"
import { DUTCH_OPTIONS, ORIGIN_OPTIONS, PERMIT_OPTIONS } from "@/lib/journey"
import type { DutchLevel, Origin, Permit, Profile, Row } from "@/lib/types"

// Lazy: the upload box (with its reader and parser) loads only where a CV
// goes in, not with the profile page around it.
const CvUpload = lazy(() => import("@/components/CvUpload").then((module) => ({ default: module.CvUpload })))

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Jan 2021" is how LinkedIn writes a date and how the engine reads one; the month picker wants "2021-01". */
const toPicker = (text: string | undefined): string => {
  const m = (text ?? "").match(/([A-Za-z]{3})\w*\s+(\d{4})/)
  const at = m ? MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) : -1

  return m && at >= 0 ? `${m[2]}-${String(at + 1).padStart(2, "0")}` : ""
}
/** A date written as a year alone ("2018") cannot sit in a month picker; say what is saved instead of showing an empty box. */
const yearOnly = (text: string | undefined): string | null => (/^\s*\d{4}\s*$/.test(text ?? "") ? `Saved as ${(text ?? "").trim()}. Pick a month to be exact.` : null)
const fromPicker = (value: string): string => {
  const [y, mo] = value.split("-")

  return y && mo ? `${MONTHS[Number(mo) - 1]} ${y}` : ""
}

const field = "h-10 w-full rounded-lg border-[1.5px] bg-background px-3 text-sm focus:border-ring focus:outline-none focus:ring-3 focus:ring-ring/40"
const label = "flex flex-col gap-1 text-[0.8125rem] font-medium text-muted-foreground"

function Section({ id, title, hint, action, children }: { id?: string; title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border-[1.5px] bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-medium tracking-tight">{title}</h2>
          {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

interface ListProps {
  rows: Row[]
  onChange: (rows: Row[]) => void
  blank: Row
  summary: (row: Row) => [string, string]
  fields: (row: Row, set: (key: string, value: string) => void) => React.ReactNode
  noun: string
}

/** One kind of entry (a role, a degree) as a list of cards you open to edit. */
function EntryList({ rows, onChange, blank, summary, fields, noun }: ListProps): React.JSX.Element {
  const [fresh, setFresh] = useState<number | null>(null)

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No {noun}s yet.</p> : null}
      {rows.map((row, i) => {
        const [main, sub] = summary(row)

        return (
          <details key={i} open={fresh === i} className="group rounded-xl border-[1.5px] bg-background">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="block truncate font-medium">{main || `New ${noun}`}</span>
                <span className="block truncate text-sm text-muted-foreground">{sub || "Open to fill in"}</span>
              </span>
              <span className="text-xs text-muted-foreground group-open:hidden">Edit</span>
            </summary>
            <div className="grid gap-3 border-t-[1.5px] px-4 py-4 sm:grid-cols-2">
              {fields(row, (key, value) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r))))}
              <div className="sm:col-span-2">
                <Button variant="ghost" size="sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="cursor-pointer text-destructive">
                  Remove this {noun}
                </Button>
              </div>
            </div>
          </details>
        )
      })}
      <Button
        variant="outline"
        onClick={() => {
          onChange([...rows, { ...blank }])
          setFresh(rows.length)
        }}
        className="w-fit cursor-pointer"
      >
        <PlusIcon className="size-4" aria-hidden="true" /> Add {noun}
      </Button>
    </div>
  )
}

interface ProfilePageProps {
  onBack: () => void
}

/**
 * The whole profile on one page, the way a person keeps it: who you are, the
 * roles, the degrees, the skills and languages. The job page checks each of
 * them against what that job asks for, so each section says what it is used for.
 */
export function ProfilePage({ onBack }: ProfilePageProps): React.JSX.Element {
  const data = useData()
  const p = data.profile
  // A guest address is a placeholder, never the person's email: hide it everywhere.
  const displayEmail = data.session && !isGuestEmail(data.session.user.email) ? data.session.user.email : null
  const pictureInput = useRef<HTMLInputElement>(null)
  const [cvNote, setCvNote] = useState<string | null>(null)
  const [skill, setSkill] = useState<string>("")
  const [problem, setProblem] = useState<string | null>(null)
  const [imported, setImported] = useState<string | null>(null)
  const [link, setLink] = useState<string>(p.linkedin ?? "")
  const [linking, setLinking] = useState<"idle" | "busy">("idle")
  const [linkNote, setLinkNote] = useState<{ ok: boolean; text: string } | null>(null)

  function connect(): void {
    const url = link.trim()
    if (!LINKEDIN_URL.test(url)) {
      setLinkNote({ ok: false, text: "Paste the link to your profile, like https://www.linkedin.com/in/your-name" })
    } else {
      setLinking("busy")
      setLinkNote(null)
      importLinkedIn(url, data.session?.access_token ?? null)
        .then(async (li) => {
          // Everything LinkedIn gives replaces what was there, the picture included; where it gives no picture, yours stays.
          const picture = li.photo ? await shrink(li.photo).catch(() => "") : ""
          data.setProfile({ ...mergeLinkedIn(p, li), avatar: picture || p.avatar, linkedin: url })
          const got = [`${li.positions.length} roles`, `${li.education.length} degrees`, `${li.skills.length} skills`, ...(li.languages.length ? [`${li.languages.length} languages`] : []), ...(li.about ? ["your about text"] : []), ...(picture ? ["your picture"] : [])]
          setLinkNote({ ok: true, text: `Imported ${got.join(", ")}. Check them below.` })
        })
        .catch((err: unknown) => setLinkNote({ ok: false, text: err instanceof Error ? err.message : "Could not read that profile." }))
        .finally(() => setLinking("idle"))
    }
  }
  const set = <K extends keyof Profile>(key: K, value: Profile[K]): void => data.setProfile({ ...p, [key]: value })

  function upload(files: FileList | null): void {
    if (!files) {
      return
    }
    const reads = [...files].map(
      (file) =>
        new Promise<Partial<Profile>>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            const rows = parseCsv(String(reader.result))
            const name = file.name.toLowerCase()
            resolve(name.includes("position") ? { positions: rows } : name.includes("education") ? { education: rows } : name.includes("skill") ? { skills: rows } : name.includes("language") ? { languages: rows } : {})
          }
          reader.readAsText(file)
        }),
    )
    Promise.all(reads).then((patches) => {
      data.setProfile({ ...p, ...Object.assign({}, ...patches) })
      setImported(`Read ${[...files].map((f) => f.name).join(", ")}.`)
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 pb-16">
      <button type="button" onClick={onBack} className="flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-primary">
        <ArrowLeftIcon className="size-4" aria-hidden="true" /> Dashboard
      </button>

      <section className="overflow-hidden rounded-xl border-[1.5px] bg-card">
        <div className="h-28 bg-[oklch(0.17_0.004_60)] sm:h-36" style={{ backgroundImage: "radial-gradient(60% 120% at 85% 0%, oklch(0.7 0.18 52 / 0.6), transparent 70%)" }} />
        <div className="px-5 pb-6 sm:px-6">
          <div className="-mt-12 flex items-end gap-4 sm:-mt-14">
            <button
              type="button"
              aria-label="Change your picture"
              onClick={() => pictureInput.current?.click()}
              className="group relative flex size-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-4 border-card bg-accent text-3xl font-semibold text-primary sm:size-28"
            >
              {p.avatar ? <img src={p.avatar} alt="" className="size-full object-cover" /> : (p.name.trim() || displayEmail || "Me").charAt(0).toUpperCase()}
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <CameraIcon className="size-6" aria-hidden="true" />
              </span>
            </button>
            <input
              ref={pictureInput}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Choose a picture"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  shrink(file).then((url) => set("avatar", url)).then(() => setProblem(null)).catch((err: unknown) => setProblem(err instanceof Error ? err.message : "Could not read that file."))
                }
                e.target.value = ""
              }}
            />
            {p.avatar ? (
              <Button variant="ghost" size="sm" onClick={() => set("avatar", "")} className="mb-2 cursor-pointer text-muted-foreground">
                Remove picture
              </Button>
            ) : null}
          </div>
          {problem ? <p className="mt-2 text-sm text-destructive">{problem}</p> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Name
              <input className={field} value={p.name} onChange={(e) => set("name", e.target.value)} autoComplete="name" />
            </label>
            <label className={label}>
              Headline
              <input className={field} placeholder="e.g. Finance graduate, open to analyst roles" value={p.headline} onChange={(e) => set("headline", e.target.value)} />
            </label>
            <label className={label}>
              Where you are
              <input className={field} placeholder="e.g. Amsterdam" value={p.place} onChange={(e) => set("place", e.target.value)} />
            </label>
            <div className="flex flex-col justify-end text-sm text-muted-foreground">
              {displayEmail ? `Signed in as ${displayEmail}. ${data.profileSaved ? "Saved to your account." : "Saving…"}` : data.session ? "Guest on this device." : "Saved on this device only. Continue with Google to keep it on every device."}
            </div>
          </div>
        </div>
      </section>

      <Section id="profile-linkedin" title="LinkedIn" hint="Paste the link to your own profile and we read your roles, degrees, skills and languages into this page. Only a public profile can be read, and you can edit everything after.">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            connect()
          }}
        >
          <input aria-label="Your LinkedIn link" className={field} placeholder="https://www.linkedin.com/in/your-name" value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" autoComplete="off" />
          <Button type="submit" disabled={linking === "busy"} className="cursor-pointer sm:w-36">
            {linking === "busy" ? "Reading…" : p.linkedin && link.trim() === p.linkedin ? "Import again" : "Connect"}
          </Button>
        </form>
        {linkNote ? <p role="status" className={`mt-2 text-sm ${linkNote.ok ? "font-medium" : "text-destructive"}`}>{linkNote.text}</p> : null}
      </Section>

      <Section title="About" hint="A few lines in your own words. It stays with you; no job is ranked by it.">
        <textarea aria-label="About" className={`${field} min-h-28 py-2`} value={p.about} onChange={(e) => set("about", e.target.value)} />
      </Section>

      <Section
        title="Experience"
        hint="Checked against the years of experience a job asks for, and whether they were in the Netherlands, the EU or elsewhere."
        action={
          <label className="cursor-pointer text-sm font-medium text-primary underline">
            Import from LinkedIn
            <input type="file" multiple accept=".csv" className="sr-only" aria-label="Import a LinkedIn export" onChange={(e) => upload(e.target.files)} />
          </label>
        }
      >
        {imported ? <p role="status" className="mb-3 text-sm font-medium">{imported}</p> : null}
        <EntryList
          noun="role"
          rows={p.positions}
          onChange={(rows) => set("positions", rows)}
          blank={{ Title: "", "Company Name": "", Location: "", "Started On": "", "Finished On": "", Description: "" }}
          summary={(r) => [[r.Title, r["Company Name"]].filter(Boolean).join(" at "), [r["Started On"], r["Finished On"] || (r["Started On"] ? "now" : "")].filter(Boolean).join(" to ")]}
          fields={(r, put) => (
            <>
              <label className={label}>Title<input className={field} value={r.Title ?? ""} onChange={(e) => put("Title", e.target.value)} /></label>
              <label className={label}>Company<input className={field} value={r["Company Name"] ?? ""} onChange={(e) => put("Company Name", e.target.value)} /></label>
              <label className={label}>Location<input className={field} placeholder="City, Country" value={r.Location ?? ""} onChange={(e) => put("Location", e.target.value)} /></label>
              <span />
              <label className={label}>Started<input type="month" className={field} value={toPicker(r["Started On"])} onChange={(e) => put("Started On", fromPicker(e.target.value))} />{yearOnly(r["Started On"]) ? <span className="text-xs font-normal">{yearOnly(r["Started On"])}</span> : null}</label>
              <label className={label}>Finished (empty if current)<input type="month" className={field} value={toPicker(r["Finished On"])} onChange={(e) => put("Finished On", fromPicker(e.target.value))} />{yearOnly(r["Finished On"]) ? <span className="text-xs font-normal">{yearOnly(r["Finished On"])}</span> : null}</label>
              <label className={`${label} sm:col-span-2`}>What you did<textarea className={`${field} min-h-24 py-2`} value={r.Description ?? ""} onChange={(e) => put("Description", e.target.value)} /></label>
            </>
          )}
        />
      </Section>

      <Section title="Education" hint="Checked against the degree a job asks for, and whether it is from a Dutch institution, which matters for the 30% ruling and the orientation year.">
        <EntryList
          noun="degree"
          rows={p.education}
          onChange={(rows) => set("education", rows)}
          blank={{ "School Name": "", "Degree Name": "", "Start Date": "", "End Date": "" }}
          summary={(r) => [r["School Name"] ?? "", [r["Degree Name"], r["End Date"]].filter(Boolean).join(" · ")]}
          fields={(r, put) => (
            <>
              <label className={label}>School<input className={field} value={r["School Name"] ?? ""} onChange={(e) => put("School Name", e.target.value)} /></label>
              <label className={label}>Degree<input className={field} placeholder="e.g. MSc Finance" value={r["Degree Name"] ?? ""} onChange={(e) => put("Degree Name", e.target.value)} /></label>
              <label className={label}>Started<input type="month" className={field} value={toPicker(r["Start Date"])} onChange={(e) => put("Start Date", fromPicker(e.target.value))} />{yearOnly(r["Start Date"]) ? <span className="text-xs font-normal">{yearOnly(r["Start Date"])}</span> : null}</label>
              <label className={label}>Finished<input type="month" className={field} value={toPicker(r["End Date"])} onChange={(e) => put("End Date", fromPicker(e.target.value))} />{yearOnly(r["End Date"]) ? <span className="text-xs font-normal">{yearOnly(r["End Date"])}</span> : null}</label>
            </>
          )}
        />
      </Section>

      <Section title="Skills" hint="Matched by name against the skills a posting lists. We also find skills in your roles and CV text.">
        <div className="flex flex-wrap gap-2">
          {p.skills.map((s, i) => (
            <span key={`${s.Name}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-accent py-1 pr-1.5 pl-3 text-sm">
              {s.Name}
              <button type="button" aria-label={`Remove ${s.Name}`} onClick={() => set("skills", p.skills.filter((_, j) => j !== i))} className="cursor-pointer rounded-full p-0.5 opacity-60 hover:opacity-100">
                <XIcon className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const name = skill.trim()
            if (name && !p.skills.some((s) => s.Name?.toLowerCase() === name.toLowerCase())) {
              set("skills", [...p.skills, { Name: name }])
            }
            setSkill("")
          }}
        >
          <input aria-label="Add a skill" className={`${field} max-w-xs`} placeholder="e.g. IFRS" value={skill} onChange={(e) => setSkill(e.target.value)} />
          <Button type="submit" variant="outline" className="cursor-pointer">Add</Button>
        </form>
      </Section>

      <Section title="Languages" hint="Dutch is the one most jobs require, and the level here decides whether a posting that asks for it is in reach. A job whose title asks for another language is checked against the languages you list.">
        <div className="flex flex-col gap-2">
          <label className={`${label} max-w-xs`}>
            Dutch
            <select className={field} value={p.dutch} onChange={(e) => set("dutch", e.target.value as DutchLevel)}>
              {DUTCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <EntryList
            noun="language"
            rows={p.languages}
            onChange={(rows) => set("languages", rows)}
            blank={{ Name: "", Proficiency: "" }}
            summary={(r) => [r.Name ?? "", r.Proficiency ?? ""]}
            fields={(r, put) => (
              <>
                <label className={label}>Language<input className={field} value={r.Name ?? ""} onChange={(e) => put("Name", e.target.value)} /></label>
                <label className={label}>Level<input className={field} placeholder="e.g. Fluent" value={r.Proficiency ?? ""} onChange={(e) => put("Proficiency", e.target.value)} /></label>
              </>
            )}
          />
        </div>
      </Section>

      <Section id="profile-permit-and-pay" title="Permit and pay" hint="These set the salary your permit needs, whether the 30% ruling applies, and how a job's pay compares.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Your permit
            <select className={field} value={p.permit} onChange={(e) => set("permit", e.target.value as Permit)}>
              {PERMIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className={label}>
            Where you grew up
            <select className={field} value={p.origin} onChange={(e) => set("origin", e.target.value as Origin)}>
              {ORIGIN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className={label}>
            Year you were born
            <input type="number" inputMode="numeric" min={1950} max={2010} className={field} value={p.birth} onChange={(e) => set("birth", Number(e.target.value) || p.birth)} />
          </label>
          <label className={label}>
            Months lived outside the Netherlands, in the last 24
            <input type="number" inputMode="numeric" min={0} max={24} className={field} value={p.abroad} onChange={(e) => set("abroad", Math.min(24, Math.max(0, Number(e.target.value) || 0)))} />
          </label>
        </div>
      </Section>

      <Section id="profile-cv" title="Your CV" hint="Upload it and the chance on every job is worked out from it, together with the roles, degrees and skills above.">
        <Suspense fallback={null}>
          <CvUpload
            text={p.cv}
            name={p.cvName}
            source={p.linkedin ? "Text from your LinkedIn" : undefined}
            note={cvNote}
            onChange={(cv, cvName, uploaded) => {
              if (!uploaded) {
                data.setProfile({ ...p, cv, cvName })
                setCvNote(null)

                return
              }
              // The parser loads on first use, so it stays out of the page until then.
              void import("@/lib/cv-parse").then(
                ({ describeFilled, fillFromCv }) => {
                  // A chosen file also fills the roles, degrees and skills that are still empty, so the CV alone is enough to be judged.
                  const f = fillFromCv(p, cv)
                  data.setProfile({ ...p, cv, cvName, ...f.patch })
                  setCvNote(describeFilled(f.filled, p.positions.length + p.education.length + p.skills.length > 0))
                },
                () => {
                  data.setProfile({ ...p, cv, cvName })
                },
              )
            }}
          />
        </Suspense>
      </Section>
    </div>
  )
}
