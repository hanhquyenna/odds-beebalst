// LinkedIn profile links: checking and tidying what people paste. No network here, so it can be tested on its own.

export const LINKEDIN_URL = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9%_-]{3,100}\/?(\?.*)?$/

/**
 * A profile link as people paste it, made into the one form the reader takes (https://www.linkedin.com/in/name), or
 * null when it is not a profile link. Takes it with or without https:// or www., http, the mobile site (m.) or a
 * country one (nl.), spaces around it, and the tracking the LinkedIn app adds when sharing (?utm_…, #…).
 */
export function toLinkedInUrl(input: string): string | null {
  const raw = input.trim().replace(/^[<"'(]+|[>"')]+$/g, "")
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (!/^(www\.|m\.|[a-z]{2,3}\.)?linkedin\.com$/i.test(url.hostname)) {
    return null
  }
  const slug = /^\/in\/([A-Za-z0-9%_-]{3,100})\/?$/.exec(url.pathname)?.[1]

  return slug ? `https://www.linkedin.com/in/${slug}` : null
}
