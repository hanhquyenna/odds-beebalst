import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { buttonVariants } from "@/components/ui/button"
import { SortIcon } from "@/components/icons"
import { cn } from "cn"
import { JOB_SORTS, type JobSortKey } from "@/lib/sort"

/** Sort a list of jobs. The same control, in the same words, wherever jobs are listed. Drawn like the filters beside it. */
export function SortSelect({ value, onChange, keys, dark = false }: { value: JobSortKey; onChange: (key: JobSortKey) => void; keys?: ReadonlyArray<JobSortKey>; dark?: boolean }): React.JSX.Element {
  const options = JOB_SORTS.filter((s) => !keys || keys.includes(s.key)).map((s) => ({ value: s.key, label: s.label }))

  return (
    <Select items={options} value={value} onValueChange={(next) => onChange(next ?? value)}>
      <SelectTrigger aria-label="Sort by" className={cn(buttonVariants({ variant: "outline" }), "h-10 cursor-pointer gap-2 border-border bg-background px-3 font-medium")}>
        <SortIcon className={cn("size-4", dark ? "text-band-muted" : "text-muted-foreground")} aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="cursor-pointer">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
