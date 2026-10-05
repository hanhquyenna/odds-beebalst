import { useState } from "react"
import { Button } from "@/components/ui/button"
import { addJob, addJobMessage, JOB_LINK } from "@/lib/add-job"
import { useData } from "@/lib/data"

/**
 * Paste a LinkedIn job link and it joins the shared list for everyone, and your tracker. The backend does the checking, and nothing is paid for until the
 * link is a real job link and the job is not already here (see supabase/functions/jobs/add.ts). A job we already hold is simply put in your tracker.
 */
export function AddFromLinkedIn({ onDone }: { onDone: (message: string) => void }): React.JSX.Element {
  const data = useData()
  const [link, setLink] = useState<string>("")
  const [busy, setBusy] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    const url = link.trim()
    if (!JOB_LINK.test(url)) {
      setError("Paste the link to one LinkedIn job, like https://www.linkedin.com/jobs/view/1234567890")

      return
    }
    setError(null)
    setBusy(true)
    try {
      const found = await addJob(url)
      if (found.status === "added") {
        await data.refreshPostings()
      }
      if (found.status === "added" || found.status === "exists") {
        data.setSaved(found.id, true)
        setLink("")
        onDone(found.status === "added" ? `${addJobMessage(found)} It is in your tracker too.` : `${addJobMessage(found)} It is in your tracker now.`)
      } else {
        onDone(addJobMessage(found))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that job.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 pr-8">
      <h3 className="font-heading text-lg font-medium">Add a job from LinkedIn</h3>
      <p className="text-sm text-muted-foreground">Paste the link to a job. We read it for you, add it to your tracker, and add it to the list for everyone. If we already have it, it just goes to your tracker.</p>
      <div className="flex flex-wrap gap-2">
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://www.linkedin.com/jobs/view/…"
          aria-label="LinkedIn job link"
          disabled={busy}
          className="h-9 min-w-0 flex-1 rounded-lg border-[1.5px] bg-background px-3 text-sm"
        />
        <Button type="submit" disabled={busy || link.trim() === ""} className="cursor-pointer">
          {busy ? "Reading the job…" : "Add from LinkedIn"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}
