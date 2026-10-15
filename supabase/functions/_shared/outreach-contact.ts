/** Contact eligibility and evidence checks. A senior title never proves responsibility for a vacancy. */
type Row = Record<string, unknown>
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}
const text = (value: unknown): string => typeof value === "string" ? value.trim() : ""
const companyWords = (value: unknown): string[] => text(value).toLowerCase().replace(/&amp;/g, "&").replace(/\b(b\.?v\.?|n\.?v\.?|gmbh|ltd|llc|inc|plc|group|holding|holdings|the|company)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean)
export function sameContactEmployer(value: unknown, employer: string): boolean {
  const a = companyWords(value), b = companyWords(employer)
  if (a.join("").length < 3 || b.join("").length < 3) return false
  return (a.length <= b.length ? a.every((w, i) => b[i] === w) : b.every((w, i) => a[i] === w))
}
export function currentContactTitle(person: Row, employer: string): string | null {
  const positions = Array.isArray(person.positions) ? person.positions.map(record) : []
  const position = positions.find(p => text(p.title) && sameContactEmployer(p.company, employer))
  return position ? text(position.title) : null
}
export function assessContact(person: Row, employer: string): { eligible: boolean; currentEmployerMatched: boolean; reason: string | null } {
  const jev = record(person.jev)
  if (text(jev.decision_final || jev.decision) === "reject") return { eligible: false, currentEmployerMatched: false, reason: "rejected_by_existing_checks" }
  if (!text(person.name) || !/^https:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i.test(text(person.profile_url))) return { eligible: false, currentEmployerMatched: false, reason: "missing_identity_or_profile" }
  const positions = Array.isArray(person.positions) ? person.positions.map(record) : []
  const matching = currentContactTitle(person, employer) !== null
  if (positions.length && !matching) return { eligible: false, currentEmployerMatched: false, reason: "stored_position_at_other_employer" }
  const kept = jev.decision_final === "keep" || jev.decision === "keep"
  if (!kept && !matching) return { eligible: false, currentEmployerMatched: false, reason: "affiliation_not_established" }
  return { eligible: true, currentEmployerMatched: matching, reason: matching ? null : "current_position_missing" }
}
