/** One cell as CSV: quoted when it holds a comma, quote or line break, and never read as a formula by a spreadsheet. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value)
  if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) {
    text = `'${text}`
  }

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** A table as CSV text: a header row, then the rows. A leading mark lets Excel read accents correctly. */
export function toCsv(headers: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return `﻿${[headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`
}

/** Hands the file to the browser as a download. */
export function downloadCsv(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name.endsWith(".csv") ? name : `${name}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
