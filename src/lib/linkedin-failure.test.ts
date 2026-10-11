import { describe, expect, test } from "bun:test"
import { failureIsOurs } from "@/lib/linkedin-failure"
import { rememberPendingCv, takePendingCv } from "@/lib/pending-cv"

describe("when reading LinkedIn fails", () => {
  test("a paused or silent reader is ours: the CV should lead", () => {
    expect(failureIsOurs("LinkedIn import is paused for now. Please try again later.")).toBe(true)
    expect(failureIsOurs("LinkedIn did not answer. Try again in a minute.")).toBe(true)
    expect(failureIsOurs("LinkedIn import is not switched on yet.")).toBe(true)
    expect(failureIsOurs("")).toBe(true)
    expect(failureIsOurs("Could not read that profile.")).toBe(true)
  })
  test("a private or missing profile is the person's to fix, in the message's own words", () => {
    expect(failureIsOurs("That profile could not be read. Is it public?")).toBe(false)
    expect(failureIsOurs("Up to 10 imports a day. Try again tomorrow, or sign in for more.")).toBe(false)
    expect(failureIsOurs("Paste the link to your profile, like https://www.linkedin.com/in/your-name")).toBe(false)
  })
})

describe("the CV uploaded on the way in", () => {
  test("is handed over once, and only once", () => {
    const file = new File(["cv"], "cv.txt")
    rememberPendingCv(file)
    expect(takePendingCv()).toBe(file)
    expect(takePendingCv()).toBeNull()
  })
})
