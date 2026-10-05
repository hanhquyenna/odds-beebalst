/** The row over the list, board and calendar: how many on the left, the layout, sort and properties buttons on the right, with no frame around it. The table draws the same row inside its own frame. */
export function ToolBar({ count, noun, tools, lead }: { count?: number; noun: { one: string; many: string }; tools: React.ReactNode; /** Stands in the place of the count. */ lead?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="no-scrollbar flex flex-nowrap items-center gap-3 overflow-x-auto text-sm sm:flex-wrap sm:justify-between [&>*]:shrink-0">
      {lead ? lead : count === undefined ? <span /> : (
        <span className="text-muted-foreground">
          {count} {count === 1 ? noun.one : noun.many}
        </span>
      )}
      <span className="flex items-center gap-2 sm:flex-wrap [&>*]:shrink-0">{tools}</span>
    </div>
  )
}
