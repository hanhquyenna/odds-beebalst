/** A section of the job page: a heading and what goes under it, set off by a hairline. */
export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="border-t-[1.5px] pt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

