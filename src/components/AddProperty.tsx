import { useState } from "react"
import { CalendarIcon, CircleChevronDownIcon, EnvelopeIcon, HashIcon, LinkIcon, ListChecksIcon, PhoneIcon, PlusIcon, SquareCheckIcon, TypeIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { addColumn, availablePresets, type TableKind } from "@/lib/columns"
import { useData } from "@/lib/data"
import type { PropertyType } from "@/lib/types"

const TYPES: ReadonlyArray<{ value: PropertyType; label: string; Icon: typeof TypeIcon }> = [
  { value: "text", label: "Text", Icon: TypeIcon },
  { value: "number", label: "Number", Icon: HashIcon },
  { value: "select", label: "Select", Icon: CircleChevronDownIcon },
  { value: "multiselect", label: "Multi-select", Icon: ListChecksIcon },
  { value: "date", label: "Date", Icon: CalendarIcon },
  { value: "checkbox", label: "Checkbox", Icon: SquareCheckIcon },
  { value: "url", label: "Link", Icon: LinkIcon },
  { value: "email", label: "Email", Icon: EnvelopeIcon },
  { value: "phone", label: "Phone", Icon: PhoneIcon },
]

/**
 * Adding a property of your own, in one place for the job and the table. The usual ones from the popular job-tracker templates are one press each (Priority, Next action,
 * Deadline and so on); anything else is a name, a type and, for a select, its choices.
 */
export function AddPropertyForm({ onDone, kind = "jobs" }: { onDone?: () => void; kind?: TableKind }): React.JSX.Element {
  const data = useData()
  const [custom, setCustom] = useState<boolean>(false)
  const [name, setName] = useState<string>("")
  const [type, setType] = useState<PropertyType>("text")
  const [options, setOptions] = useState<string>("")
  const presets = availablePresets(data.profile, kind)

  const add = (n: string, t: PropertyType, o?: string[]): void => {
    data.setProfile(addColumn(data.profile, n, t, o, kind))
    setName("")
    setOptions("")
    setCustom(false)
    onDone?.()
  }

  return (
    <div className="flex flex-col gap-1">
      {presets.length > 0 ? (
        <>
          <p className="px-2 pt-1 pb-0.5 text-[0.8125rem] text-muted-foreground">Add a usual one</p>
          {presets.map((p) => {
            const Icon = TYPES.find((t) => t.value === p.type)?.Icon ?? TypeIcon

            return (
              <button key={p.name} type="button" onClick={() => add(p.name, p.type, p.options)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{p.name}</span>
                <span className="truncate text-[0.8125rem] text-muted-foreground">{p.hint}</span>
              </button>
            )
          })}
        </>
      ) : null}
      <div className="mt-1 border-t-[1.5px] pt-1">
        {custom ? (
          <form
            className="flex flex-wrap items-center gap-2 p-1"
            onSubmit={(e) => {
              e.preventDefault()
              add(name, type, type === "select" || type === "multiselect" ? options.split(",") : undefined)
            }}
          >
            <input autoFocus aria-label="Property name" placeholder="Name, e.g. Salary ask" value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-full rounded-md border-[1.5px] bg-background px-2 text-sm" />
            <select aria-label="Property type" value={type} onChange={(e) => setType(e.target.value as PropertyType)} className="h-8 rounded-md border-[1.5px] bg-background px-2 text-sm">
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {type === "select" || type === "multiselect" ? <input aria-label="Choices, separated by commas" placeholder="Choices: A, B, C" value={options} onChange={(e) => setOptions(e.target.value)} className="h-8 w-full rounded-md border-[1.5px] bg-background px-2 text-sm" /> : null}
            <Button type="submit" size="sm" disabled={!name.trim()} className="cursor-pointer">
              Add
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setCustom(false)} className="cursor-pointer">
              Cancel
            </Button>
          </form>
        ) : (
          <button type="button" onClick={() => setCustom(true)} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-150 hover:bg-accent">
            <PlusIcon className="size-4" aria-hidden="true" /> Your own property
          </button>
        )}
      </div>
    </div>
  )
}
