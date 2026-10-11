/**
 * What to tell someone after they tapped "Turn on notifications", for each answer the phone can give. The phone can allow it ("on"),
 * refuse it for good ("blocked": only its settings can undo that), or close its question without answering ("ask"). Null means it worked.
 * Without this the button seemed to do nothing when the phone said no.
 */
export function notifyAnswerMessage(answer: string, platform: "ios" | "android" | "desktop"): string | null {
  if (answer === "on") return null
  if (answer === "blocked") {
    return platform === "ios"
      ? "Notifications are blocked for odds. Turn them on in Settings, Notifications, odds, then try again."
      : platform === "android"
        ? "Notifications are blocked for odds. Turn them on in Settings, Apps, odds, Notifications, then try again."
        : "Notifications are blocked for odds. Allow them in your browser's site settings, then try again."
  }

  return "The question was closed without an answer. Tap the button again and choose Allow."
}
