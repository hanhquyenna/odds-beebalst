/**
 * The highest degree a profile shows, read the way a careful person would read degrees from many countries.
 *
 * The degree gate compares this with what a posting asks, so a wrong reading hides or shows hundreds of jobs. Rules:
 *   - Only the education entries decide. Free CV text is used only when there are none, and then only for phrases that cannot
 *     mean anything else ("Master of Science", never the word "master" alone: Scrum Master, master data, master's thesis).
 *   - A degree name nobody listed here but that is not a sub-degree credential (a diploma, certificate, high school, associate)
 *     counts as a bachelor's, because a stated university degree must not read as no degree at all. This is a deliberate
 *     lean toward the person; it cannot make anyone pass a master's-only job.
 *   - Accents and case do not matter.
 */
export type DegreeLevel = "unknown" | "bachelor" | "master" | "phd"

const plain = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

// Doctorates. Not "doctor" alone: that is also a physician, and "assisting doctors" is not a PhD.
const PHD = /\b(ph\.?\s?d\.?|dphil|doctor(ate)? of|doctorate|doctoral|doutorado|doktora|doctorat|doctorado|promotion|dottorato)\b/
// Master's level. "Engineer's degree" and the continental engineer diplomas are master's level.
const MASTER =
  /\b(master|masters|master's|msc|m\.?\s?sc|mba|m\.?\s?tech|m\.?\s?eng|meng|m\.?\s?phil|mphil|m\.?\s?s|m\.?\s?a|m\.?\s?res|mres|llm|mestrado|mestre|yuksek lisans|maestria|magister|magistere|maitrise|laurea magistrale|specialistica|engineer'?s degree|ingenieur|ingenier[oa]|engenheir[oa]|diplom[- ]?ingenieur|dipl\.?-?ing)\b/
const BACHELOR =
  /\b(bachelor|bachelors|bachelor's|bsc|b\.?\s?sc|b\.?\s?tech|btech|b\.?\s?eng|beng|b\.?\s?e|b\.?\s?a|b\.?\s?s|b\.?\s?com|bcom|b\.?\s?b\.?\s?a|bba|llb|hbo|bacharelado|bacharel|licenciatura|licenciado|lisans|licence|laurea|bakkalaureus|undergraduate|honou?rs degree)\b/
// Credentials below a bachelor's.
const BELOW = /\b(associate|high school|secondary|certificate|diploma|vocational|mbo|a-levels?|ged|bootcamp|nanodegree|course|apprenticeship|foundation|lycee|ensino medio|bachillerato)\b/

/** One degree name, such as "M.Tech", "Bacharelado em Administração" or "Master of Science - MS". */
export function degreeOfName(name: string): DegreeLevel {
  // A pre-master is a bridge for bachelor's holders, not a master's.
  const t = plain(name).replace(/[^\w\s.'-]/g, " ").replace(/\bpre[- ]?master\w*/g, "bachelor")
  if (t.trim() === "") return "unknown"
  if (PHD.test(t)) return "phd"
  if (MASTER.test(t)) return "master"
  if (BACHELOR.test(t)) return "bachelor"
  if (BELOW.test(t)) return "unknown"

  return "bachelor"
}

const RANK: Record<DegreeLevel, number> = { unknown: 0, bachelor: 1, master: 2, phd: 3 }

/** Phrases in free text that cannot mean anything but a degree. Used only when no education is listed. */
const CV_PHD = /\b(ph\.?\s?d\.?\b|doctor of philosophy|doctorate)/
const CV_MASTER = /\b(master of [a-z]+|master'?s degree|msc\b|m\.sc\b|mba\b|m\.tech\b)/
const CV_BACHELOR = /\b(bachelor of [a-z]+|bachelor'?s degree|bsc\b|b\.sc\b|b\.tech\b|hbo\b)/

export function degreeOf(education: ReadonlyArray<Record<string, string | undefined>>, cv: string): DegreeLevel {
  let best: DegreeLevel = "unknown"
  for (const e of education) {
    const name = e["Degree Name"] ?? ""
    // LinkedIn often leaves the degree name empty and puts it in the field of study.
    const level = name.trim() !== "" ? degreeOfName(name) : degreeOfName(e["Field Of Study"] ?? "")
    if (RANK[level] > RANK[best]) best = level
  }
  if (education.length > 0) {
    return best
  }
  const t = plain(cv)

  return CV_PHD.test(t) ? "phd" : CV_MASTER.test(t) ? "master" : CV_BACHELOR.test(t) ? "bachelor" : "unknown"
}
