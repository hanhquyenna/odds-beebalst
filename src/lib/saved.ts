import { toast } from "sonner"

/**
 * The one "Saved." notice, shown after anything that is kept (a tick, a choice, a person added), so it looks the same as pressing Save.
 * It reuses one id, so ticking several boxes quickly shows one notice, not a stack. An action that adds something can give an Undo.
 */
export function saved(undo?: () => void): void {
  toast.success("Saved.", { id: "saved", duration: 2500, ...(undo ? { action: { label: "Undo", onClick: undo } } : {}) })
}
