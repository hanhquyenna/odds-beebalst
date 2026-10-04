/** The shape of the job list while it loads, so the page does not jump when the jobs arrive. */
export function JobListSkeleton(): React.JSX.Element {
  return (
    <div role="status" aria-label="Loading jobs" className="w-full overflow-hidden rounded-xl border-[1.5px] bg-card">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-start gap-3.5 border-b-[1.5px] px-4 py-4 last:border-b-0 md:px-6 md:py-5">
          <div className="size-12 shrink-0 rounded-lg bg-secondary" />
          <div className="flex flex-1 flex-col gap-2.5">
            <div className="h-4 w-2/3 rounded bg-secondary" />
            <div className="h-3.5 w-1/3 rounded bg-secondary" />
            <div className="h-3.5 w-1/2 rounded bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  )
}
