import { STEPS } from "@/components/PipelineBoard"
import { MultiPick } from "@/components/JobFilters"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "cn"
import { NO_TRACKER_FILTER, isTrackerFilterOn, type TrackerFilter } from "@/lib/tracker"

/** A filter that is on or off, drawn like the other filters in the row. */
export function ToggleFilter({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn(buttonVariants({ variant: "outline" }), "h-10 cursor-pointer border-border bg-background px-3 font-medium", on && "border-brand bg-accent")}>
      {children}
    </button>
  )
}

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
