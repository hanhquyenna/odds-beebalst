/**
 * Reads a CV file (PDF, Word .docx, or plain text) into text, in the browser. The file itself never leaves the device and is not
 * stored: only the text goes into the profile (profile.cv), where every other part of the app already reads it.
 *
 * Failures say what to do, because a CV that "uploaded" but read as nothing would quietly give a wrong chance:
 *   - an old .doc, or any type we do not read: save it as .docx or PDF
 *   - a PDF with no text (a scan or a photo): paste the text instead
 *   - a file over 8 MB
 *
 * Nothing heavy loads with the page: fflate loads only when a Word file is chosen, pdf.js only when a PDF is.
 */
export const MAX_CV_BYTES = 8 * 1024 * 1024
export const MAX_CV_CHARS = 20_000

export type CvFailure = "too-big" | "unsupported" | "old-word" | "empty" | "damaged"
export class CvReadError extends Error {
  reason: CvFailure

  constructor(reason: CvFailure, message: string) {
    super(message)
    this.reason = reason
  }
}

export const CV_MESSAGES: Record<CvFailure, string> = {
  "too-big": "That file is over 8 MB. Export your CV as a PDF or Word file without images.",
  unsupported: "We read PDF, Word (.docx) and text files. Save your CV as one of those.",
  "old-word": "That is an old Word format (.doc). Save it as .docx or PDF and upload it again.",
  empty: "We found no text in that file. A scanned page or a photo has none. Upload a PDF or Word file made from a document, or paste the text.",
  damaged: "We could not open that file. Export it again as PDF or Word.",
}

/** Control characters out, spaces tidied, line breaks kept (each line becomes one thing to read), and capped. */
export function normaliseCv(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/[​-‍⁠﻿]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\t+/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ ]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CV_CHARS)
}

const unescapeXml = (s: string): string =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")

/** The text of a Word document.xml: one line per paragraph, table cells side by side, tabs and breaks kept. */
export function docxXmlToText(xml: string): string {
  return unescapeXml(
    xml
      .replace(/<w:tab\s*\/>/g, " ")
      .replace(/<w:(br|cr)\b[^>]*\/>/g, "\n")
      .replace(/<\/w:tc>/g, " | ")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:p\b[^>]*\/>/g, "\n")
      .replace(/<[^>]+>/g, ""),
  ).replace(/ \| \n/g, "\n")
}

export async function docxToText(buf: Uint8Array): Promise<string> {
  // Imported here so fflate stays out of the page until a Word file is chosen.
  const { strFromU8, unzipSync } = await import("fflate")
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(buf, { filter: (f) => f.name === "word/document.xml" })
  } catch {
    throw new CvReadError("damaged", CV_MESSAGES.damaged)
  }
  const doc = files["word/document.xml"]
  if (!doc) throw new CvReadError("damaged", CV_MESSAGES.damaged)

  return docxXmlToText(strFromU8(doc))
}

interface PdfItem {
  str: string
  hasEOL?: boolean
  transform?: number[]
}
interface PdfJs {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfItem[] }> }> }> }
}

/** The pdf.js module, loaded only when a PDF is chosen so it adds nothing to the page otherwise. */
async function browserPdfJs(): Promise<PdfJs> {
  const pdfjs = await import("pdfjs-dist")
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker

  return pdfjs as unknown as PdfJs
}

/** The text of a PDF, page by page. Items on the same baseline join with a space; a new baseline starts a new line. */
export async function pdfToText(buf: Uint8Array, load: () => Promise<PdfJs> = browserPdfJs): Promise<string> {
  const pdfjs = await load()
  let doc
  try {
    doc = await pdfjs.getDocument({ data: buf }).promise
  } catch {
    throw new CvReadError("damaged", CV_MESSAGES.damaged)
  }
  const pages: string[] = []
  for (let n = 1; n <= Math.min(doc.numPages, 12); n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    let line = ""
    let lastY: number | null = null
    const lines: string[] = []
    for (const it of content.items) {
      if (typeof it.str !== "string") continue
      const y = it.transform ? Math.round(it.transform[5]) : null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3 && line.trim() !== "") {
        lines.push(line)
        line = ""
      }
      line += (line && it.str && !line.endsWith(" ") && !it.str.startsWith(" ") ? " " : "") + it.str
      if (y !== null) lastY = y
      if (it.hasEOL) {
        lines.push(line)
        line = ""
        lastY = null
      }
    }
    if (line.trim() !== "") lines.push(line)
    pages.push(lines.join("\n"))
  }

  return pages.join("\n")
}

export interface CvRead {
  text: string
  name: string
  words: number
}

const ext = (name: string): string => name.toLowerCase().split(".").pop() ?? ""

/** Reads one chosen file. Throws a CvReadError that says what to do. */
export async function readCvFile(file: File, pdf: () => Promise<PdfJs> = browserPdfJs): Promise<CvRead> {
  if (file.size > MAX_CV_BYTES) throw new CvReadError("too-big", CV_MESSAGES["too-big"])
  const e = ext(file.name)
  let raw: string
  if (e === "txt" || e === "md" || e === "text" || file.type === "text/plain") {
    raw = await file.text()
  } else if (e === "docx") {
    raw = await docxToText(new Uint8Array(await file.arrayBuffer()))
  } else if (e === "pdf" || file.type === "application/pdf") {
    raw = await pdfToText(new Uint8Array(await file.arrayBuffer()), pdf)
  } else if (e === "doc") {
    throw new CvReadError("old-word", CV_MESSAGES["old-word"])
  } else {
    throw new CvReadError("unsupported", CV_MESSAGES.unsupported)
  }
  const text = normaliseCv(raw)
  // A page of real CV has far more than this; less is a scan, a photo, or an empty file.
  if (text.replace(/\s/g, "").length < 40) throw new CvReadError("empty", CV_MESSAGES.empty)

  return { text, name: file.name, words: text.split(/\s+/).filter(Boolean).length }
}
