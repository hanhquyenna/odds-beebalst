import { beforeEach, describe, expect, it } from "bun:test"
import {
  EXTENSION_ONBOARD_DONE_KEY,
  extensionOnboardDone,
  markExtensionOnboardDone,
  shouldShowExtensionOnboard,
} from "@/lib/extension-onboard"

const store = new Map<string, string>()

describe("extension onboard", () => {
  beforeEach(() => {
    store.clear()
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string): string | null => store.get(k) ?? null,
        setItem: (k: string, v: string): void => { store.set(k, v) },
        removeItem: (k: string): void => { store.delete(k) },
        clear: (): void => store.clear(),
      },
    })
  })

  it("stays hidden while looking and after Connect", () => {
    expect(shouldShowExtensionOnboard({ present: "looking", linked: false })).toBe(false)
    expect(shouldShowExtensionOnboard({ present: "no", linked: false })).toBe(true)
    expect(shouldShowExtensionOnboard({ present: "yes", linked: true })).toBe(false)
  })

  it("dismisses after markExtensionOnboardDone", () => {
    expect(extensionOnboardDone()).toBe(false)
    markExtensionOnboardDone()
    expect(store.get(EXTENSION_ONBOARD_DONE_KEY)).toBe("1")
    expect(extensionOnboardDone()).toBe(true)
    expect(shouldShowExtensionOnboard({ present: "no", linked: false })).toBe(false)
  })
})
