/** One all-day entry for someone's own calendar app. */
export interface IcsEvent {
  /** Stable across exports, so importing the file again updates the entry instead of adding a second one. */
  uid: string
  /** YYYY-MM-DD. */
  day: string
  title: string
  description: string
  url?: string
}

/** Text values escape backslash, semicolon, comma and line breaks (RFC 5545, 3.3.11). */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

/** Lines are folded at 75 octets, continuing with a space, without cutting a character in half (RFC 5545, 3.1). */
export function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ""
  let size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    // The first line holds 75 octets; each continuation spends one on its leading space.
    if (size + bytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current)
      current = ""
      size = 0
    }
    current += char
    size += bytes
  }
  parts.push(current)

  return parts.join("\r\n ")
}

function compactDay(day: string): string {
  return day.slice(0, 10).replace(/-/g, "")
}

function nextDay(day: string): string {
  const next = new Date(`${day.slice(0, 10)}T12:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)

  return next.toISOString().slice(0, 10)
}

/** A calendar file Apple Calendar, Google Calendar and Outlook all import. */
export function buildIcs(events: ReadonlyArray<IcsEvent>, name: string, now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//odds//job search//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeText(name)}`]
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}@odds`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDay(event.day)}`,
      `DTEND;VALUE=DATE:${compactDay(nextDay(event.day))}`,
      `SUMMARY:${escapeText(event.title)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      ...(event.url ? [`URL:${event.url}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")

  return `${lines.map(fold).join("\r\n")}\r\n`
}

/**
 * Hands the file to the device. A download is what makes Safari, and any desktop, offer to add the entries to the
 * calendar. The Home Screen app cannot download, so there the file goes to the share sheet instead.
 */
export async function saveIcs(text: string, filename: string): Promise<void> {
  const file = new File([text], filename, { type: "text/calendar" })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone && nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: filename })

      return
    } catch (e) {
      // Closing the share sheet is a choice, not a failure.
      if (e instanceof DOMException && e.name === "AbortError") {
        return
      }
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
