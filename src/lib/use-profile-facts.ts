import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { hashItem, itemsOf } from "../../supabase/functions/profile/items"
import type { Session } from "@/lib/auth"
import { parseItemFacts, strengthFromItems, type ItemFacts, type ReadItem, type Strength } from "@/lib/strength"
import { ANON_KEY, SUPABASE_URL } from "@/lib/supabase"
import type { Posting, Profile } from "@/lib/types"

/**
 * What Jev read from the person's saved profile (supabase/functions/profile), kept in step with the profile.
 *
 * The stored facts are matched to the CURRENT profile by fingerprint of each part's text, so a part that was edited or removed
 * stops counting the moment it changes, and a new part counts once it has been read. Signed out, or the reader off or busy:
 * there are no facts, and every number is what it was without them.
 */
export function useProfileFacts(profile: Profile, session: Session | null): { strengthFor: (post: Pick<Posting, "family">) => Strength | null; refresh: () => void; reading: boolean; pending: number } {
  const [stored, setStored] = useState<Record<string, ItemFacts>>({})
  const [current, setCurrent] = useState<Array<{ hash: string; text: string }>>([])
  const [reading, setReading] = useState<boolean>(false)
  const [pending, setPending] = useState<number>(0)
  const token = session?.access_token ?? null
  const tokenRef = useRef<string | null>(token)
  tokenRef.current = token
  const busy = useRef<boolean>(false)
  const again = useRef<boolean>(false)
  const stopped = useRef<boolean>(false)

  // The parts of the profile as it is right now, fingerprinted.
  const key = useMemo(() => JSON.stringify([profile.cv, profile.positions, profile.education]), [profile.cv, profile.positions, profile.education])
  useEffect(() => {
    let live = true
    const items = itemsOf(profile)
    void Promise.all(items.map(hashItem)).then((hashes) => {
      if (live) setCurrent(items.map((it, i) => ({ hash: hashes[i], text: it.text })))
    })

    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // A different person starts with nothing.
  useEffect(() => {
    setStored({})
    setPending(0)
    stopped.current = false
  }, [session?.user.id])

  const refresh = useCallback((): void => {
    if (!tokenRef.current || stopped.current) return
    if (busy.current) {
      again.current = true

      return
    }
    busy.current = true
    setReading(true)
    fetch(`${SUPABASE_URL}/functions/v1/profile/read`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${tokenRef.current}` }, body: "{}" })
      .then(async (res) => {
        if (res.status === 503 || res.status === 401 || (res.status === 404 && !res.headers.get("content-type")?.includes("json"))) {
          stopped.current = true

          return
        }
        const body = (await res.json().catch(() => null)) as { items?: Array<{ hash: string; facts: unknown }>; pending?: number } | null
        if (!res.ok || !body?.items) return
        const next: Record<string, ItemFacts> = {}
        for (const it of body.items) {
          const facts = parseItemFacts(it.facts)
          if (facts && typeof it.hash === "string") next[it.hash] = facts
        }
        setStored((prev) => ({ ...prev, ...next }))
        setPending(body.pending ?? 0)
      })
      .catch(() => undefined)
      .finally(() => {
        busy.current = false
        setReading(false)
        if (again.current) {
          again.current = false
          refresh()
        }
      })
  }, [])

  const readItems = useMemo<ReadItem[]>(() => current.flatMap((c) => (stored[c.hash] ? [{ text: c.text, facts: stored[c.hash] }] : [])), [current, stored])
  const strengthFor = useCallback((post: Pick<Posting, "family">): Strength | null => strengthFromItems(readItems, post.family), [readItems])

  return { strengthFor, refresh, reading, pending }
}
