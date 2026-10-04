import type { Choice } from "@/components/ViewSettings"

/** Properties that start hidden, so the page stays quiet until someone wants them. Shown by choosing them in a job's Properties. */
export const HIDDEN_AT_START: ReadonlySet<string> = new Set(["applied", "followup", "deadline", "added", "applicants", "place", "messages"])

/**
 * The properties every job has, in one order, under one set of names, whichever
 * view shows them. Your own properties follow, named "p:" and then what you called them.
 */
export const STANDARD_PROPERTIES: ReadonlyArray<Choice> = [
  { key: "status", label: "Status" },
  { key: "applied", label: "Date applied" },
  { key: "followup", label: "Follow-up" },
  { key: "chance", label: "Interview chance" },
  { key: "pay", label: "Pay" },
  { key: "location", label: "Location" },
  { key: "posted", label: "Posted" },
  { key: "deadline", label: "Deadline" },
  { key: "open", label: "Still open" },
  { key: "level", label: "Level" },
  { key: "industry", label: "Industry" },
  { key: "language", label: "Language" },
  { key: "sponsor", label: "Sponsor" },
  { key: "contact", label: "Contact" },
  { key: "applicants", label: "Applicants" },
  { key: "added", label: "Date added" },
]

/** What a view can be sorted by. The board sorts within each step, so Status is not offered there. */
export const STANDARD_SORTS: ReadonlyArray<Choice> = [
  { key: "title", label: "Job title" },
  { key: "company", label: "Company" },
  { key: "newest", label: "Date posted" },
  { key: "open", label: "Still open" },
  { key: "applied", label: "Date applied" },
  { key: "followup", label: "Follow-up" },
  { key: "deadline", label: "Deadline" },
  { key: "chance", label: "Interview chance" },
  { key: "pay", label: "Pay" },
  { key: "location", label: "Location" },
  { key: "level", label: "Level" },
  { key: "industry", label: "Industry" },
  { key: "language", label: "Language" },
  { key: "sponsor", label: "Sponsor" },
  { key: "status", label: "Status" },
]
