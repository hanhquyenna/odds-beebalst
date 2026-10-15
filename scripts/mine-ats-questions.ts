/**
 * Read-only research: the application questions of the Greenhouse jobs in the jobs database, counted, and how many the form-filling rules answer.
 * Greenhouse's public job-board API lists a job's questions (`?questions=true`). Nothing is sent, nothing is applied for.
 *
 *   set -a; . ./.env.local; set +a        # the database's public URL and anon key
 *   bun scripts/mine-ats-questions.ts [out.json]
 *
 * The output file is raw (employer, job, questions); the table printed is the loop's guide: the questions asked by the most employers that the rules
 * still do not answer are the next rules to write (supabase/functions/_shared/apply-form.ts), each with a test in src/lib/apply-form.test.ts.
 */
import { writeFileSync } from "node:fs"
import { jobLink } from "../supabase/functions/_shared/job-sites"
import { answerText, questionKey, type Facts } from "../supabase/functions/_shared/apply-form"

const sb = process.env.VITE_SUPABASE_URL ?? ""
const key = process.env.VITE_SUPABASE_ANON_KEY ?? ""
if (!sb || !key) throw Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (the public ones in .env.local).")
const outFile = process.argv[2] ?? "/tmp/odds-gh-questions.json"

type Q = { label: string; fields?: Array<{ type: string; values?: Array<{ label: string }> }>; answer_options?: Array<{ label: string }>; type?: string }
const rows: Array<{ id: string; url: string | null; employer_display: string }> = []
for (let offset = 0; ; offset += 1000) {
  const res = await fetch(`${sb}/rest/v1/postings?select=id,url,employer_display&ats=eq.greenhouse&closed_at=is.null&order=id&offset=${offset}&limit=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const part = (await res.json()) as typeof rows
  rows.push(...part)
  if (part.length < 1000) break
}

const found: Array<{ employer: string; job: string; questions: Q[] }> = []
let next = 0
async function worker(): Promise<void> {
  while (next < rows.length) {
    const row = rows[next++]
    const link = row.url ? jobLink(row.url, true) : null
    const m = link && /^\/([^/]+)\/jobs\/(\d+)$/.exec(new URL(link.url).pathname)
    if (!m) continue
    try {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}?questions=true`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const j = (await res.json()) as { questions?: Q[]; location_questions?: Q[]; compliance?: Array<{ questions?: Q[] }>; demographic_questions?: { questions?: Q[] } }
      found.push({ employer: row.employer_display, job: row.id, questions: [...(j.questions ?? []), ...(j.location_questions ?? []), ...(j.compliance ?? []).flatMap((c) => c.questions ?? []), ...(j.demographic_questions?.questions ?? [])] })
    } catch {
      // A job that is gone or slow is skipped.
    }
    await new Promise((r) => setTimeout(r, 150))
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
writeFileSync(outFile, JSON.stringify(found))

// A person with every standard answer set: what the rules can answer for someone who has filled in Autofill and has a CV.
const facts: Facts = {
  name: "Kien Phung", email: "k@example.nl", phone: "+31 6 1", place: "Amsterdam, Netherlands", linkedin: "https://www.linkedin.com/in/k", dutch: "basic", job_source: "LinkedIn", job_country: "NL", adult: true, never_worked_here: true, applied_before: false,
  answers: { first_name: "Kien", last_name: "Phung", phone: "+31 6 1", email: "k@example.nl", city: "Amsterdam", country: "Netherlands", address: "Damrak 1", postcode: "1012 LG", website: "https://k.dev", linkedin: "https://www.linkedin.com/in/k", work_authorization: "I need a work permit; the employer sponsors it", expected_salary: "EUR 600 a month", start_date: "1 Feb 2027", hours_per_week: "40", notice_period: "None", relocation: "Yes", university: "UvA", degree: "MSc", field_of_study: "Data science", graduation_date: "July 2027", study_start: "September 2025", study_year: "2nd year", study_status: "Yes, enrolled", nationality: "Vietnamese", onsite_ok: "Yes", prior_agreements: "No", insider: "No", current_job_title: "Intern", current_company: "Acme" },
  remembered: {},
}
const seen = new Map<string, { label: string; employers: Set<string>; n: number; answer: string | null }>()
for (const job of found) {
  for (const q of job.questions) {
    const k = questionKey(q.label)
    if (!k) continue
    const e = seen.get(k) ?? { label: q.label, employers: new Set<string>(), n: 0, answer: answerText(q.label, facts) }
    e.employers.add(job.employer)
    e.n++
    seen.set(k, e)
  }
}
const list = [...seen.values()].sort((a, b) => b.employers.size - a.employers.size || b.n - a.n)
const total = list.reduce((n, e) => n + e.n, 0)
const answered = list.filter((e) => e.answer !== null).reduce((n, e) => n + e.n, 0)
console.log(`${found.length} jobs, ${list.length} distinct questions asked ${total} times; answered by the rules: ${answered} (${Math.round((answered / Math.max(1, total)) * 100)}%). Raw data: ${outFile}`)
console.log("Not answered, most common first:")
for (const e of list.filter((x) => x.answer === null).slice(0, 40)) console.log(`${String(e.employers.size).padStart(3)} employers  ${e.label.replace(/\s+/g, " ").slice(0, 100)}`)
