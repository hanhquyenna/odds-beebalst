const STATIC_PAGES = ["about", "how-it-works", "technology", "network", "sources", "safety", "privacy", "terms", "research"] as const
export type StaticPage = (typeof STATIC_PAGES)[number]

const BY_PATH: Readonly<Record<string, StaticPage>> = Object.fromEntries(STATIC_PAGES.map((page) => [`/${page}`, page]))

export function pageFromPath(pathname: string): StaticPage | null {
  return BY_PATH[pathname] ?? (pathname.startsWith("/research/") ? "research" : null)
}

export function pathForPage(page: StaticPage): string {
  return `/${page}`
}
