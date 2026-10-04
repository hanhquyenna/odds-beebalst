// Source for match.js: the app's own job filters, bundled so the morning message counts jobs exactly as the app does.
// Rebuild after changing the filters: scripts/build-morning-jobs.sh
export { applyFilters, normalizeFilters, DEFAULT_FILTERS, activeCount } from "@/lib/filters"
