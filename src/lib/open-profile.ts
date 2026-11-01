import { closeJobDrawer } from "@/lib/drawer"

/** What the "?" says on hover while nothing of yours is loaded. */
export const IMPORT_HINT = "Import LinkedIn or add your CV to see your chance"

/** Takes you to the LinkedIn import on your profile page, from anywhere (closing an open job first). */
export function openLinkedInImport(): void {
  closeJobDrawer()
  window.dispatchEvent(new CustomEvent("careersim:open-profile", { detail: "profile-linkedin" }))
}
