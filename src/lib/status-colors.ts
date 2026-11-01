/**
 * The colour of each status, as a straight hex colour: grey saved, green applied, blue interview, orange offer, red rejected, light grey no reply, purple withdrew. These are the starting colours; a person can change any of them (Edit colors in the status menu) and the
 * choice is kept with their profile. The text on a colour is black or white, whichever reads better on it.
 */
export type StatusKey = "saved" | "applied" | "interview" | "offer" | "rejected" | "no_reply" | "withdrawn"

export const STATUS_KEYS: ReadonlyArray<{ key: StatusKey; label: string }> = [
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
  { key: "no_reply", label: "No reply" },
  { key: "withdrawn", label: "Withdrew" },
]

export const DEFAULT_STATUS_COLORS: Record<StatusKey, string> = {
  saved: "#4B5563",
  applied: "#16A34A",
  interview: "#2563EB",
  offer: "#F97316",
  rejected: "#DC2626",
  no_reply: "#9CA3AF",
  withdrawn: "#9333EA",
}

/** Straight colours to pick from. */
export const COLOR_CHOICES: ReadonlyArray<{ name: string; hex: string }> = [
  { name: "Red", hex: "#DC2626" },
  { name: "Orange", hex: "#F97316" },
  { name: "Yellow", hex: "#FBBF24" },
  { name: "Green", hex: "#16A34A" },
  { name: "Teal", hex: "#0D9488" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Purple", hex: "#9333EA" },
  { name: "Pink", hex: "#DB2777" },
  { name: "Brown", hex: "#92400E" },
  { name: "Grey", hex: "#9CA3AF" },
  { name: "Dark grey", hex: "#4B5563" },
  { name: "Black", hex: "#111827" },
]

export const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)

/**
 * White or black ink for a colour. White is preferred, as on any solid button, as long as it is readable (a contrast of at least 2.7 for white on the colour,
 * which keeps white on orange and green); where it is not, black is used (yellow, light greys).
 */
export function inkOn(hex: string): "#000000" | "#ffffff" {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

  return 1.05 / (luminance + 0.05) >= 2.7 ? "#ffffff" : "#000000"
}

/** The colour of each status for this person: their choice where it is a valid colour, else the starting colour. Anything else saved there is ignored. */
export function statusColors(saved: Partial<Record<string, unknown>> | undefined): Record<StatusKey, string> {
  const out = { ...DEFAULT_STATUS_COLORS }
  for (const { key } of STATUS_KEYS) {
    const mine = saved?.[key]
    if (isHex(mine)) {
      out[key] = mine
    }
  }

  return out
}

/** The look of a status button: its colour and the ink on it. A job that is not saved has no colour. */
export function lookOf(value: string, colors: Record<StatusKey, string>): { background: string; ink: string } | null {
  const hex = (colors as Record<string, string>)[value === "hired" ? "offer" : value]
  if (!hex) {
    return null
  }

  return { background: hex, ink: inkOn(hex) }
}

/** The colour of each stage of an outreach, by the stage's name, kept in the same place as the job statuses' under "person:" and the stage. */
export const PERSON_STAGES: ReadonlyArray<string> = ["To contact", "Contacted", "Connected", "Replied", "Chat booked", "Met", "Referral asked", "Referred", "No reply", "Said no", "Passed me on"]

export const DEFAULT_PERSON_COLORS: Record<string, string> = {
  "To contact": "#4B5563",
  Contacted: "#FBBF24",
  Connected: "#0D9488",
  Replied: "#2563EB",
  "Chat booked": "#9333EA",
  Met: "#16A34A",
  "Referral asked": "#F97316",
  Referred: "#15803D",
  "No reply": "#9CA3AF",
  "Said no": "#DC2626",
  "Passed me on": "#92400E",
}

export const personKey = (stage: string): string => `person:${stage}`

/** The colour of each outreach stage for this person: their choice where valid, else the starting colour. */
export function personColors(saved: Partial<Record<string, unknown>> | undefined): Record<string, string> {
  const out = { ...DEFAULT_PERSON_COLORS }
  for (const stage of PERSON_STAGES) {
    const mine = saved?.[personKey(stage)]
    if (isHex(mine)) {
      out[stage] = mine
    }
  }

  return out
}

/** The look of an outreach-stage button: its colour and the ink on it. */
export function personLook(stage: string, colors: Record<string, string>): { background: string; ink: string } | null {
  const hex = colors[stage]

  return hex ? { background: hex, ink: inkOn(hex) } : null
}
