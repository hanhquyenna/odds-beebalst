import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/**
 * What we researched about an employer on the open web (database function company_research, filled from
 * research-data/companies/deep). Every item names the page it was read on, so the reader can check it.
 */

export interface Sourced {
  source_name: string
  source_url: string
}

export interface ResearchFact extends Sourced {
  label: string
  value: string
}

export interface ResearchItem extends Sourced {
  text: string
}

export interface CompanyResearch {
  identified: boolean
  name?: string
  website?: string
  about?: ResearchItem
  facts?: ResearchFact[]
  achievements?: ResearchItem[]
  for_internationals?: ResearchItem[]
  researched_on?: string
}

const cache = new Map<string, Promise<CompanyResearch | null>>()

export function loadCompanyResearch(employer: string, display: string): Promise<CompanyResearch | null> {
  const key = `${employer}\u0000${display}`
  let p = cache.get(key)
  if (!p) {
    p = Promise.resolve(supabase.rpc("company_research", { p_employer: employer, p_display: display })).then(({ data, error }) =>
      error || !data || !(data as CompanyResearch).identified ? null : (data as CompanyResearch),
    )
    cache.set(key, p)
  }

  return p
}

/** Undefined while loading, then the research or null. */
export function useCompanyResearch(employer: string, display: string): CompanyResearch | null | undefined {
  const key = `${employer}\u0000${display}`
  const [state, setState] = useState<{ key: string; value: CompanyResearch | null } | null>(null)
  useEffect(() => {
    let live = true
    void loadCompanyResearch(employer, display).then((value) => {
      if (live) setState({ key, value })
    })

    return () => {
      live = false
    }
  }, [employer, display, key])

  return state?.key === key ? state.value : undefined
}
