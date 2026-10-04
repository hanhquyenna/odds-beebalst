import { MultiPick } from "@/components/JobFilters"
import { NO_PEOPLE_FILTER, isPeopleFilterOn, type PeopleFilter } from "@/lib/people-table"
import { CONTACT_STATUSES } from "@/lib/types"

/** Filters above the people, in the same style as the jobs': which stages to show. Part of the open view. */
export function PeopleFilterBar({ value, onChange }: { value: PeopleFilter; onChange: (next: PeopleFilter) => void }): React.JSX.Element {
  return (
    <div role="group" aria-label="Filter the people" className="flex flex-wrap items-center gap-2">
      <MultiPick label="Stage" any="Any stage" items={CONTACT_STATUSES.map((s) => ({ value: s, label: s }))} value={value.status} onChange={(status) => onChange({ ...value, status })} />
      {isPeopleFilterOn(value) ? (
        <button type="button" onClick={() => onChange(NO_PEOPLE_FILTER)} className="h-10 cursor-pointer px-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Clear
        </button>
      ) : null}
    </div>
  )
}
