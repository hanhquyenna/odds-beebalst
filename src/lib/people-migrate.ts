import type { Person, Profile } from "@/lib/types"

/**
 * Older saved people may still carry a "how you know them" (nothing asks for it or shows it any more); "Other" becomes "Colleague" so the old
 * field stays valid. It never counts for anything: a referral counts when the person's stage is "Referred".
 */
export function migratePeople(people: ReadonlyArray<Person> | undefined): Person[] | undefined {
  if (!people) return undefined

  return people.map((p) => ((p.relationship as string) === "Other" ? { ...p, relationship: "Colleague" as const } : p))
}

export function migrateProfile(profile: Profile): Profile {
  return profile.people ? { ...profile, people: migratePeople(profile.people) ?? [] } : profile
}
