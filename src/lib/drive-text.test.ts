import { expect, test } from "bun:test"
import { cleanAgentText, fillHasEmDash, noEmDash, optionTexts } from "../../supabase/functions/_shared/drive-text"

test("an em dash in the agent's own text becomes a comma", () => {
  expect(noEmDash("The form is filled — only Submit is left.")).toBe("The form is filled, only Submit is left.")
  expect(noEmDash("data—driven")).toBe("data, driven")
  expect(noEmDash("Done —.")).toBe("Done.")
  expect(noEmDash("No dash here – en dash stays")).toBe("No dash here – en dash stays")
})

test("finish, say, letters and typed answers lose em dashes; a choice that is the page's own option stays exact", () => {
  const finish = cleanAgentText("finish", { run_id: "r", stage: "review", message: "All filled — Submit is yours.", questions: ["Religion — optional"] })
  expect(finish.message).toBe("All filled, Submit is yours.")
  expect(finish.questions).toEqual(["Religion, optional"])
  expect(cleanAgentText("write_letter", { text: "I build agents — in TypeScript." }).text).toBe("I build agents, in TypeScript.")
  const options = optionTexts({ fields: [{ id: "f1", options: ["Yes — authorised", { text: "No" }] }] })
  const fill = cleanAgentText("fill", { say: "Filling — now", fields: [{ id: "f0", value: "I like SQL — and DCF." }, { id: "f1", value: "Yes — authorised" }] }, options)
  expect(fill.say).toBe("Filling, now")
  expect(fill.fields).toEqual([{ id: "f0", value: "I like SQL, and DCF." }, { id: "f1", value: "Yes — authorised" }])
  expect(fillHasEmDash({ fields: [{ id: "a", value: "x — y" }] })).toBe(true)
  expect(fillHasEmDash({ fields: [{ id: "a", value: "x, y" }] })).toBe(false)
})
