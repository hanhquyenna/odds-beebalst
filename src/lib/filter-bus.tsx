import { createContext, useContext } from "react"
import type { JobFilters } from "@/lib/filters"

/**
 * A tag on a job is a way to follow up: pressing it narrows the list to jobs
 * with the same tag. Whatever shows a list provides how its filters change;
 * where nothing does (a shared job link), tags are plain labels.
 */
const Bus = createContext<((patch: Partial<JobFilters>) => void) | null>(null)

export const FilterBus = Bus
export const useApplyFilter = (): ((patch: Partial<JobFilters>) => void) | null => useContext(Bus)
