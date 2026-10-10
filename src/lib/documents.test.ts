import { describe, expect, test } from "bun:test"
import { MAX_NAME, attachedTo, explain, freeName, jobsUsing, mainCv, mimeOf, nameFromFile, previewOf, problemText, wordCount, DocumentError, type Doc } from "@/lib/document-model"

const doc = (over: Partial<Doc>): Doc => ({ id: "d1", kind: "cv", name: "Finance v1", fileName: "cv.pdf", mime: "application/pdf", size: 1000, body: "text", isMain: false, createdAt: "2026-10-06T10:00:00Z", ...over })
const state = (docs: Doc[], links: Array<{ postingId: string; kind: "cv" | "cover_letter"; documentId: string }>): Parameters<typeof attachedTo>[0] => ({ userId: "u", status: "ready", docs, links })

describe("file types", () => {
  test("the type comes from the ending, because browsers often send none for .docx or .md", () => {
    expect(mimeOf("My CV.PDF")).toBe("application/pdf")
    expect(mimeOf("cv.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    expect(mimeOf("notes.md")).toBe("text/markdown")
    expect(mimeOf("cv.doc")).toBe("application/octet-stream")
  })
})

describe("names", () => {
  test("a starting name drops the ending and tidies the file name", () => {
    expect(nameFromFile("Jane_Doe__CV  final.pdf")).toBe("Jane Doe CV final")
    expect(nameFromFile(".pdf")).toBe("Untitled")
    expect(nameFromFile(`${"a".repeat(200)}.pdf`).length).toBe(MAX_NAME)
  })

  test("a name already taken gets a number, compared without case", () => {
    expect(freeName("Finance v1", [])).toBe("Finance v1")
    expect(freeName("Finance v1", ["finance V1"])).toBe("Finance v1 2")
    expect(freeName("Finance v1", ["Finance v1", "Finance v1 2"])).toBe("Finance v1 3")
  })

  test("a numbered name still fits the limit", () => {
    const long = "x".repeat(MAX_NAME)
    const made = freeName(long, [long])
    expect(made.length).toBeLessThanOrEqual(MAX_NAME)
    expect(made.endsWith(" 2")).toBe(true)
  })
})

describe("what a refusal means", () => {
  test("the limit, a repeated file and a repeated name each say what to do", () => {
    expect(explain({ code: "P0001", message: "document limit" }).message).toContain("5 documents")
    expect(explain({ code: "23505", message: 'duplicate key value violates unique constraint "documents_hash_unique"' }).message).toContain("exact file")
    expect(explain({ code: "23505", message: 'duplicate key value violates unique constraint "documents_name_unique"' }).message).toContain("name")
    expect(explain({ message: "boom" }).message).toBe("That did not save. Try again.")
  })

  test("our own messages are shown as they are, anything else as a plain retry", () => {
    expect(problemText(new DocumentError("Pick another name."))).toBe("Pick another name.")
    expect(problemText(new TypeError("x is undefined"))).toBe("That did not work. Try again.")
  })
})

describe("what is on a job", () => {
  const s = state([doc({ id: "a", isMain: true }), doc({ id: "b", name: "Marketing v2" }), doc({ id: "c", kind: "cover_letter", name: "Letter" })], [
    { postingId: "p1", kind: "cv", documentId: "b" },
    { postingId: "p1", kind: "cover_letter", documentId: "c" },
    { postingId: "p2", kind: "cv", documentId: "b" },
  ])

  test("a job's CV and letter are found by kind", () => {
    expect(attachedTo(s, "p1", "cv")?.name).toBe("Marketing v2")
    expect(attachedTo(s, "p1", "cover_letter")?.name).toBe("Letter")
    expect(attachedTo(s, "p3", "cv")).toBeUndefined()
  })

  test("the jobs a document is on, and the main CV", () => {
    expect(jobsUsing(s, "b")).toEqual(["p1", "p2"])
    expect(jobsUsing(s, "a")).toEqual([])
    expect(mainCv(s)?.id).toBe("a")
  })
})

describe("what a document is about", () => {
  test("skips the name and the contact lines a CV opens with", () => {
    const cv = "Jane Doe\njane@doe.nl · +31 6 1234 5678\nlinkedin.com/in/janedoe\nFinance graduate with two internships in audit.\nSkills: Excel, SQL"
    expect(previewOf(cv)).toBe("Finance graduate with two internships in audit. · Skills: Excel, SQL")
  })

  test("a letter keeps its first line", () => {
    expect(previewOf("Dear hiring team,\nI am applying for the analyst role.")).toBe("Dear hiring team, · I am applying for the analyst role.")
  })

  test("long text is cut at a word, with an ellipsis", () => {
    const out = previewOf("Summary. " + "word ".repeat(80), 40)
    expect(out.endsWith("…")).toBe(true)
    expect(out.length).toBeLessThanOrEqual(41)
    expect(out).not.toMatch(/wor…$/)
  })

  test("no text, no preview; words are counted", () => {
    expect(previewOf("")).toBe("")
    expect(wordCount(" one two\nthree ")).toBe(3)
  })
})
