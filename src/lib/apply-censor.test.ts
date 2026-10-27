import { describe, expect, test } from "bun:test"
import {
  chipAllowed,
  classifyCensorFlags,
  detectWidgetKind,
  forbiddenGapChip,
  formActuallyFilled,
  isContactLabel,
  nextApplyStage,
} from "../../supabase/functions/_shared/apply-censor"

describe("formActuallyFilled", () => {
  test("false when required or contact fields are empty", () => {
    expect(formActuallyFilled([
      { label: "First name", kind: "text", required: true, answered: false },
      { label: "Email", kind: "text", required: true, answered: true },
    ])).toBe(false)
    expect(formActuallyFilled([
      { label: "First name", kind: "text", required: false, answered: false },
      { label: "Why this role?", kind: "textarea", required: false, answered: true },
    ])).toBe(false)
  })

  test("true when all required/contact answered", () => {
    expect(formActuallyFilled([
      { label: "First name", kind: "text", required: true, answered: true },
      { label: "Email", kind: "text", required: true, answered: true },
      { label: "Phone", kind: "text", required: true, answered: true },
      { label: "Optional notes", kind: "textarea", required: false, answered: false },
    ])).toBe(true)
  })

  test("ignores non-consent checkboxes for Ready", () => {
    expect(formActuallyFilled([
      { label: "Email", kind: "text", required: true, answered: true },
      { label: "Newsletter", kind: "checkbox", required: false, answered: false },
    ])).toBe(true)
  })
})

describe("chipAllowed", () => {
  test("blocks Filled in by odds and Checking… while gaps remain", () => {
    expect(chipAllowed({
      stillEmptyGaps: true,
      formFilled: false,
      message: "Filled in by odds. Check everything, then send it yourself.",
      state: "done",
    })).toBe(false)
    expect(chipAllowed({
      stillEmptyGaps: true,
      formFilled: false,
      message: "Checking that the website kept your details and CV…",
      state: "busy",
    })).toBe(false)
  })

  test("allows Ready only when form is filled", () => {
    expect(chipAllowed({
      stillEmptyGaps: false,
      formFilled: true,
      message: "Filled in by odds. Check everything, then send it yourself.",
      state: "done",
    })).toBe(true)
  })
})

describe("nextApplyStage", () => {
  test("answers then scan then human for known gaps — never ready with gaps", () => {
    expect(nextApplyStage({
      formFilled: false,
      stillEmptyGaps: true,
      agentAnswersTried: false,
      agentScanTried: false,
      captcha: false,
      account: false,
    })).toBe("agent_answers")
    expect(nextApplyStage({
      formFilled: false,
      stillEmptyGaps: true,
      agentAnswersTried: true,
      agentScanTried: false,
      captcha: false,
      account: false,
    })).toBe("agent_scan")
    expect(nextApplyStage({
      formFilled: false,
      stillEmptyGaps: true,
      agentAnswersTried: true,
      agentScanTried: true,
      captcha: false,
      account: false,
    })).toBe("human")
    expect(nextApplyStage({
      formFilled: true,
      stillEmptyGaps: false,
      agentAnswersTried: true,
      agentScanTried: true,
      captcha: false,
      account: false,
    })).toBe("ready")
  })

  test("captcha/account are human-only", () => {
    expect(nextApplyStage({
      formFilled: false,
      stillEmptyGaps: true,
      agentAnswersTried: false,
      agentScanTried: false,
      captcha: true,
      account: false,
    })).toBe("human")
  })
})

describe("classifyCensorFlags", () => {
  test("empty_required and fill_failed from field states", () => {
    const flags = classifyCensorFlags({
      fields: [
        { label: "City", kind: "text", required: true, answered: false, fillFailed: true },
      ],
      hasForm: true,
      hasApplyCta: false,
      hasNext: true,
      captcha: false,
      account: false,
      stuckLoop: false,
      listingGone: false,
    })
    expect(flags).toContain("empty_required")
    expect(flags).toContain("fill_failed")
  })
})

describe("isContactLabel", () => {
  test("names email phone", () => {
    expect(isContactLabel("First name *")).toBe(true)
    expect(isContactLabel("E-mail")).toBe(true)
    expect(isContactLabel("Why this role?")).toBe(false)
  })
})

describe("detectWidgetKind", () => {
  test("typeahead from Lever location / combobox signatures", () => {
    expect(detectWidgetKind({ id: "location-input", tagName: "INPUT" })).toBe("typeahead")
    expect(detectWidgetKind({ className: "location-input", tagName: "INPUT" })).toBe("typeahead")
    expect(detectWidgetKind({ role: "combobox", tagName: "INPUT" })).toBe("typeahead")
    expect(detectWidgetKind({ kind: "combobox" })).toBe("typeahead")
  })

  test("card / choice / listbox / file / plain", () => {
    expect(detectWidgetKind({ inCustomQuestion: true, tagName: "INPUT" })).toBe("card")
    expect(detectWidgetKind({ kind: "choice" })).toBe("choice")
    expect(detectWidgetKind({ kind: "listbox" })).toBe("listbox")
    expect(detectWidgetKind({ kind: "file" })).toBe("file")
    expect(detectWidgetKind({ id: "first_name", tagName: "INPUT" })).toBe("plain")
  })
})

describe("forbiddenGapChip", () => {
  test("blocks Checking and Ready copy while gaps remain", () => {
    expect(forbiddenGapChip("Checking that the website kept your details and CV…", true)).toBe(true)
    expect(forbiddenGapChip("Filled in by odds. Check everything, then send it yourself.", true)).toBe(true)
    expect(forbiddenGapChip("Still filling Autofill answers — Broods already checked…", true)).toBe(false)
    expect(forbiddenGapChip("Checking that the website kept your details and CV…", false)).toBe(false)
  })
})

describe("nextApplyStage gapRounds invariant", () => {
  test("never ready while stillEmptyGaps even after both agent turns", () => {
    expect(nextApplyStage({
      formFilled: true,
      stillEmptyGaps: true,
      agentAnswersTried: true,
      agentScanTried: true,
      captcha: false,
      account: false,
    })).toBe("human")
  })
})
