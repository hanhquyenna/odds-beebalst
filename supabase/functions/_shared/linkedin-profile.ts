// Turns one item from the Apify actor harvestapi/linkedin-profile-scraper into the shapes the odds profile uses
// (the same column names as a LinkedIn data export). Shared by the Edge Function and by the tests, and it uses
// nothing that only exists in Deno, so both can import it.
//
// The actor's output, from its own documentation: firstName, lastName, headline, about, location {linkedinText, parsed},
// experience[{position, companyName, location, employmentType, duration, description, skills[], startDate{month,year,text},
// endDate{text}}], education[{schoolName, degree, fieldOfStudy, startDate, endDate, skills[]}], skills[{name, positions[]}],
// languages[{name, proficiency}], certifications[{title, issuedBy, issuedAt}], projects, volunteering, honorsAndAwards,
// publications, courses.

export type Json = Record<string, unknown>

export interface ImportedProfile {
  name: string
  headline: string
  place: string
  about: string
  /** The profile picture's address on LinkedIn's servers; the function swaps it for the picture itself before answering. */
  photoUrl: string
  /** The picture as a data URL, set by the function. */
  photo?: string
  /** A text version of everything the profile says that the rows do not hold, for reading skills out of. */
  cv: string
  positions: Array<Record<string, string>>
  education: Array<Record<string, string>>
  skills: Array<Record<string, string>>
  languages: Array<Record<string, string>>
}

/** A value the actor may give as text, or as { text } / { linkedinText } / { month, year }. */
export function text(v: unknown): string {
  if (typeof v === "string") return v.trim()
  if (typeof v === "number") return String(v)
  if (v && typeof v === "object") {
    const o = v as Json
    for (const k of ["text", "linkedinText", "name", "value"]) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim()
    const year = typeof o.year === "number" || typeof o.year === "string" ? String(o.year) : null
    if (typeof o.month === "string" && year) return `${o.month} ${year}`
    if (year) return year
  }
  return ""
}
const first = (o: Json, ...keys: string[]): string => {
  for (const k of keys) {
    const t = text(o[k])
    if (t) return t
  }
  return ""
}
const list = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : [])

/** "Present", "Now", "Current" mean the role has not ended: an empty end date. */
const ongoing = (s: string): string => (/^(present|now|current|heden|nu)\b/i.test(s) ? "" : s)

/** "Staff Pharmacist | Prescription Dispensing, Drug Utilization Review" is a title plus keywords: keep the title. */
export function cleanTitle(raw: string): string {
  const head = raw.split(/\s+[|•·]\s+/)[0].trim()
  return head.length >= 3 ? head : raw
}

/** The place as a person would write it: "Rotterdam, Netherlands" rather than the full LinkedIn string where possible. */
function place(p: Json): string {
  const loc = p.location
  if (loc && typeof loc === "object") {
    const parsed = (loc as Json).parsed as Json | undefined
    const city = parsed ? first(parsed, "city") : ""
    const country = parsed ? first(parsed, "country") : ""
    if (city && country) return `${city}, ${country}`
    return first(loc as Json, "linkedinText") || (parsed ? first(parsed, "text") : "")
  }
  return first(p, "location", "locationName", "geoLocationName")
}

export function isUsable(item: unknown): item is Json {
  if (!item || typeof item !== "object") return false
  const o = item as Json
  if (o.error || o.status === "error" || o.status === "not_found") return false
  // A profile with no name, no roles, no education and no skills is a failed read, not a profile.
  return Boolean(first(o, "firstName", "fullName", "name") || list(o.experience).length || list(o.education).length || list(o.skills).length)
}

export function normaliseProfile(p: Json): ImportedProfile {
  const positions = list(p.experience ?? p.positions)
    .map((e) => ({
      Title: cleanTitle(first(e, "position", "title", "role")),
      "Company Name": first(e, "companyName", "company", "organization"),
      Location: first(e, "location"),
      "Started On": first(e, "startDate", "start", "from"),
      "Finished On": ongoing(first(e, "endDate", "end", "to")),
      Description: first(e, "description"),
    }))
    .filter((r) => r.Title || r["Company Name"])

  const education = list(p.education)
    .map((e) => ({
      "School Name": first(e, "schoolName", "school", "institution"),
      "Degree Name": [first(e, "degree", "degreeName"), first(e, "fieldOfStudy", "field")]
        .filter(Boolean)
        .filter((part, i, all) => all.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === i)
        .join(", "),
      "Start Date": first(e, "startDate", "start"),
      "End Date": ongoing(first(e, "endDate", "end")),
    }))
    .filter((r) => r["School Name"] || r["Degree Name"])

  const named = new Set<string>()
  const skills: Array<Record<string, string>> = []
  for (const s of list(p.skills)) {
    const name = first(s, "name", "skill")
    if (name && !named.has(name.toLowerCase())) {
      named.add(name.toLowerCase())
      skills.push({ Name: name })
    }
  }

  const languages = list(p.languages)
    .map((l) => ({ Name: first(l, "name", "language"), Proficiency: first(l, "proficiency", "level") }))
    .filter((l) => l.Name)

  const certifications = list(p.certifications).map((c) => first(c, "title", "name")).filter(Boolean)
  const projects = list(p.projects).map((c) => first(c, "title", "name")).filter(Boolean)
  const volunteering = list(p.volunteering).map((v) => [first(v, "role"), first(v, "organizationName")].filter(Boolean).join(" at ")).filter(Boolean)
  const honors = list(p.honorsAndAwards).map((h) => first(h, "title")).filter(Boolean)
  const headline = first(p, "headline")
  const about = first(p, "about", "summary")
  const cv = [
    headline,
    about,
    certifications.length ? `Certifications: ${certifications.join("; ")}` : "",
    projects.length ? `Projects: ${projects.join("; ")}` : "",
    volunteering.length ? `Volunteering: ${volunteering.join("; ")}` : "",
    honors.length ? `Honors: ${honors.join("; ")}` : "",
  ].filter(Boolean).join("\n")

  return {
    name: [first(p, "firstName"), first(p, "lastName")].filter(Boolean).join(" ") || first(p, "fullName", "name"),
    headline,
    place: place(p),
    about,
    photoUrl: first(p, "photo", "profilePicture", "pictureUrl", "imageUrl"),
    cv,
    positions,
    education,
    skills,
    languages,
  }
}
