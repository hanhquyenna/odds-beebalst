import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CHANNEL_WORDS, markDraftSent, personAfterSent, removeDraft, useDrafts, type Draft } from "@/lib/outreach"
import { useData } from "@/lib/data"
import { saved } from "@/lib/saved"

function DraftCard({ draft }: { draft: Draft }): React.JSX.Element {
  const data = useData()
  const [problem, setProblem] = useState<string | null>(null)
  const [copied, setCopied] = useState<boolean>(false)
  const person = draft.personId ? data.people.find((p) => p.id === draft.personId) : undefined

  function copy(): void {
    void navigator.clipboard.writeText(draft.body).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      },
      () => setProblem("Could not copy. Select the text and copy it."),
    )
  }
  async function sent(): Promise<void> {
    setProblem(null)
    try {
      await markDraftSent(draft.id, Boolean(person))
      const patch = person ? personAfterSent(person, { ...draft, status: "sent", sentAt: new Date().toISOString() }) : null
      if (person && patch) {
        data.updatePerson(person.id, patch)
        saved()
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Could not save that.")
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border-[1.5px] p-3 text-sm">
      <p className="text-xs font-medium text-muted-foreground">
        {CHANNEL_WORDS[draft.channel]} {draft.personId ? "" : `to ${draft.toName}`}
        {draft.status === "sent" ? " · sent" : ""}
      </p>
      {draft.subject ? <p className="font-medium">{draft.subject}</p> : null}
      <p className="whitespace-pre-wrap">{draft.body}</p>
      {draft.status === "draft" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={copy} className="cursor-pointer max-md:h-10">
            {copied ? "Copied" : draft.subject ? "Copy message" : "Copy"}
          </Button>
          {draft.toUrl && /^https?:\/\//.test(draft.toUrl) ? (
            <a href={draft.toUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-lg border-[1.5px] px-3 text-sm font-medium max-md:h-10">
              Open their page
            </a>
          ) : null}
          <Button type="button" size="sm" onClick={() => void sent()} className="cursor-pointer max-md:h-10">
            I sent it
          </Button>
          <button type="button" onClick={() => void removeDraft(draft.id).catch(() => setProblem("Could not delete that."))} className="cursor-pointer px-2 text-sm text-muted-foreground underline underline-offset-4 max-md:h-10">
            Delete
          </button>
        </div>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </li>
  )
}

/** The messages Claude drafted: for one person on your list, or for a job (those with nobody on the list). Nothing shows where there are none. */
export function OutreachDrafts({ personId, postingId }: { personId?: string; postingId?: string }): React.JSX.Element | null {
  const { drafts } = useDrafts()
  const mine = drafts.filter((d) => (personId ? d.personId === personId : postingId ? d.postingId === postingId && d.personId === null : false))
  if (mine.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.8125rem] font-medium text-muted-foreground">Messages from Claude</p>
      <ul className="flex flex-col gap-2">
        {mine.map((d) => (
          <DraftCard key={d.id} draft={d} />
        ))}
      </ul>
    </div>
  )
}
