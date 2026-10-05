import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { zipSync, strToU8 } from "fflate"
import { CV_MESSAGES, CvReadError, MAX_CV_BYTES, MAX_CV_CHARS, docxXmlToText, normaliseCv, readCvFile } from "@/lib/cv-file"
import { itemsOf } from "../../supabase/functions/profile/items"

// pdf.js for Node: no worker, no canvas.
const pdf = async () => (await import("pdfjs-dist/legacy/build/pdf.mjs")) as never
const file = (name: string, type = ""): File => new File([readFileSync(`tests/cvs/${name}`)], name, { type })
const read = (name: string) => readCvFile(file(name), pdf)

describe("normaliseCv", () => {
  test("keeps line breaks and removes the noise around them", () => {
    expect(normaliseCv("  Audit intern, KPMG \t\t Amsterdam \r\n\r\n\r\n\r\nMSc   Finance​ ")).toBe("Audit intern, KPMG Amsterdam\n\nMSc Finance")
  })
  test("drops control characters but not letters from any script", () => {
    expect(normaliseCv("a\u0000b\u0007c ال 软件 çñ")).toBe("abc ال 软件 çñ")
  })
  test("is capped", () => {
    expect(normaliseCv("x".repeat(MAX_CV_CHARS * 2))).toHaveLength(MAX_CV_CHARS)
  })
  test("an empty input is empty", () => expect(normaliseCv("  \n \t ")).toBe(""))
})

describe("docxXmlToText", () => {
  test("one line per paragraph, with entities, tabs and breaks", () => {
    const xml = "<w:p><w:r><w:t>Audit intern, KPMG &amp; Co</w:t></w:r></w:p><w:p><w:r><w:t>Jun</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>2023</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>next</w:t></w:r></w:p>"
    expect(docxXmlToText(xml)).toBe("Audit intern, KPMG & Co\nJun 2023\nnext\n")
  })
  test("table cells sit side by side on one line", () => {
    expect(docxXmlToText("<w:tr><w:tc><w:p><w:t>Role</w:t></w:p></w:tc><w:tc><w:p><w:t>2023</w:t></w:p></w:tc></w:tr>").replace(/\n+/g, "\n").trim()).toContain("Role")
  })
})

describe("reading real CV files", () => {
  test("a PDF: text and line structure survive", async () => {
    const r = await read("vietnam-finance.pdf")
    expect(r.text).toContain("Financial Analyst, Vietcombank")
    expect(r.text).toContain("MSc Finance, Erasmus University Rotterdam")
    expect(r.text).toContain("Winner, national finance case competition")
    expect(r.words).toBeGreaterThan(80)
    // The job title and its dates are separate lines, so each reads as one fact.
    const lines = r.text.split("\n")
    expect(lines.some((l) => l.startsWith("Financial Analyst, Vietcombank"))).toBe(true)
    expect(lines.some((l) => /Mar 2021/.test(l))).toBe(true)
  })
  test("a Word file: headings, bullets and skills survive", async () => {
    const r = await read("india-btech.docx")
    expect(r.text).toContain("Software Engineering Intern, Infosys")
    expect(r.text).toContain("B.Tech Computer Science and Engineering")
    expect(r.text).toContain("Java, Python, React, SQL")
  })
  test("a Word file with tables still gives the roles and skills", async () => {
    const r = await read("table-resume.docx")
    expect(r.text).toContain("Data Analyst Intern, Flipkart")
    expect(r.text).toContain("Tableau")
  })
  test("a Word file in Portuguese keeps its accents", async () => {
    const r = await read("brazil-pt.docx")
    expect(r.text).toContain("Estagiária de Marketing Digital")
    expect(r.text).toContain("Administração")
  })
  test("plain text is read as it is", async () => {
    const r = await read("weak-cv.txt")
    expect(r.text).toContain("hard working")
  })
  test("every readable file gives text the app can cut into profile parts", async () => {
    for (const name of ["vietnam-finance.pdf", "india-btech.docx", "nigeria-accountant.pdf", "brazil-pt.docx", "china-mech.pdf", "elite-heavy.pdf", "table-resume.docx", "weak-cv.txt"]) {
      const r = await read(name)
      const items = itemsOf({ cv: r.text })
      expect(items.length).toBeGreaterThanOrEqual(4)
      expect(items.every((i) => i.text.length <= 400)).toBe(true)
    }
  })
  test("a scanned page has no text, and the message says so", async () => {
    await expect(read("scanned.pdf")).rejects.toMatchObject({ reason: "empty", message: CV_MESSAGES.empty })
  })
  test("an old .doc is turned away with the way forward", async () => {
    await expect(read("old-format.doc")).rejects.toMatchObject({ reason: "old-word" })
  })
  test("a type we do not read is turned away", async () => {
    await expect(readCvFile(new File(["x"], "cv.pages"))).rejects.toMatchObject({ reason: "unsupported" })
    await expect(readCvFile(new File(["x"], "cv.png", { type: "image/png" }))).rejects.toMatchObject({ reason: "unsupported" })
  })
  test("a file that is too big is turned away before it is opened", async () => {
    const big = new File([new Uint8Array(MAX_CV_BYTES + 1)], "cv.pdf")
    await expect(readCvFile(big, pdf)).rejects.toMatchObject({ reason: "too-big" })
  })
  test("a damaged file says it could not be opened", async () => {
    await expect(readCvFile(new File([new Uint8Array([1, 2, 3, 4])], "cv.docx"), pdf)).rejects.toMatchObject({ reason: "damaged" })
    await expect(readCvFile(new File([strToU8("%PDF-1.4 broken")], "cv.pdf"), pdf)).rejects.toBeInstanceOf(CvReadError)
  })
  test("a zip that is not a Word file is damaged, not empty", async () => {
    const zip = zipSync({ "hello.txt": strToU8("hi") })
    await expect(readCvFile(new File([zip], "cv.docx"), pdf)).rejects.toMatchObject({ reason: "damaged" })
  })
  test("the extension decides, upper case included", async () => {
    const r = await readCvFile(new File([readFileSync("tests/cvs/weak-cv.txt")], "MY CV.TXT"), pdf)
    expect(r.text).toContain("hard working")
  })
})
