/** An email address typed into a person's contact box (it also holds LinkedIn pages and phone numbers), or null. */
export function emailOf(contact: string): string | null {
  const m = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/.exec(contact.trim())

  return m ? m[0] : null
}

export interface FollowUpMail {
  /** Their email address. */
  to: string
  /** Their name as you keep it: the first word is used to greet them. */
  name: string
  job: string
  company: string
  /** The day you applied (YYYY-MM-DD), when there is one. */
  appliedOn?: string | null
  /** Your name, to sign with. */
  me?: string
}

/**
 * A short follow-up that opens in the person's own mail app, already written and addressed. odds sends nothing: the person reads it, changes it and
 * presses Send there. The words are plain on purpose (what was applied for, when, and an offer to answer questions), to be changed.
 */
export function followUpMailto(m: FollowUpMail): string {
  const first = m.name.trim().split(/\s+/)[0] || "there"
  const when = m.appliedOn && /^\d{4}-\d{2}-\d{2}/.test(m.appliedOn) ? ` on ${new Date(`${m.appliedOn.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}` : ""
  const body = [`Hi ${first},`, "", `I applied for the ${m.job} role at ${m.company}${when} and wanted to follow up. I am still very interested and would be glad to answer any questions or send anything that helps.`, "", "Thank you,", m.me?.trim() || ""].join("\n")
  const query = `subject=${encodeURIComponent(`Following up: ${m.job}`)}&body=${encodeURIComponent(body)}`

  return `mailto:${encodeURIComponent(m.to).replace(/%40/g, "@")}?${query}`
}
