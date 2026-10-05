import { profileFields } from "@/lib/field"
import { DEFAULT_FILTERS, type JobFilters } from "@/lib/filters"
import { FIT_SEED_VIEWS, normalizeViews } from "@/lib/saved-views"
import { DEFAULT_PROFILE, type Profile } from "@/lib/types"

/**
 * "The jobs that fit you", defined once: the app's list and bell, and the morning message on the server
 * (supabase/functions/morning-jobs, bundled by scripts/build-morning-jobs.sh), all count with these, so they agree.
 */

/** English unless the person chose a language: "Dutch needed" alone, or both ticked for every job. No language set means English. */
export function withFitLanguage(filters: JobFilters): JobFilters {
  return filters.language.length === 0 ? { ...filters, language: [...DEFAULT_FILTERS.language] } : filters
}

/** The person's preferences, English by default, and, until a line of work is chosen, the lines of work the profile points to. */
export function fitFilters(filters: JobFilters, profile: Profile, fields: string[] = profileFields(profile)): JobFilters {
  const f = withFitLanguage(filters)

  return f.field.length > 0 || fields.length === 0 ? f : { ...f, field: fields }
}

/** For the server: the preferences kept with the saved profile (the first view of "Jobs that fit you"), as the list opens. */
export function savedFitFilters(saved: Partial<Profile> | null | undefined): JobFilters {
  const profile = { ...DEFAULT_PROFILE, ...(saved ?? {}) } as Profile
  const views = normalizeViews(profile.fitViews, FIT_SEED_VIEWS)

  return fitFilters({ ...views[0].filters, query: "" }, profile)
}
