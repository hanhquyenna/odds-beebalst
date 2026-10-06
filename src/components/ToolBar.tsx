/** The row over the list, board and calendar: how many on the left, the layout, sort and properties buttons on the right, with no frame around it. The table draws the same row inside its own frame. */
export function ToolBar({ count, noun, tools, lead }: { count?: number; noun: { one: string; many: string }; tools: React.ReactNode; /** Stands in the place of the count. */ lead?: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm [&>*]:shrink-0">
      {lead ? lead : count === undefined ? <span /> : (
        <span className="text-muted-foreground">
          {count} {count === 1 ? noun.one : noun.many}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2 [&>*]:shrink-0">{tools}</span>
    </div>
  )
}

/**
 * A button in the toolbar above the list: white with an outline, the same height as Jobs, List and Sort beside it.
 * Pressed, it turns black, so it is plain which panel is open. Every button here uses this one style.
 */
export function ToolButton({ pressed, onClick, round, children }: { pressed: boolean; onClick: () => void; /** On a phone, an icon in a circle: its words are read out, not shown. Only for buttons whose icon says it. */ round?: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg border-[1.5px] px-3 text-sm md:px-3.5 ${round ? "max-md:w-10 max-md:justify-center max-md:rounded-full max-md:px-0 max-md:[&>span]:sr-only" : ""} font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px ${
        pressed ? "border-foreground bg-foreground text-background hover:bg-foreground/85" : "bg-card hover:border-foreground/40 hover:bg-accent"
      }`}
    >
      {children}
    </button>
  )
}
