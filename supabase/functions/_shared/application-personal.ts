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
