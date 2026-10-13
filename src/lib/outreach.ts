/**
 * The messages Claude drafted for people at employers (table outreach_drafts, written by the connector). Claude only drafts: the person copies
 * a message, sends it themselves, and says so here or tells Claude. A sent message moves that person on to "Contacted" and is kept on them.
 */
import { useSyncExternalStore } from "react"
import { stamp } from "@/lib/outreach-stage"
import { supabase } from "@/lib/supabase"
import type { Person } from "@/lib/types"

export type Channel = "linkedin_note" | "linkedin_message" | "email"

export interface Draft {
  id: string
  personId: string | null
  postingId: string | null
  toName: string
  toUrl: string | null
  channel: Channel
  subject: string | null
  body: string
  status: "draft" | "sent"
  createdAt: string
  sentAt: string | null
  /** True once the person's stage and messages were brought up to date with this draft being sent. */
  applied: boolean
}

export const CHANNEL_WORDS: Record<Channel, string> = { linkedin_note: "LinkedIn note", linkedin_message: "LinkedIn message", email: "Email" }

interface Row {
  id: string
  person_id: string | null
  posting_id: string | null
  to_name: string
  to_url: string | null
  channel: Channel
  subject: string | null
  body: string
  status: "draft" | "sent"
  created_at: string
  sent_at: string | null
  applied_at: string | null
}

const COLUMNS = "id,person_id,posting_id,to_name,to_url,channel,subject,body,status,created_at,sent_at,applied_at"
const toDraft = (r: Row): Draft => ({ id: r.id, personId: r.person_id, postingId: r.posting_id, toName: r.to_name, toUrl: r.to_url, channel: r.channel, subject: r.subject, body: r.body, status: r.status, createdAt: r.created_at, sentAt: r.sent_at, applied: r.applied_at !== null })

/** What a sent draft does to the person it was for: Contacted from "To contact" (a person already further on stays where they are), and the message kept on them. Pure. */
export function personAfterSent(person: Person, draft: Draft): Partial<Omit<Person, "id">> | null {
  if (person.messages?.some((m) => m.id === draft.id)) return null
  const message = { id: draft.id, date: draft.sentAt ?? new Date().toISOString(), kind: "Introduction" as const, direction: "sent" as const, body: draft.subject ? `${draft.subject}\n\n${draft.body}` : draft.body }

  return { ...(person.status === "To contact" ? stamp("Contacted") : {}), messages: [...(person.messages ?? []), message] }
}

/** The sent drafts whose person is on the list and not yet brought up to date. */
export function toApply(drafts: ReadonlyArray<Draft>, people: ReadonlyArray<Person>): Array<{ draft: Draft; person: Person }> {
  const out: Array<{ draft: Draft; person: Person }> = []
  for (const draft of drafts) {
    if (draft.status !== "sent" || draft.applied || !draft.personId) continue
    const person = people.find((p) => p.id === draft.personId)
    if (person) out.push({ draft, person })
  }

  return out
}

// ---- the list, kept for the whole app ----

let drafts: ReadonlyArray<Draft> = []
let loaded = false
const listeners = new Set<() => void>()
const set = (next: ReadonlyArray<Draft>): void => {
  drafts = next
  loaded = true
  listeners.forEach((l) => l())
}

export function useDrafts(): { drafts: ReadonlyArray<Draft>; loaded: boolean } {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l)

      return () => listeners.delete(l)
    },
    () => drafts,
  )

  return { drafts: list, loaded }
}

export async function loadDrafts(): Promise<ReadonlyArray<Draft>> {
  const { data, error } = await supabase.from("outreach_drafts").select(COLUMNS).order("created_at", { ascending: false }).limit(300)
  // A table that is not there (an old copy of the database) is no drafts, not an error on the page.
  if (error) {
    set([])

    return []
  }
  const next = (data as unknown as Row[]).map(toDraft)
  set(next)

  return next
}

export function forgetDrafts(): void {
  drafts = []
  loaded = false
  listeners.forEach((l) => l())
}

/** The person says they sent it. */
export async function markDraftSent(id: string, applied: boolean): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await supabase.from("outreach_drafts").update({ status: "sent", sent_at: now, ...(applied ? { applied_at: now } : {}) }).eq("id", id)
  if (error) throw new Error("Could not save that. Try again.")
  set(drafts.map((d) => (d.id === id ? { ...d, status: "sent", sentAt: now, applied: applied || d.applied } : d)))
}

export async function markDraftApplied(id: string): Promise<void> {
  const { error } = await supabase.from("outreach_drafts").update({ applied_at: new Date().toISOString() }).eq("id", id)
  if (!error) set(drafts.map((d) => (d.id === id ? { ...d, applied: true } : d)))
}

export async function removeDraft(id: string): Promise<void> {
  const { error } = await supabase.from("outreach_drafts").delete().eq("id", id)
  if (error) throw new Error("Could not delete that. Try again.")
  set(drafts.filter((d) => d.id !== id))
}
