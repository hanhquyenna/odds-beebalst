import { toast } from "sonner"
import type { Posting } from "@/lib/types"

interface Saver {
  saved: Set<string>
  setSaved: (id: string, on: boolean) => void
  setPassed: (id: string, on: boolean) => void
}

/** One toast at a time: saving another job replaces the last one's Undo. */
const UNDO_TOAST = "job-undo"

/**
 * Saving puts a job in your tracker, wherever the bookmark was pressed. The
 * toast is the way back from a slip, since a saved job leaves the list of jobs
 * to look at.
 */
export function toggleSave(data: Saver, post: Posting): void {
  const was = data.saved.has(post.id)
  data.setSaved(post.id, !was)
  data.setPassed(post.id, false)
  toast(was ? `Removed ${post.title} from your tracker` : `Saved ${post.title} to your tracker`, {
    id: UNDO_TOAST,
    duration: 4000,
    action: {
      label: "Undo",
      onClick: () => data.setSaved(post.id, was),
    },
  })
}

interface Remover extends Saver {
  applications: ReadonlyArray<{ id: string | number; posting_id: string }>
  removeApplication: (id: never) => Promise<void>
}

/** Takes a job out of your list for good: not saved, and any application logged on it is removed too. */
export function removeFromList(data: Remover, post: Posting): void {
  data.setSaved(post.id, false)
  const app = data.applications.find((a) => a.posting_id === post.id)
  if (app) {
    data.removeApplication(app.id as never).catch(() => undefined)
  }
  toast(`Removed ${post.title} from your list`, { id: UNDO_TOAST, duration: 4000 })
}
