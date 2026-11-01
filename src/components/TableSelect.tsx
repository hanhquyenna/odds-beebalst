import { useEffect, useState } from "react"
import { GroupByButton } from "@/components/GroupByButton"
import { Button } from "@/components/ui/button"

/** Which rows of a table are ticked. Kept by id, so it survives sorting and paging; ids no longer in the table drop out. */
export function useSelection(ids: ReadonlyArray<string>): { chosen: ReadonlySet<string>; toggle: (id: string) => void; all: boolean; some: boolean; toggleAll: () => void; clear: () => void } {
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const key = ids.join("\u0000")
  useEffect(() => {
    setChosen((prev) => {
      const here = new Set(ids)
      const next = new Set([...prev].filter((id) => here.has(id)))

      return next.size === prev.size ? prev : next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const all = ids.length > 0 && ids.every((id) => chosen.has(id))

  return {
    chosen,
    all,
    some: chosen.size > 0,
    toggle: (id) => setChosen((prev) => (prev.has(id) ? new Set([...prev].filter((x) => x !== id)) : new Set([...prev, id]))),
    toggleAll: () => setChosen(all ? new Set() : new Set(ids)),
    clear: () => setChosen(new Set()),
  }
}

const box = "size-4 cursor-pointer accent-foreground"

/** The first cell of a row: its number, which turns into a tick box when the row is hovered or ticked, as in Notion. */
export function RowMark({ n, label, checked, onToggle }: { n: number; label: string; checked: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <span className="relative flex h-6 w-full items-center justify-center text-[0.8125rem] text-muted-foreground tabular-nums">
      <span className={checked ? "hidden" : "group-hover:hidden"}>{n}</span>
      <input type="checkbox" aria-label={label} checked={checked} onChange={onToggle} className={`${box} ${checked ? "" : "hidden group-hover:block"}`} />
    </span>
  )
}

export function AllMark({ checked, some, onToggle }: { checked: boolean; some: boolean; onToggle: () => void }): React.JSX.Element {
  return (
    <span className="flex h-6 items-center justify-center">
      <input
        type="checkbox"
        aria-label="Select every row"
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = some && !checked
        }}
        onChange={onToggle}
        className={box}
      />
    </span>
  )
}

/** Asks for the word "delete" before something is removed, so one slip cannot do it. */
export function DeleteDialog({ count, noun, onConfirm, onCancel }: { count: number; noun: { one: string; many: string }; onConfirm: () => void; onCancel: () => void }): React.JSX.Element {
  const [typed, setTyped] = useState<string>("")
  const ok = typed.trim().toLowerCase() === "delete"
  const what = `${count} ${count === 1 ? noun.one : noun.many}`

  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Delete ${what}`}
        onSubmit={(e) => {
          e.preventDefault()
          if (ok) onConfirm()
        }}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl border-[1.5px] bg-card p-5 shadow-lg"
      >
        <h2 className="text-lg font-semibold tracking-tight">Delete {what}?</h2>
        <p className="text-sm text-muted-foreground">This removes {count === 1 ? "it" : "them"} from your list. Type delete to confirm.</p>
        <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type delete to confirm" placeholder="delete" className="h-10 rounded-md border-[1.5px] border-input bg-background px-3 text-sm focus:border-ring focus:outline-none" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} className="cursor-pointer">
            Cancel
          </Button>
          <Button type="submit" disabled={!ok} className="cursor-pointer bg-red-600 text-white hover:bg-red-700 disabled:opacity-40">
            Delete
          </Button>
        </div>
      </form>
    </div>
  )
}

/** The bar over a table once rows are ticked: how many, export them as CSV, delete them, or let go. */
export function BulkBar({ count, onExport, onDelete, onClear }: { count: number; onExport: () => void; onDelete: () => void; onClear: () => void }): React.JSX.Element {
  const btn = "flex h-8 cursor-pointer items-center rounded-lg border-[1.5px] bg-card px-3 text-sm font-medium transition-colors duration-150 hover:bg-accent"

  return (
    <div role="toolbar" aria-label="Chosen rows" className="flex flex-wrap items-center gap-2 border-b-[1.5px] bg-accent/50 px-4 py-2 text-sm">
      <span className="font-medium">{count} chosen</span>
      <button type="button" onClick={onExport} className={btn}>
        Export CSV
      </button>
      <button type="button" onClick={onDelete} className={`${btn} text-red-600`}>
        Delete
      </button>
      <button type="button" onClick={onClear} className="cursor-pointer px-1 text-muted-foreground underline underline-offset-4 hover:text-foreground">
        Clear selection
      </button>
    </div>
  )
}

/** The bar over a table: the count (or what stands in its place) on the left, the table's tools and Group by on the right. */
export function TableBar({ lead, toolbar, groupBy, groups, onGroupBy }: { lead: React.ReactNode; toolbar: React.ReactNode; groupBy: string; groups: ReadonlyArray<{ key: string; label: string }>; onGroupBy: (key: string) => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-line px-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{lead}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-2 [&>*]:shrink-0">
        {toolbar}
        <GroupByButton value={groupBy} groups={groups} onChange={onGroupBy} />
      </span>
    </div>
  )
}
