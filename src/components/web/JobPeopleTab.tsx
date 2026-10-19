import { useEffect, useRef, useState } from "react"
import { PersonAvatar } from "@/components/PersonAvatar"
import { PersonPanel } from "@/components/PersonPanel"
import { useFindPeople } from "@/components/People"
import { SourceLine } from "@/components/web/SourceCircle"
import { PlusIcon, UndoIcon } from "@/components/icons"
import { useData } from "@/lib/data"
import { departmentOf } from "@/lib/field"
import { saved } from "@/lib/saved"
import { inRole } from "@/lib/role-match"
import { PEOPLE_GROUPS, linkedinSearches, moreIn, openIn, whyThisPerson, type PeopleGroup, type Suggestion } from "@/lib/suggest"
import { goTo } from "@/lib/web-nav"
import { stamp } from "@/lib/outreach-stage"
import { CONTACT_STATUSES, type ContactStatus, type PastSearch, type Person, type Posting } from "@/lib/types"

/** The groups on the tab, in the order they were drawn. "Department leads" is what we can say: a stored title that points to a lead in the job's department, not a confirmed hiring manager. */
export type TabGroup = PeopleGroup | "alumni" | "role"
const TITLES: Record<TabGroup, string> = { role: "Got this job", manager: "Department leads", team: "Same team", alumni: "Alumni from your university", other: "Other" }
const ORDER: ReadonlyArray<TabGroup> = ["role", "manager", "team", "alumni", "other"]

/** The school the person studied at, as they wrote it on their profile; null when none. */
export function schoolOf(education: ReadonlyArray<Record<string, string>>): string | null {
  return education.map((e) => (e["School Name"] ?? "").trim()).find(Boolean) ?? null
}

/** Whether what the search read about someone names this school. Nothing else is taken as being an alumnus. */
function fromSchool(s: Suggestion, school: string): boolean {
  const text = [s.about, s.headline, ...(s.positions ?? []).map((p) => `${p.title} ${p.company}`)].join(" ").toLowerCase()

  return text.includes(school.toLowerCase())
}

/** The people found for a job, sorted into the five groups. Each person is in one group; alumni are taken out of the others. */
export function groupPeople(rec: PastSearch | null, family: string | null | undefined, school: string | null, job?: { title: string; employer: string }): Record<TabGroup, { shown: Suggestion[]; more: boolean }> {
  const out: Record<TabGroup, { shown: Suggestion[]; more: boolean }> = { role: { shown: [], more: false }, manager: { shown: [], more: false }, team: { shown: [], more: false }, alumni: { shown: [], more: false }, other: { shown: [], more: false } }
  if (!rec) return out
  const alumni = new Set(school ? rec.pool.filter((p) => fromSchool(p, school)).map((p) => p.url) : [])
  const role = new Set(job ? rec.pool.filter((p) => inRole(p, job.title, job.employer)).map((p) => p.url) : [])
  for (const g of PEOPLE_GROUPS) {
    out[g.key].shown = openIn(rec, g.key, family).filter((p) => !alumni.has(p.url) && !role.has(p.url))
    out[g.key].more = moreIn(rec, g.key, family)
  }
  out.role.shown = rec.pool.filter((p) => role.has(p.url))
  out.alumni.shown = rec.pool.filter((p) => alumni.has(p.url) && !role.has(p.url))

  return out
}

/** The People tab: who works at this employer, by how close they are to the job. Add one to your list, or write to them. */
export function JobPeopleTab({ post }: { post: Posting }): React.JSX.Element {
  const data = useData()
  const find = useFindPeople(post)
  const family = post.family ?? null
  const school = schoolOf(data.profile.education)
  const groups = groupPeople(find.rec, family, school, { title: post.title, employer: post.employer_display })
  const started = useRef<boolean>(false)
  const [panel, setPanel] = useState<Suggestion | null>(null)
  useEffect(() => {
    if (data.session && !find.guest && !find.rec && !started.current) {
      started.current = true
      find.find()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.session, find.guest, find.rec])
  const searches = linkedinSearches(post.employer_display, family)
  const mine = data.people.filter((p) => p.jobId === post.id && !find.rec?.pool.some((s) => s.url === p.contact))

  function add(s: Suggestion): void {
    const existing = data.people.find((p) => p.contact === s.url)
    if (existing) {
      data.removePerson(existing.id)
      saved(() => data.addPerson(existing))

      return
    }
    const added = data.addPerson({ name: s.name, company: post.employer_display, jobId: post.id, status: "To contact", contact: s.url, role: s.headline, notes: "", photo: s.photo, place: s.place, about: s.about, positions: s.positions })
    saved(() => data.removePerson(added.id))
  }
  function message(s: Suggestion): void {
    const existing = data.people.find((p) => p.contact === s.url)
    const id = existing?.id ?? data.addPerson({ name: s.name, company: post.employer_display, jobId: post.id, status: "To contact", contact: s.url, role: s.headline, notes: "", photo: s.photo, place: s.place, about: s.about, positions: s.positions }).id
    goTo("people", { person: id })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-extrabold tracking-tight">People at {post.employer_display}</h2>
        <SourceLine names={["LinkedIn"]} />
      </div>
      {find.guest ? <p className="text-sm text-muted-foreground">Sign in with Google to see people.</p> : null}
      {find.state === "busy" ? <p aria-busy="true" className="text-sm text-muted-foreground">Looking…</p> : null}
      {find.problem ? <p className="text-sm text-muted-foreground">{find.problem}</p> : null}
      {find.rec ? <p className="text-xs text-muted-foreground">Suggested department contacts. Hiring responsibility for this vacancy has not been confirmed.</p> : null}

      {mine.length > 0 ? (
        <section aria-label="Your people on this job" className="rounded-[18px] border-[1.5px] border-line bg-card p-5">
          <h3 className="mb-2 text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">On your list</h3>
          <ul aria-label="Your people on this job" className="flex flex-col">
            {mine.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-t-[1.5px] border-line/60 py-2.5 first:border-t-0">
                <PersonAvatar name={p.name} photo={p.photo} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{p.name}</span>
                  {p.role ? <span className="block truncate text-xs text-muted-foreground">{p.role}</span> : null}
                </span>
                <StageSelect person={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {ORDER.filter((key) => key !== "alumni" || school !== null).map((key) => {
        const g = groups[key]
        const search = key === "role" ? { url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${post.employer_display} ${post.title}`)}` } : key === "alumni" ? { url: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${post.employer_display} ${school ?? ""}`)}` } : (searches.find((s) => s.label === PEOPLE_GROUPS.find((x) => x.key === key)?.search) ?? searches[0])

        return (
          <section key={key} aria-label={TITLES[key]} className="rounded-[18px] border-[1.5px] border-line bg-card p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h3 className="text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{TITLES[key]}</h3>
              {key !== "alumni" && key !== "role" && g.more ? (
                <button type="button" onClick={() => find.more(key as PeopleGroup)} aria-label={`Find another: ${TITLES[key]}`} className="flex h-8 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-extrabold text-brand-ink hover:bg-accent">
                  <PlusIcon className="size-3.5" aria-hidden="true" /> Find another
                </button>
              ) : (
                <a href={search.url} target="_blank" rel="noreferrer" aria-label={`Search LinkedIn: ${TITLES[key]}`} className="text-xs font-extrabold text-brand-ink underline underline-offset-4">
                  Search LinkedIn
                </a>
              )}
            </div>
            {g.shown.length === 0 ? (
              <p className="border-t-[1.5px] border-line/60 pt-3 text-sm text-muted-foreground">{find.rec ? "No one found yet." : "Not looked up yet."}</p>
            ) : (
              <ul className="flex flex-col">
                {g.shown.map((s) => {
                  const added = data.people.some((p) => p.contact === s.url)
                  const dept = s.headline ? departmentOf(s.headline) : null

                  return (
                    <li key={s.url} className="flex items-center gap-3 border-t-[1.5px] border-line/60 py-3">
                      <button type="button" onClick={() => setPanel(s)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left">
                        <PersonAvatar name={s.name} photo={s.photo} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{s.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{s.headline || dept || ""}</span>
                        </span>
                      </button>
                      {added ? <StageSelect person={data.people.find((p) => p.contact === s.url)} /> : null}
                      <button
                        type="button"
                        aria-pressed={added}
                        aria-label={added ? `Remove ${s.name} from your People` : `Add ${s.name} to your People`}
                        title={added ? "Undo add" : "Add to your People"}
                        onClick={() => add(s)}
                        className={`grid size-9 cursor-pointer place-items-center rounded-[10px] border-[1.5px] ${added ? "border-brand/40 bg-accent text-brand-ink" : "border-line hover:border-foreground/40"}`}
                      >
                        {added ? <UndoIcon className="size-4" aria-hidden="true" /> : <PlusIcon className="size-4" aria-hidden="true" />}
                      </button>
                      <button type="button" onClick={() => message(s)} aria-label={`Message ${s.name}`} className="h-9 cursor-pointer rounded-[10px] bg-brand px-4 text-[0.8125rem] font-extrabold hover:bg-[#E56E1E]">
                        Message
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}

      {panel ? (
        <PersonPanel
          person={{ name: panel.name, headline: panel.headline, company: post.employer_display, place: panel.place, photo: panel.photo, about: panel.about, positions: panel.positions, url: panel.url, facts: [{ label: "Company", value: post.employer_display }, { label: "Job", value: post.title }, { label: "Why this person", value: whyThisPerson(panel.headline, family) }] }}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  )
}

/** How many people each group of the job holds: the counts on the Overview card. Null until the people have been looked up. */
export function peopleCounts(rec: PastSearch | null, family: string | null | undefined, school: string | null, job?: { title: string; employer: string }): Record<TabGroup, number> | null {
  if (!rec) return null
  const g = groupPeople(rec, family, school, job)

  return { role: g.role.shown.length, manager: g.manager.shown.length, team: g.team.shown.length, alumni: g.alumni.shown.length, other: g.other.shown.length }
}


/** Where you are with someone on your list, changed in place. */
function StageSelect({ person }: { person: Person | undefined }): React.JSX.Element | null {
  const data = useData()
  if (!person) return null

  return (
    <select aria-label={`Where you are with ${person.name}`} value={person.status} onChange={(e) => { data.updatePerson(person.id, stamp(e.target.value as ContactStatus)); saved() }} className="h-9 cursor-pointer rounded-lg border-[1.5px] border-line bg-card px-2 text-sm font-bold">
      {CONTACT_STATUSES.map((c) => (
        <option key={c}>{c}</option>
      ))}
    </select>
  )
}
