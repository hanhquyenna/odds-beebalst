import { useEffect } from "react"
import { useData } from "@/lib/data"
import { forgetDrafts, loadDrafts, markDraftApplied, personAfterSent, toApply, useDrafts } from "@/lib/outreach"

const GAP_MS = 30_000

/**
 * Mounted once. Loads the drafts Claude wrote for the signed-in person, again whenever they come back to this tab (Claude may have added some or
 * marked one sent), and brings each person up to date with the messages that went out.
 */
export function useOutreachSync(): void {
  const data = useData()
  const userId = data.session?.user.id ?? null
  const { drafts, loaded } = useDrafts()

  useEffect(() => {
    if (!userId) {
      forgetDrafts()

      return
    }
    let last = 0
    const run = (): void => {
      if (document.visibilityState !== "visible" || Date.now() - last < GAP_MS) return
      last = Date.now()
      void loadDrafts()
    }
    run()
    document.addEventListener("visibilitychange", run)
    window.addEventListener("focus", run)

    return () => {
      document.removeEventListener("visibilitychange", run)
      window.removeEventListener("focus", run)
    }
  }, [userId])

  // Waits for the saved profile: a person list still on its way down is never written over.
  const ready = loaded && data.profileSaved
  const { people, updatePerson } = data
  useEffect(() => {
    if (!ready) return
    for (const { draft, person } of toApply(drafts, people)) {
      const patch = personAfterSent(person, draft)
      if (patch) updatePerson(person.id, patch)
      void markDraftApplied(draft.id)
    }
  }, [ready, drafts, people, updatePerson])
}
