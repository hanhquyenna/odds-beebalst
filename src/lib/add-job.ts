import { ANON_KEY, SUPABASE_URL } from "@/lib/supabase"

/** A LinkedIn job link, in any of the forms LinkedIn shows. The server checks it again; this only spares a round trip for an obvious mistake. */
export const JOB_LINK = /^https:\/\/(www\.|[a-z]{2,3}\.)?linkedin\.com\/jobs\/(view\/|search|collections)/i

export type AddJobResult =
  | { status: "added"; id: string; title: string; employer: string; dutch_required: boolean; student_fit: boolean }
  | { status: "exists"; id: string; title: string; employer: string }
  | { status: "closed"; id?: string; title?: string; employer?: string }
  | { status: "not_netherlands"; title: string; employer: string; place: string }
  | { status: "unreadable"; message: string }

/** Sends a pasted LinkedIn job link to the backend, which reads the job once and keeps it in the shared database for everyone. */
export async function addJob(url: string): Promise<AddJobResult> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/jobs/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ url }),
  })
  const body = (await res.json().catch(() => ({}))) as Partial<AddJobResult> & { error?: string }
  if (!res.ok || !body.status) {
    throw new Error(body.error ?? "Could not add that job. Try again in a minute.")
  }

  return body as AddJobResult
}

/** What to tell the person, in plain words. */
export function addJobMessage(result: AddJobResult): string {
  switch (result.status) {
    case "added":
      return result.dutch_required ? `Added: ${result.title} at ${result.employer}. It needs Dutch, so you see it only when the English filter is off.` : `Added: ${result.title} at ${result.employer}. Everyone can see it now.`
    case "exists":
      return `We already have this job: ${result.title} at ${result.employer}.`
    case "closed":
      return "That job is closed on LinkedIn, so it was not added."
    case "not_netherlands":
      return `That job is in ${result.place || "another country"}. We only keep jobs in the Netherlands.`
    case "unreadable":
      return result.message
  }
}
