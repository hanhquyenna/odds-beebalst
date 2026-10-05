import { useState } from "react"

/**
 * An open/closed switch that is kept in the browser, for panels with an X: close one and it stays closed on the next visit until it is
 * opened again from its link; someone who has never touched it gets `firstTime`. Storage can be blocked, and then it still works for the visit.
 */
export function useRemembered(key: string, firstTime: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState<boolean>(() => {
    const saved = readStored(key)

    return saved === "1" ? true : saved === "0" ? false : firstTime
  })

  return [
    open,
    (next) => {
      setOpen(next)
      store(key, next ? "1" : "0")
    },
  ]
}

/** One of a fixed set of choices (a sort, a tab) kept in the browser, so it is the same on the next visit. A stored value no longer offered falls back. */
export function useStoredChoice<T extends string>(key: string, choices: ReadonlyArray<T>, fallback: T): [T, (next: T) => void] {
  const [choice, setChoice] = useState<T>(() => pickChoice(readStored(key), choices, fallback))

  return [
    choice,
    (next) => {
      setChoice(next)
      store(key, next)
    },
  ]
}

/** A value kept in the browser, or null when there is none or storage is blocked. */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Keeps a value in the browser. When storage is blocked it is not kept, and the choice still works for this visit. */
export function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembered across visits.
  }
}

/** The stored value when it is one of the choices, else the fallback. */
function pickChoice<T extends string>(saved: string | null, choices: ReadonlyArray<T>, fallback: T): T {
  const found = choices.find((c) => c === saved)

  return found ?? fallback
}
