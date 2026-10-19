import type { Suggestion } from "@/lib/suggest"

const ROLE_STOP = new Set(["the", "and", "for", "with", "intern", "internship", "stage", "stagiair", "trainee", "traineeship", "year", "month", "months", "junior", "senior", "student", "working", "werkstudent", "graduate", "program", "programme", "full", "part", "time", "of", "in", "at", "to", "a", "an", "m", "f", "d", "x"])
const roleWords = (t: string): Set<string> => new Set(t.toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !ROLE_STOP.has(w) && !/^\d+$/.test(w)))

/** Whether someone holds the same job as the posting: their title at this employer shares at least two of its main words (all of them, when it has only one or two). Nothing else counts. */
export function inRole(s: Suggestion, jobTitle: string, employer: string): boolean {
  const want = roleWords(jobTitle)
  if (want.size === 0) return false
  const need = Math.min(2, want.size)
  const titles = [s.headline, ...(s.positions ?? []).filter((p) => !employer || p.company.toLowerCase().includes(employer.toLowerCase().split(" ")[0])).map((p) => p.title)].filter(Boolean)

  return titles.some((t) => { const have = roleWords(t); let n = 0; for (const w of want) if (have.has(w)) n++; return n >= need })
}

