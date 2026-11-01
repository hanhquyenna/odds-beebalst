import { describe, expect, test } from "bun:test"
import { CACHE_VERSION, readCache, unwrap, wrap, writeCache } from "@/lib/cache"

describe("kept answers", () => {
  test("a kept answer reads back with its stamp and data", () => {
    const kept = unwrap<number[]>(wrap("12:2026-10-05", [1, 2]))
    expect(kept?.stamp).toBe("12:2026-10-05")
    expect(kept?.data).toEqual([1, 2])
    expect(kept?.version).toBe(CACHE_VERSION)
  })
  test("an entry from another version, or not an entry at all, reads as nothing", () => {
    expect(unwrap({ ...wrap("s", [1]), version: CACHE_VERSION - 1 })).toBeNull()
    expect(unwrap({ stamp: "s", at: 1 })).toBeNull()
    expect(unwrap("[1,2]")).toBeNull()
    expect(unwrap(undefined)).toBeNull()
  })
  test("without IndexedDB, reading finds nothing and writing does not throw", async () => {
    await writeCache("pool", "s", [1])
    expect(await readCache("pool")).toBeNull()
  })
})
