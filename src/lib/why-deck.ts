/**
 * The numbers on the "why does it even matter?" slides, each with its source, and the sums that turn them into what a slide says.
 * Nothing on a slide is typed in by hand: change a figure here and the slide, the label and the test follow.
 *
 * What these show and do not show: referred applications do better than the rest, in large data sets from hiring software. They are aggregates.
 * Referred people may simply be stronger candidates, and these are not Dutch studies of international students. The slide says so.
 */
export interface Source {
  label: string
  url?: string
}

/** Share of applications that pass the first screen: all applications, and referred ones. Ashby 2026, 54 million applications. */
export const FIRST_SCREEN = {
  all: 0.35,
  referred: 0.52,
  source: { label: "Ashby 2026, 54 million applications" } as Source,
}

/** How many applicants it takes to hire one: from direct applications, and from referrals. Lever, over 4 million candidates, about 1,000 employers, 2015 to 2016, US data. */
export const HIRED = {
  coldOneIn: 152,
  referredOneIn: 16,
  source: { label: "Lever hiring study, 4 million candidates, 2015 to 2016, US data", url: "https://www.shrm.org/topics-tools/news/talent-acquisition/lever-study-shows-1-100-candidates-hired" } as Source,
}

/** Callbacks a non-native applicant gets, against a native one with the same CV: 0.76 across all jobs, 0.93 for graduate-level jobs. Dutch field experiments. */
export const START_BEHIND = {
  low: 0.76,
  high: 0.93,
  source: { label: "Thijssen et al. 2021 and SCP 2010, Dutch field experiments" } as Source,
}

export const hiredShare = (oneIn: number): number => 1 / oneIn

/** "+49%": how much higher the referred first-screen rate is. */
export const firstScreenLift = (): number => FIRST_SCREEN.referred / FIRST_SCREEN.all - 1

/** 9.5: how many times as often a referred candidate is hired. */
export const hiredMultiple = (): number => HIRED.coldOneIn / HIRED.referredOneIn

/** How long the cold bar is next to the referred one when both are drawn on the same scale: 16 / 152, about a tenth. */
export const coldBarShare = (): number => HIRED.referredOneIn / HIRED.coldOneIn

/** The callback ruler, 0 to 100 where a native applicant with the same CV is 100: the non-native range sits between these two marks. */
export const callbackBand = (): { from: number; to: number } => ({ from: Math.round(START_BEHIND.low * 100), to: Math.round(START_BEHIND.high * 100) })

/** "7% to 24% fewer callbacks". */
export const behindRange = (): { from: number; to: number } => ({ from: Math.round((1 - START_BEHIND.high) * 100), to: Math.round((1 - START_BEHIND.low) * 100) })

/** A share as a short percentage: whole numbers from 10%, one decimal below. */
export const pctText = (x: number): string => `${x * 100 >= 10 ? Math.round(x * 100) : (Math.round(x * 1000) / 10).toString()}%`

export interface Slide {
  id: "title" | "hired" | "screen" | "abroad" | "minute" | "model"
}

/** One idea a slide: the title, the 9.5x, the +49%, the 7% to 24% for applicants with a foreign background, the minute, the mental model. */
export const SLIDES: ReadonlyArray<Slide> = [{ id: "title" }, { id: "hired" }, { id: "screen" }, { id: "abroad" }, { id: "minute" }, { id: "model" }]

/** The steps of "it costs you one minute", in order. Nothing here is a step that does not exist in the app. */
export const MINUTE_STEPS: ReadonlyArray<string> = ["pick your job", "we find the people", "take inspiration for a perfect message", "send"]

/** `stress` is the one word of the title the slide highlights. */
export const MENTAL_MODEL: ReadonlyArray<{ title: string; line: string; stress: string }> = [
  { title: "ask for information, not a favour", line: "advice is easy to give. a job is not.", stress: "information" },
  { title: "make the ask small", line: "15 minutes is easy to say yes to.", stress: "small" },
  { title: "every step pays on its own", line: "a reply, a chat, a referral: each is worth something.", stress: "pays" },
]
