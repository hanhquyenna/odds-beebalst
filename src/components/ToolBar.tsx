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

/**
 * A button in the toolbar above the list: white with an outline, the same height as Jobs, List and Sort beside it.
 * Pressed, it turns black, so it is plain which panel is open. Every button here uses this one style.
 */
export function ToolButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] px-3.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px ${
        pressed ? "border-foreground bg-foreground text-background hover:bg-foreground/85" : "bg-card hover:border-foreground/40 hover:bg-accent"
      }`}
    >
      {children}
    </button>
  )
}
