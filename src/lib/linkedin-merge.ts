import type { Profile, Row } from "@/lib/types"

/** What the import returns: the profile's own shapes, so it drops straight in. */
export interface LinkedInProfile {
  name: string
  headline: string
  place: string
  about: string
  /** The profile picture as a data URL, when LinkedIn gave one. */
  photo?: string
  /** The rest of what the profile says (certifications, projects, volunteering, honors), for reading skills out of. */
  cv: string
  positions: Row[]
  education: Row[]
  skills: Row[]
  languages: Row[]
}

/**
 * The imported profile laid over yours. Pressing Connect is asking for the import, so what LinkedIn gives replaces what was there
 * (the lists and the text fields), and where LinkedIn gives nothing for a field, what you had stays.
 */
export function mergeLinkedIn(profile: Profile, li: LinkedInProfile): Profile {
  return {
    ...profile,
    name: li.name || profile.name,
    headline: li.headline || profile.headline,
    place: li.place || profile.place,
    about: li.about || profile.about,
    cv: li.cv || profile.cv || "",
    positions: li.positions.length ? li.positions : profile.positions,
    education: li.education.length ? li.education : profile.education,
    skills: li.skills.length ? li.skills : profile.skills,
    languages: li.languages.length ? li.languages : profile.languages,
  }
}
