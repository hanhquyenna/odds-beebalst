/** Contact details already supplied by the person. Never infer name order from a display name. */
export function personalFromProfile(profile: { firstName?: string; lastName?: string; phone?: string; email?: string; linkedin?: string; place?: string; cv?: string }, accountEmail?: string | null): Record<string, string> {
  const contact = (profile.cv || "").slice(0, 4000)
  const one = (values: string[]): string => [...new Set(values)].length === 1 ? values[0] : ""
  const emails = contact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  // International numbers, or explicitly labelled local phone numbers. Avoid dates and IDs.
  const phones = (contact.match(/\+\d[\d ().-]{7,22}\d/g) || []).filter(v => v.replace(/\D/g, "").length >= 9 && v.replace(/\D/g, "").length <= 15)
  const labelledPhone = /(?:phone|mobile|tel(?:ephone)?|telefoon)\s*[:|]\s*([+\d][\d ().-]{7,22}\d)/i.exec(contact)?.[1]
  const labelled = (pattern: RegExp): string => pattern.exec(contact)?.[1]?.trim() || ""
  const values = {
    first_name: profile.firstName || labelled(/(?:first name|given names?|voornaam)\s*:\s*([^\n|;]+)/i),
    last_name: profile.lastName || labelled(/(?:last name|family name|surname|achternaam)\s*:\s*([^\n|;]+)/i),
    email: profile.email || one(emails) || accountEmail || "",
    phone: profile.phone || one(phones) || labelledPhone || "",
    linkedin: profile.linkedin || one(contact.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[\w%-]+\/?/gi) || []),
    city: profile.place?.split(",")[0].trim() || "",
  }
  return Object.fromEntries(Object.entries(values).filter(([, value]) => Boolean(value)))
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** A month and year as a profile writes it ("Sep 2023", "09/2023", "2023-09", "2023"), as a date; the month is null when only the year is given. */
function monthYear(value: string | undefined): { y: number; m: number | null } | null {
  const text = (value ?? "").trim()
  if (!text) return null
  const named = /(?:^|[^a-z])([a-z]{3,10})\.?\s+(20\d{2}|19\d{2})\b/i.exec(text)
  const index = named ? MONTH_NAMES.findIndex((n) => n.toLowerCase().startsWith(named[1].toLowerCase().slice(0, 3))) : -1
  if (named && index >= 0) return { y: Number(named[2]), m: index }
  const numeric = /\b(0?[1-9]|1[0-2])\s*[/.-]\s*(20\d{2}|19\d{2})\b/.exec(text) ?? null
  if (numeric) return { y: Number(numeric[2]), m: Number(numeric[1]) - 1 }
  const iso = /\b(20\d{2}|19\d{2})-(0[1-9]|1[0-2])\b/.exec(text)
  if (iso) return { y: Number(iso[1]), m: Number(iso[2]) - 1 }
  const year = /\b(20\d{2}|19\d{2})\b/.exec(text)

  return year ? { y: Number(year[1]), m: null } : null
}

/**
 * What forms ask about studies, worked out from the education on the person's profile (their CV, read once): the school, the degree, the field, when
 * they graduate, which year they are in and whether they are a student now. Their own saved answers win over these. Nothing is guessed: a part the
 * profile does not hold is left out.
 */
export function educationFromProfile(profile: { education?: ReadonlyArray<Record<string, string | undefined>> }, now: Date = new Date()): Record<string, string> {
  const rows = (profile.education ?? []).filter((e) => (e["School Name"] ?? "").trim() || (e["Degree Name"] ?? "").trim())
  if (rows.length === 0) return {}
  const when = now.getFullYear() * 12 + now.getMonth()
  const endOf = (e: Record<string, string | undefined>): number | null => {
    const d = monthYear(e["End Date"])

    return d ? d.y * 12 + (d.m ?? 5) : null
  }
  const startOf = (e: Record<string, string | undefined>): number | null => {
    const d = monthYear(e["Start Date"])

    return d ? d.y * 12 + (d.m ?? 8) : null
  }
  // The study they are in now (it ends ahead, or has no end): else the one that ended last.
  const current = rows.filter((e) => (endOf(e) === null && startOf(e) !== null) || (endOf(e) ?? -1) >= when).sort((a, b) => (startOf(b) ?? 0) - (startOf(a) ?? 0))[0]
  const latest = current ?? [...rows].sort((a, b) => (endOf(b) ?? 0) - (endOf(a) ?? 0))[0]
  const out: Record<string, string> = {}
  const school = (latest["School Name"] ?? "").trim()
  const degree = (latest["Degree Name"] ?? "").trim()
  const field = (latest["Field Of Study"] ?? "").trim()
  if (school) out.university = school
  if (degree) out.degree = degree
  if (field) out.field_of_study = field
  const end = monthYear(latest["End Date"])
  if (end) out.graduation_date = end.m === null ? String(end.y) : `${MONTH_NAMES[end.m]} ${end.y}`
  const began = monthYear(latest["Start Date"])
  if (began) out.study_start = began.m === null ? String(began.y) : `${MONTH_NAMES[began.m]} ${began.y}`
  if (current) {
    out.study_status = "Yes, enrolled"
    const start = startOf(current)
    if (start !== null) {
      const year = Math.min(6, Math.max(1, Math.floor((when - start) / 12) + 1))
      out.study_year = `${year}${year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"} year`
    }
  } else if (end) out.study_status = "No"

  return out
}

/** The most recent job on the profile (what a form calls "current or most recent job"): its title and company. Nothing when the profile holds no job. */
export function workFromProfile(profile: { positions?: ReadonlyArray<Record<string, string | undefined>> }, now: Date = new Date()): Record<string, string> {
  const rows = (profile.positions ?? []).filter((p) => (p.Title ?? "").trim() && ((p["Company Name"] ?? p.Company ?? "").trim()))
  if (rows.length === 0) return {}
  const when = now.getFullYear() * 12 + now.getMonth()
  // A profile writes a job's dates as "Started On" and "Finished On" (an export may say Start Date and End Date).
  const startOf = (p: Record<string, string | undefined>): number => {
    const d = monthYear(p["Started On"] ?? p["Start Date"])

    return d ? d.y * 12 + (d.m ?? 0) : 0
  }
  const open = (p: Record<string, string | undefined>): boolean => {
    const end = (p["Finished On"] ?? p["End Date"] ?? "").trim()
    const d = monthYear(end)

    return !end || /present|current|now/i.test(end) || (d ? d.y * 12 + (d.m ?? 11) >= when : false)
  }
  const latest = [...rows].sort((a, b) => Number(open(b)) - Number(open(a)) || startOf(b) - startOf(a))[0]

  return { current_job_title: (latest.Title ?? "").trim(), current_company: (latest["Company Name"] ?? latest.Company ?? "").trim() }
}
