/** Read-only audit of exported people and job links. No API keys and no database mutations. */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { assessContact, sameContactEmployer } from "../supabase/functions/_shared/outreach-contact"
import { departmentOfPosition } from "../src/lib/suggest"

type Person = { employer: string; profile_url: string; name: string; headline: string; place: string; positions: Array<{ title: string; company: string; since?: string }>; jev: Record<string, unknown>; fetched_at: string }
type Link = { posting_id: string; employer: string; profile_url: string; role: string; department: string; rank: number; job_title: string; job_family: string | null; job_employer: string; job_closed_at: string | null }
const directory = process.argv[2]
if (!directory) throw new Error("Pass the directory containing people-before.json and job-links-before.json")
const people = JSON.parse(readFileSync(join(directory, "people-before.json"), "utf8")) as Person[]
const links = JSON.parse(readFileSync(join(directory, "job-links-before.json"), "utf8")) as Link[]
const byPerson = new Map(people.map(p => [`${p.employer}|${p.profile_url}`, p]))
const counts: Record<string, number> = {}
const count = (flags: string[]): void => { for (const flag of flags) counts[flag] = (counts[flag] || 0) + 1 }
function csv(name: string, records: Array<Record<string, unknown>>): void {
  const keys = Object.keys(records[0] || {})
  const cell = (v: unknown): string => `"${String(v ?? "").replaceAll('"', '""')}"`
  writeFileSync(join(directory, name), [keys.map(cell).join(","), ...records.map(r => keys.map(k => cell(r[k])).join(","))].join("\n") + "\n")
}
const personRows = people.map(p => {
  const flags: string[] = []
  const assessment = assessContact(p, p.employer)
  if (assessment.reason) flags.push(assessment.reason)
  if (p.jev?.role === "hiring_manager") flags.push("hiring_manager_without_vacancy_evidence")
  if (!p.positions?.length) flags.push("no_current_position_record")
  if (!p.jev?.decision_final && !p.jev?.decision) flags.push("no_final_validation_decision")
  if (!/netherlands|nederland|holland|randstad|amsterdam|rotterdam|utrecht|the hague|den haag|eindhoven|groningen|leiden|delft|haarlem|amstelveen|almere|tilburg|breda|nijmegen|arnhem|maastricht|zwolle|enschede|hoofddorp|schiphol|apeldoorn|amersfoort|hilversum|veldhoven|hertogenbosch|den bosch|zaandam|diemen|wageningen|leeuwarden|dordrecht|zoetermeer|venlo|heerlen|deventer|\bnl\b/i.test(p.place || "")) flags.push("netherlands_location_not_established")
  count(flags)
  return { employer: p.employer, name: p.name, profile_url: p.profile_url, headline: p.headline, place: p.place, role_before: p.jev?.role || "", eligible_under_corrected_rules: assessment.eligible, current_employer_position: assessment.currentEmployerMatched, inferred_department: departmentOfPosition(p.headline), fetched_at: p.fetched_at, flags: flags.join("; ") }
})
const linkCounts: Record<string, number> = {}
const linkRows = links.map(l => {
  const p = byPerson.get(`${l.employer}|${l.profile_url}`)
  const flags: string[] = []
  if (!p) flags.push("missing_person_record")
  else {
    const assessment = assessContact(p, p.employer)
    if (!assessment.eligible) flags.push(assessment.reason || "not_eligible")
    if (!assessment.currentEmployerMatched) flags.push("current_employer_not_confirmed")
    const department = departmentOfPosition(p.headline)
    if (department && l.job_family && department !== l.job_family) flags.push("different_or_adjacent_department")
  }
  if (l.role === "hiring_manager") flags.push("hiring_manager_without_vacancy_evidence")
  if (!sameContactEmployer(l.employer, l.job_employer || "")) flags.push("job_employer_name_requires_alias_check")
  for (const flag of flags) linkCounts[flag] = (linkCounts[flag] || 0) + 1
  return { ...l, name: p?.name || "", headline: p?.headline || "", flags: flags.join("; ") }
})
csv("people-audit.csv", personRows)
csv("job-contact-audit.csv", linkRows)
const summary = { people: people.length, employers: new Set(people.map(p => p.employer)).size, job_links: links.length, jobs: new Set(links.map(l => l.posting_id)).size, people_flags: counts, link_flags: linkCounts, eligible_contacts: personRows.filter(r => r.eligible_under_corrected_rules).length, contacts_with_stored_current_employer_position: personRows.filter(r => r.current_employer_position).length, note: "Full stored-data audit, not a fresh visit to every LinkedIn profile. Missing evidence is uncertainty, not proof a person is wrong. No per-vacancy hiring evidence existed in the snapshot." }
writeFileSync(join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
console.log(JSON.stringify(summary, null, 2))
