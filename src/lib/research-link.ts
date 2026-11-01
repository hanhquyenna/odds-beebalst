/** Opens a research report from anywhere on the page: the app listens for this and shows the report. */
export function openResearch(slug: string): void {
  window.dispatchEvent(new CustomEvent("careersim:open-research", { detail: slug }))
}
