import { ChevronDownIcon, RowsIcon } from "@/components/icons"

/** The Group by control of a table, drawn like the Table, Sort and Properties buttons beside it. It says "Group by", and the group once one is chosen. The real select sits invisibly on top. */
export function GroupByButton({ value, groups, onChange }: { value: string; groups: ReadonlyArray<{ key: string; label: string }>; onChange: (key: string) => void }): React.JSX.Element {
  const on = groups.find((g) => g.key === value && g.key !== "")

  return (
    <span className={`relative flex h-10 items-center gap-2 rounded-lg border-[1.5px] bg-card px-3.5 text-sm font-medium transition-colors duration-150 focus-within:ring-3 focus-within:ring-ring/50 hover:bg-accent ${on ? "border-brand bg-accent" : ""}`}>
      <RowsIcon className="size-4" aria-hidden="true" />
      {on ? `Group by: ${on.label}` : "Group by"}
      <ChevronDownIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <select aria-label="Group by" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0">
        {groups.map((g) => (
          <option key={g.key} value={g.key}>
            {g.key === "" ? "No grouping" : g.label}
          </option>
        ))}
      </select>
    </span>
  )
}
