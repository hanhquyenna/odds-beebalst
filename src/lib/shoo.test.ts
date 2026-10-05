import { describe, expect, test } from "bun:test"
import { SHOO_CALLBACK_PATH, isShooCallback, pictureOfIdToken, tokenHashOf } from "@/lib/shoo-url"

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

describe("pictureOfIdToken", () => {
  const tokenOf = (picture: unknown): string => `header.${btoa(JSON.stringify({ picture }))}.sig`

  test("reads the Google photo for display", () => {
    expect(pictureOfIdToken(tokenOf("https://photos.example/me.jpg"))).toBe("https://photos.example/me.jpg")
  })

  test("rejects anything but an https photo", () => {
    expect(pictureOfIdToken(tokenOf("http://photos.example/me.jpg"))).toBeNull()
    expect(pictureOfIdToken(tokenOf("javascript:alert(1)"))).toBeNull()
    expect(pictureOfIdToken(tokenOf(42))).toBeNull()
    expect(pictureOfIdToken(tokenOf(undefined))).toBeNull()
  })

  test("returns null when the token is not a token", () => {
    expect(pictureOfIdToken("")).toBeNull()
    expect(pictureOfIdToken("not-a-token")).toBeNull()
    expect(pictureOfIdToken("header./.sig")).toBeNull()
  })
})
