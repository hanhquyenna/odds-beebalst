/**
 * The stage of each person you write to, and what to do next. The stages follow the "What should I message?" playbook (lib/outreach-strategy.ts):
 * find them, one message that asks for a 15-minute chat, ask for insights, ask once for a referral, thank them, and the ways it stalls (no reply,
 * a no, someone else is the right person). The one timing rule is the playbook's: one nudge after a week, then someone else. The sales-blog
 * reply-rate figures contradict each other, so no figure of that kind is used here.
 */
import type { ContactStatus, MessageKind, Person } from "@/lib/types"

/** Days to wait before the one nudge. From the playbook ("One nudge after a week, then someone else"). */
export const NUDGE_AFTER_DAYS = 7

export interface StageInfo {
  /** One short line for what the stage means. */
  hint: string
  /** What to do when a person is here, in the user's words. */
  next: string
  /** The kind of message that goes with it, as named in the templates, or null when there is nothing to send. */
  kind: MessageKind | null
  /** A stage where waiting is the move and a nudge becomes due after a week. */
  waiting?: boolean
  /** The outreach has ended at this stage. */
  closed?: boolean
}

export const STAGES: Record<ContactStatus, StageInfo> = {
  "To contact": { hint: "Not written to yet", next: "Send the first message: say what you share, the job, and ask for a 15-minute online chat.", kind: "Introduction" },
  Contacted: { hint: "Request or message sent, waiting", next: "Wait for a reply. Nudge once after a week.", kind: "Follow-up", waiting: true },
  Connected: { hint: "They accepted, you have not written yet", next: "Write the chat message now: a connection alone does nothing.", kind: "Introduction" },
  Replied: { hint: "They answered", next: "Agree a time for the 15-minute chat and bring your questions. If they have no time, offer three questions by message.", kind: "Other" },
  "Chat booked": { hint: "A time is fixed", next: "Prepare your questions. Ask, do not pitch.", kind: null },
  Met: { hint: "You spoke", next: "Thank them today, naming one thing they said. Ask for the referral only after that.", kind: "Thank you" },
  "Referral asked": { hint: "Waiting for their answer", next: "Wait. Nudge once after a week, and make it easy to say no.", kind: "Follow-up", waiting: true },
  Referred: { hint: "They said yes", next: "Apply the same day with the job ID, tell them it is in, and thank them.", kind: "Thank you" },
  "No reply": { hint: "No answer after the nudge", next: "Stop writing to them. Try someone else on the team.", kind: null, closed: true },
  "Said no": { hint: "They declined", next: "Thank them once. Ask who else on the team might talk to you.", kind: "Follow-up", closed: true },
  "Passed me on": { hint: "They pointed to someone else", next: "Add the person they named, and open with who sent you.", kind: "Introduction", closed: true },
}

export interface NextStep {
  text: string
  kind: MessageKind | null
  /** The week is up and the one nudge is due. */
  due: boolean
}

const DAY = 86_400_000

/** What to do next for one person. `due` is only ever true where waiting is the move and the stage is a week old; no date, never due. */
export function nextStep(person: Pick<Person, "status" | "statusAt">, now: Date = new Date(), days: number = NUDGE_AFTER_DAYS): NextStep {
  const info = STAGES[person.status] ?? STAGES["To contact"]
  const at = person.statusAt ? Date.parse(person.statusAt) : NaN
  const due = info.waiting === true && Number.isFinite(at) && now.getTime() - at >= days * DAY
  if (due) {
    return { text: person.status === "Referral asked" ? "A week has passed. Send one polite nudge, then stop." : "A week has passed. Send one nudge, then someone else.", kind: "Follow-up", due: true }
  }

  return { text: info.next, kind: info.kind, due: false }
}

/** The stage a person is set to when it is changed now. */
export const stamp = (status: ContactStatus, now: Date = new Date()): { status: ContactStatus; statusAt: string } => ({ status, statusAt: now.toISOString() })
