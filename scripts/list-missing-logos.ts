/**
 * Lists the employers of active jobs that have no logo in the app, with one job link each (to read the logo from).
 *   set -a; . ./.env.local; set +a; bun scripts/list-missing-logos.ts > missing-logos.json
 */
import { logoFor } from "../src/lib/companies"
import { fetchPostings, fetchStoredLogos } from "../src/lib/jobs"
import { mergePool } from "../src/lib/sources"
import { loadAutoLogos, registerLogos } from "../src/lib/stored-logos"

const [postings, logos] = await Promise.all([fetchPostings(), fetchStoredLogos()])
registerLogos(logos)
await loadAutoLogos()
const jobs = mergePool(postings).jobs
const seen = new Map<string, { employer: string; display: string; url: string | null; ats: string; jobs: number }>()
for (const j of jobs) {
  if (logoFor(j.employer, j.url) !== null) continue
  const e = seen.get(j.employer) ?? { employer: j.employer, display: j.employer_display, url: j.url, ats: j.ats, jobs: 0 }
  e.jobs++
  seen.set(j.employer, e)
}
console.log(JSON.stringify([...seen.values()].sort((a, b) => b.jobs - a.jobs), null, 1))
