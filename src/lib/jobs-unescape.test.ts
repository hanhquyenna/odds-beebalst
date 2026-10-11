import { describe, expect, it } from "bun:test"
import { unescapeHtml } from "@/lib/jobs"

describe("unescapeHtml", () => {
  it("turns the entities some boards send back into characters", () => {
    expect(unescapeHtml("Santander Corporate &amp; Investment Banking")).toBe("Santander Corporate & Investment Banking")
    expect(unescapeHtml("Kao EMEA &amp; Americas &quot;x&quot; &#39;y&#39;")).toBe("Kao EMEA & Americas \"x\" 'y'")
    expect(unescapeHtml("Plain")).toBe("Plain")
  })
})
