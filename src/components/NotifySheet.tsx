import { LockScreenGraphic, PromoSheet } from "@/components/PromoSheet"
import { platformOf } from "@/lib/push"

/** Panel two, the notifications panel, on its own so the phone drawings load only when it is shown (NotifyPrompt loads it on demand). */
export function NotifySheet({ busy, error, onTurnOn, onClose }: { busy: boolean; error: string | null; onTurnOn: () => void; onClose: () => void }): React.JSX.Element {
  return (
    <PromoSheet
      titleId="notify-prompt-title"
      graphic={<LockScreenGraphic platform={platformOf()} />}
      title="Get your jobs at 8 every morning"
      body="odds tells you when new jobs that fit you open, in one message, before your day starts."
      points={["One message a day, at 8", "Only jobs that fit you", "Turn it off any time in your phone's settings"]}
      action={busy ? "Turning on…" : "Turn on notifications"}
      busy={busy}
      error={error}
      onAction={onTurnOn}
      onClose={onClose}
    />
  )
}
