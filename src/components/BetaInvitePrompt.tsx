import { useEffect, useState } from "react"
import { PromoSheet } from "@/components/PromoSheet"
import { isInstalled, platformOf } from "@/lib/push"

const HIDDEN_UNTIL = "odds:beta-invite-until"
const JOINED = "odds:beta-invite-joined"
/** AddToPhonePrompt's own snooze: set once someone has seen and closed that panel. */
const PHONE_PANEL_SEEN = "odds:phone-prompt-until"
/** "Not now" keeps it away for a week, then it asks once more. */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
/** The WhatsApp group or community link for the beta testers (VITE_BETA_GROUP_URL). Without it the card never shows. */
const GROUP_URL = String(import.meta.env.VITE_BETA_GROUP_URL ?? "").trim()

function hidden(): boolean {
  try {
    return window.localStorage.getItem(JOINED) === "1" || Number(window.localStorage.getItem(HIDDEN_UNTIL) ?? 0) > Date.now()
  } catch {
    return false
  }
}

/** On a phone browser the Home Screen panel goes first: this card waits until that one has been seen. */
function phonePanelPending(): boolean {
  if (platformOf() === "desktop" || isInstalled()) return false
  try {
    return window.localStorage.getItem(PHONE_PANEL_SEEN) === null
  } catch {
    return false
  }
}

function remember(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Blocked storage: it asks again next visit, which is fine.
  }
}

/** The picture: a small group chat, three messages that arrive one after the other. */
function ChatGraphic(): React.JSX.Element {
  const bubbles: ReadonlyArray<{ from: string; text: string; mine?: boolean }> = [
    { from: "Linh", text: "Anyone applied to the Philips finance internship?" },
    { from: "Minh", text: "Yes, 2 weeks ago. Happy to share what they asked." },
    { from: "You", text: "That helps, thank you!", mine: true },
  ]

  return (
    <div aria-hidden="true" className="absolute inset-x-6 top-10 flex flex-col gap-2.5">
      {bubbles.map((b, i) => (
        <div key={b.text} className={`phone-prompt-pop flex ${b.mine ? "justify-end" : "justify-start"}`} style={{ animationDelay: `${0.2 + i * 0.35}s` }}>
          <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-md ${b.mine ? "rounded-br-md bg-brand-ink text-white" : "rounded-bl-md bg-white text-neutral-900"}`}>
            {b.mine ? null : <span className="block text-xs font-semibold text-brand-ink">{b.from}</span>}
            {b.text}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * An invitation to the beta testers' WhatsApp group, once someone is signed in and has had a few seconds with the jobs.
 * On a phone browser it waits for the Home Screen panel (AddToPhonePrompt) to have been seen first. "Join" opens the group
 * in a new tab and the card never comes back; "Not now" keeps it away for a week.
 */
export function BetaInvitePrompt({ active }: { active: boolean }): React.JSX.Element | null {
  const [open, setOpen] = useState<boolean>(false)

  useEffect(() => {
    if (!active || !GROUP_URL || hidden()) return
    const id = window.setTimeout(() => {
      if (!phonePanelPending()) setOpen(true)
    }, 6000)

    return () => window.clearTimeout(id)
  }, [active])

  if (!open) return null

  function close(): void {
    remember(HIDDEN_UNTIL, String(Date.now() + SNOOZE_MS))
    setOpen(false)
  }

  function join(): void {
    remember(JOINED, "1")
    setOpen(false)
    window.open(GROUP_URL, "_blank", "noopener,noreferrer")
  }

  return (
    <PromoSheet
      titleId="beta-invite-title"
      graphic={<ChatGraphic />}
      title="Join the odds beta group"
      body="A WhatsApp group of students testing odds. Everyone in the group can see each other's phone numbers."
      points={["Ask about a job, answered by people who applied", "Tell us what is wrong or missing", "See new features first"]}
      action="Join the group"
      later="Not now"
      onAction={join}
      onClose={close}
    />
  )
}
