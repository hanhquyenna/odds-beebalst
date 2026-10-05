import { ANON_KEY, SUPABASE_URL } from "@/lib/supabase"

export type { LinkedInProfile } from "@/lib/linkedin-merge"
export { mergeLinkedIn } from "@/lib/linkedin-merge"
import type { LinkedInProfile } from "@/lib/linkedin-merge"

export { toLinkedInUrl } from "@/lib/linkedin-url"

/** Asks the backend to read a LinkedIn profile. The scraper key stays on the server. */
export async function importLinkedIn(url: string, accessToken: string | null): Promise<LinkedInProfile> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/import-linkedin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${accessToken ?? ANON_KEY}` },
    body: JSON.stringify({ url }),
  })
  if (res.status === 404 && !res.headers.get("content-type")?.includes("json")) {
    throw new Error("LinkedIn import is not switched on yet.")
  }
  const body = (await res.json().catch(() => ({}))) as { profile?: LinkedInProfile; error?: string }
  if (!res.ok || !body.profile) {
    throw new Error(body.error ?? "Could not read that profile.")
  }

  return body.profile
}

export type { Suggestion } from "@/lib/suggest"
import type { Suggestion } from "@/lib/suggest"

/** The people stored for a job's employer (found in a batch, each checked by Jev). Reading costs nothing; nothing is searched here. `searched` is false when the employer was never looked up. */
export async function suggestReferrals(employer: string, accessToken: string | null): Promise<{ people: Suggestion[]; searched: boolean }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/suggest-referrals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${accessToken ?? ANON_KEY}` },
    body: JSON.stringify({ employer }),
  })
  if (res.status === 404 && !res.headers.get("content-type")?.includes("json")) {
    throw new Error("Finding people is not switched on yet.")
  }
  const body = (await res.json().catch(() => ({}))) as { people?: Suggestion[]; searched?: boolean; error?: string }
  if (!res.ok || !body.people) {
    throw new Error(body.error ?? "Could not look for people.")
  }

  return { people: body.people, searched: body.searched === true }
}
