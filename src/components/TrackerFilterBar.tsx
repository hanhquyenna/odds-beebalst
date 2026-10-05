import { STEPS } from "@/components/job-steps"
import { MultiPick } from "@/components/JobFilters"
import { NO_TRACKER_FILTER, isTrackerFilterOn, type TrackerFilter } from "@/lib/tracker"

/**
 * The filters on your own search, in the same row as the job filters: which statuses to show.
 * The choice is part of the open view.
 */
export function TrackerFilters({ value, onChange }: { value: TrackerFilter; onChange: (next: TrackerFilter) => void }): React.JSX.Element {
  return (
    <>
      <MultiPick label="Status" any="Any status" items={STEPS.map((c) => ({ value: c.step, label: c.title }))} value={value.status} onChange={(status) => onChange({ ...value, status })} />
      {isTrackerFilterOn(value) ? (
        <button type="button" onClick={() => onChange(NO_TRACKER_FILTER)} className="h-10 cursor-pointer px-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Clear status
        </button>
      ) : null}
    </>
  )
}
