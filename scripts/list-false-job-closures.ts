// Read-only list of extension job-closed events whose reported page is not the posting URL.
// It prints rows. It does not update postings.
import { jobClosedAllowed } from "../supabase/functions/_shared/apply-navigation.ts"

const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "")
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!url || !key) {
  console.log("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to list job-closed events. No rows were changed.")
  process.exit(0)
}

const headers = { apikey: key, Authorization: `Bearer ${key}` }
const events = await fetch(`${url}/rest/v1/apply_agent_events?event_type=eq.job-closed&select=id,posting_id,payload,created_at&order=created_at.desc&limit=500`, { headers }).then((res) => res.json()) as Array<{ id: string; posting_id: string | null; payload: { url?: string; page_url?: string; posting_url?: string }; created_at: string }>
if (!Array.isArray(events)) {
  console.error("Could not read job-closed events. No rows were changed.")
  process.exit(1)
}
const ids = [...new Set(events.map((event) => event.posting_id).filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id)))]
const postings = ids.length
  ? await fetch(`${url}/rest/v1/postings?id=in.(${ids.join(",")})&select=id,title,url,closed_at`, { headers }).then((res) => res.json()) as Array<{ id: string; title: string; url: string; closed_at: string | null }>
  : []
if (!Array.isArray(postings)) {
  console.error("Could not read postings. No rows were changed.")
  process.exit(1)
}
const byId = new Map(postings.map((posting) => [posting.id, posting]))
console.log("| Event | Posting | Stored URL | Reported page | Closed at |")
console.log("| --- | --- | --- | --- | --- |")
let mismatches = 0
let unverified = 0
for (const event of events) {
  const posting = event.posting_id ? byId.get(event.posting_id) : undefined
  const stored = posting?.url || event.payload?.posting_url || ""
  const page = event.payload?.page_url || ""
  if (!page) { unverified += 1; continue }
  if (!stored || jobClosedAllowed(page, stored)) continue
  mismatches += 1
  console.log(`| ${event.id} | ${posting?.title || event.posting_id || ""} | ${stored} | ${page} | ${posting?.closed_at || ""} |`)
}
console.log("")
console.log(`${mismatches} mismatched page URL(s). ${unverified} older event(s) stored no page URL, so they cannot be checked.`)
console.log("Reopen a false closure manually after review. This script does not write.")
