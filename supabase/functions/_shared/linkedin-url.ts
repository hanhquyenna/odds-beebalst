// LinkedIn profile links: checking and tidying what people paste. No network and no imports, so the app and the profile
// function use the same file and it can be tested on its own.

/** The one form the reader takes. Everything toLinkedInUrl gives back passes it. */
export const LINKEDIN_URL = /^https:\/\/www\.linkedin\.com\/in\/[A-Za-z0-9%_-]{3,300}$/

/**
 * A profile link as people paste it, made into the one form the reader takes (https://www.linkedin.com/in/name), or
 * null when it is not a profile link. Takes:
 *  - with or without https:// or www., http, the mobile site (m.), a country one (nl.), any capitals in the address;
 *  - spaces, brackets or quotes around it, or words around it ("My LinkedIn: linkedin.com/in/…");
 *  - the tracking the LinkedIn app adds when sharing (?utm_…, #…);
 *  - a page inside the profile (/in/name/details/experience, /in/name/recent-activity/all, /in/name/en for another language)
 *    and the light mobile site (/mwlite/in/name);
 *  - a name with accents, typed (nguyễn-văn-an) or as the browser copies it (nguy%E1%BB%85n-v%C4%83n-an).
 */
export function toLinkedInUrl(input: string): string | null {
  const found = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*linkedin\.com\/[^\s<>"'()[\]{}]+/i.exec(input)?.[0]
  if (!found) {
    return null
  }
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(found) ? found : `https://${found}`)
  } catch {
    return null
  }
  if (!/^((www|m|[a-z]{2,3})\.)?linkedin\.com$/i.test(url.hostname)) {
    return null
  }
  const parts = url.pathname.split("/").filter((p) => p.length > 0)
  const at = parts.findIndex((p) => p.toLowerCase() === "in")
  if (at < 0 || (at === 1 && parts[0].toLowerCase() !== "mwlite") || at > 1) {
    return null
  }
  let slug = parts[at + 1] ?? ""
  try {
    slug = decodeURIComponent(slug).trim()
  } catch {
    return null
  }
  if (!/^[\p{L}\p{M}\p{N}_-]{3,100}$/u.test(slug)) {
    return null
  }

  return `https://www.linkedin.com/in/${encodeURIComponent(slug)}`
}
