import { Button } from "@/components/ui/button"

/** A plain question with a yes and a no, for something that is easy to press by mistake. Esc, the backdrop and Cancel all say no. */
export function ConfirmDialog({ title, body, confirm, onConfirm, onCancel }: { title: string; body?: string; confirm: string; onConfirm: () => void; onCancel: () => void }): React.JSX.Element {
  return (
    <div role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onCancel()} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onCancel()} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border-[1.5px] bg-card p-5 shadow-lg">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {body ? <p className="text-sm text-muted-foreground">{body}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} className="cursor-pointer">
            Cancel
          </Button>
          <Button type="button" autoFocus onClick={onConfirm} className="cursor-pointer">
            {confirm}
          </Button>
        </div>
      </div>
    </div>
  )
}
