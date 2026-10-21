import { expect, test } from "bun:test"
import { AGE_FIELD, emptyUploads, strayAge } from "../../supabase/functions/mcp/drive"

test("an empty upload box blocks review: a required one, a letter box, or an 'Attach' box once the CV is in", () => {
  const page = { cv_attached: true, fields: [{ id: "f7", kind: "file", label: "Attach", value: "", filled: true, required: false }] }
  expect(emptyUploads(page)[0]).toContain("upload_letter with id f7")
  expect(emptyUploads({ fields: [{ id: "f7", kind: "file", label: "Cover Letter*", value: "", required: true }] })[0]).toContain("write_letter")
  expect(emptyUploads({ fields: [{ id: "f7", kind: "file", label: "Attach", value: "", required: false }] })).toEqual([])
  expect(emptyUploads({ cv_attached: true, fields: [{ id: "f7", kind: "file", label: "Cover Letter*", value: "Cover letter.pdf", required: true }] })).toEqual([])
  expect(emptyUploads({ fields: [{ id: "f8", kind: "file", label: "Portfolio (optional)", value: "", required: false }] })).toEqual([])
})

test("an age or birth answer the agent did not write is sent back; prefer-not and its own answers stand", () => {
  const label = "At Catawiki we have an age diversity from 20-74 years old. Which year range does your date of birth fit into?"
  expect(AGE_FIELD.test(label)).toBe(true)
  expect(AGE_FIELD.test("Which languages do you speak?")).toBe(false)
  expect(AGE_FIELD.test("Do you manage a page?")).toBe(false)
  const page = { fields: [{ id: "f18", kind: "combobox", label, value: "1945 - 1964" }, { id: "f13", kind: "combobox", label: "Gender", value: "Non-disclosed" }] }
  expect(strayAge(page, new Set()).map((f) => f.id)).toEqual(["f18"])
  expect(strayAge(page, new Set(["f18"]))).toEqual([])
  expect(strayAge({ fields: [{ id: "f18", kind: "combobox", label, value: "Prefer not to say" }] }, new Set())).toEqual([])
  expect(strayAge({ fields: [{ id: "f18", kind: "combobox", label, value: "" }] }, new Set())).toEqual([])
})
