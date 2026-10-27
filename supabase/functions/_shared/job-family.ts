// The line of work of a job (Finance & accounting, Software engineering, ...), worked out from its title and listed skills with the same counting the app
// uses (src/lib/field.ts guessFamily, from src/lib/family-model.json, copied here as family-model.json). Used when a job is pasted in, so it has a field before
// anyone has read it; the app's own copy is the one that matters for the tests (src/lib/job-family.test.ts checks the two agree).
import model from "./family-model.json" with { type: "json" }

interface Model {
  families: string[]
  totals: number[]
  vocab: Record<string, number[]>
}
const M = model as Model
const V = Object.keys(M.vocab).length
const ALPHA = 0.5

const NOT_THE_WORK = new Set([
  "the", "and", "for", "with", "all", "genders", "gender", "senior", "junior", "sr", "jr", "lead", "head", "principal", "intern", "internship", "stage", "stagiair", "graduate", "trainee",
  "traineeship", "entry", "level", "programme", "program", "emea", "europe", "european", "global", "nl", "netherlands", "dutch", "remote", "hybrid", "amsterdam", "rotterdam", "utrecht",
  "eindhoven", "the hague", "months", "month", "year", "full", "part", "time", "fulltime", "parttime", "english", "speaking", "start", "starting", "new", "open",
])
const words = (text: string): string[] => text.toLowerCase().replace(/&amp;/g, "&").split(/[^a-z0-9+#.]+/).map((w) => w.replace(/^[.]+|[.]+$/g, "")).filter((w) => w.length >= 3 && !NOT_THE_WORK.has(w))
const stem = (w: string): string => w.replace(/(ing|ers|er|ies|es|s)$/, "")

function posterior(tokens: ReadonlyArray<string>): number[] | null {
  const known = tokens.filter((t) => M.vocab[t] !== undefined)
  if (known.length === 0) return null
  const logits = M.families.map((_, f) => known.reduce((sum, t) => sum + Math.log((M.vocab[t][f] + ALPHA) / (M.totals[f] + ALPHA * V)), 0))
  const damp = known.length ** 0.25
  const scaled = logits.map((l) => l / damp)
  const top = Math.max(...scaled)
  const exp = scaled.map((l) => Math.exp(l - top))
  const sum = exp.reduce((a, b) => a + b, 0)

  return exp.map((e) => e / sum)
}

/** The line of work, or null when the title and skills do not say it with at least 60% certainty. */
export function guessFamily(title: string, skills: ReadonlyArray<string>): string | null {
  const post = posterior([...words(title).map(stem), ...skills.map((s) => `skill:${s.toLowerCase()}`)])
  if (!post) return null
  const best = Math.max(...post)

  return best >= 0.6 ? M.families[post.indexOf(best)] : null
}
