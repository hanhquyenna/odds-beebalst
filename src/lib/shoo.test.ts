import { describe, expect, test } from "bun:test"
import { SHOO_CALLBACK_PATH, isShooCallback, tokenHashOf } from "@/lib/shoo-url"

describe("isShooCallback", () => {
  test("matches the callback path only", () => {
    expect(isShooCallback(SHOO_CALLBACK_PATH)).toBe(true)
    expect(isShooCallback(`${SHOO_CALLBACK_PATH}/`)).toBe(true)
    expect(isShooCallback("/")).toBe(false)
    expect(isShooCallback("/job/p123")).toBe(false)
    expect(isShooCallback("/auth/callbackx")).toBe(false)
  })
})

describe("tokenHashOf", () => {
  test("reads the one-time token from a magic link", () => {
    expect(tokenHashOf("https://site.example/?token_hash=abc123&type=magiclink")).toBe("abc123")
    expect(tokenHashOf("https://site.example/?type=magiclink&token=xyz")).toBe("xyz")
    expect(tokenHashOf("https://site.example/?token_hash=a%2Fb%3Dc")).toBe("a/b=c")
  })

  test("returns null when there is no token", () => {
    expect(tokenHashOf("")).toBeNull()
    expect(tokenHashOf("https://site.example/?type=magiclink")).toBeNull()
    expect(tokenHashOf("https://site.example/?token_hash=")).toBeNull()
  })
})
