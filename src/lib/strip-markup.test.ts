import { describe, expect, test } from "bun:test"
import { stripMarkup } from "@/lib/format"

describe("stripMarkup", () => {
  test("reads accented letters written as HTML names, so a Dutch posting is not full of &iuml;", () => {
    expect(stripMarkup("ge&iuml;nteresseerd in caf&eacute; &amp; r&ocirc;le")).toBe("geïnteresseerd in café & rôle")
    expect(stripMarkup("M&uuml;nchen, Fa&ccedil;ade, Se&ntilde;or, &euro;750")).toBe("München, Façade, Señor, €750")
  })
  test("leaves a name it does not know as it was written", () => {
    expect(stripMarkup("a &zzzz; b")).toBe("a &zzzz; b")
  })
})
