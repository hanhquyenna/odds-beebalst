/** Copies text with the clipboard API where the browser allows it, else the older way through a hidden text box; `onCopied` runs once it is copied. */
export function copyText(text: string, onCopied: () => void): void {
  const fallback = (): void => {
    const box = document.createElement("textarea")
    box.value = text
    box.style.position = "fixed"
    box.style.opacity = "0"
    document.body.appendChild(box)
    box.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(box)
    if (ok) onCopied()
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(onCopied, fallback)
  } else {
    fallback()
  }
}
