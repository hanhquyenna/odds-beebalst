import { describe, expect, test } from "bun:test"
import { notifyAnswerMessage } from "@/lib/notify-answer"

describe("what to say after Turn on notifications", () => {
  test("nothing when it worked", () => {
    expect(notifyAnswerMessage("on", "ios")).toBeNull()
  })
  test("blocked says where to undo it, for the phone in your hand", () => {
    expect(notifyAnswerMessage("blocked", "ios")).toContain("Settings, Notifications, odds")
    expect(notifyAnswerMessage("blocked", "android")).toContain("Settings, Apps, odds")
    expect(notifyAnswerMessage("blocked", "desktop")).toContain("browser's site settings")
  })
  test("a question closed without an answer says to tap again", () => {
    expect(notifyAnswerMessage("ask", "ios")).toContain("Tap the button again")
  })
})
