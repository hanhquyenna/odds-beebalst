import type { FormState } from "@/lib/journey"

/** What moved between the saved profile and the form, in the words the save bar shows. */
export function describeChanges(before: FormState, after: FormState): ReadonlyArray<string> {
  const out: string[] = []
  if (before.permit !== after.permit) out.push("Permit")
  if (before.origin !== after.origin) out.push("Background")
  if (before.birth !== after.birth) out.push("Birth year")
  if (before.abroad !== after.abroad) out.push("Months abroad")
  if (before.dutch !== after.dutch) out.push("Dutch level")
  if (before.salary !== after.salary) out.push("Salary")

  return out
}
