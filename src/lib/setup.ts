import { useCallback, useEffect, useState } from "react"
import { personalFromProfile } from "../../supabase/functions/_shared/application-personal"
import { loadAnswers, type AnswerValues } from "@/lib/application-answers"
import { useData } from "@/lib/data"
import { useDocumentStore } from "@/lib/documents"
import { useExtensionPresent } from "@/lib/extension-connect"
import { SETUP_QUESTIONS, type SetupQuestion } from "@/lib/setup-questions"

/** Fired when answers are saved anywhere, so everything that counts them reads again. */
export const ANSWERS_SAVED = "odds:answers-saved"

export type StepKey = "cv" | "details" | "answers" | "extension" | "first"

export interface SetupStep {
  key: StepKey
  title: string
  done: boolean
}

export interface Setup {
  steps: SetupStep[]
  done: number
  total: number
  complete: boolean
  /** The questions still without an answer. */
  missing: SetupQuestion[]
  /** Read the answers again (after saving some). */
  reload: () => void
  ready: boolean
}

/** How far the person is from applying in one click: a CV, their details, the answers every form asks, the extension, and a first application. */
export function useSetup(): Setup {
  const data = useData()
  const store = useDocumentStore()
  const extension = useExtensionPresent()
  const userId = data.session?.user.id ?? null
  const [answers, setAnswers] = useState<AnswerValues | null>(null)
  const [round, setRound] = useState<number>(0)
  const reload = useCallback(() => setRound((n) => n + 1), [])

  useEffect(() => {
    if (!userId) return
    let live = true
    void loadAnswers().then((v) => live && setAnswers(v))

    return () => {
      live = false
    }
  }, [userId, round])
  useEffect(() => {
    window.addEventListener(ANSWERS_SAVED, reload)

    return () => window.removeEventListener(ANSWERS_SAVED, reload)
  }, [reload])

  const mine = answers ?? {}
  const inferred = personalFromProfile(data.profile, data.session?.user.email)
  const has = (key: string): boolean => Boolean((mine[key] ?? inferred[key] ?? "").trim())
  const missing = SETUP_QUESTIONS.filter((q) => !has(q.key))
  const steps: SetupStep[] = [
    { key: "cv", title: "CV", done: store.docs.some((d) => d.kind === "cv") || data.profile.cv.trim().length >= 20 },
    { key: "details", title: "Details", done: ["first_name", "last_name", "email", "phone"].every(has) },
    { key: "answers", title: "Answers", done: answers !== null && missing.length === 0 },
    { key: "extension", title: "Chrome", done: extension === "yes" },
    { key: "first", title: "First application", done: data.applications.length > 0 },
  ]
  const done = steps.filter((s) => s.done).length

  return { steps, done, total: steps.length, complete: done === steps.length, missing, reload, ready: answers !== null }
}
