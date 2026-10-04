import { createContext, useContext, useEffect, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons"
import { FIRST_SCREEN, HIRED, MENTAL_MODEL, MINUTE_STEPS, SLIDES, behindRange, callbackBand, coldBarShare, firstScreenLift, hiredMultiple, pctText } from "@/lib/why-deck"

/**
 * The slides mix three backgrounds, white, black and orange, and most are split in two halves: the words on a white or black half where they are
 * easiest to read, the chart on the colour half. Narrow (a phone held upright) the halves stack, words on top. Which layout shows is decided by the
 * panel's own width (container queries), so an iPad, an iPhone held either way and a narrow webview all get the right one.
 */
type Tone = "white" | "black" | "orange"

const TONE: Record<Tone, { bg: string; muted: string; figure: string; mark: string; base: string; accent: string; line: string; dash: string }> = {
  white: { bg: "bg-card text-foreground", muted: "text-muted-foreground", figure: "text-brand", mark: "bg-brand/30 text-foreground", base: "bg-foreground/30", accent: "bg-brand", line: "border-foreground/70", dash: "border-brand" },
  black: { bg: "bg-foreground text-background", muted: "text-background/70", figure: "text-brand", mark: "bg-brand text-foreground", base: "bg-background/35", accent: "bg-brand", line: "border-background/80", dash: "border-brand" },
  orange: { bg: "bg-brand text-foreground", muted: "text-foreground/75", figure: "text-foreground", mark: "bg-white/85 text-foreground", base: "bg-foreground/85", accent: "bg-white", line: "border-foreground", dash: "border-white" },
}

const ToneContext = createContext<Tone>("white")
const useTone = (): (typeof TONE)[Tone] => TONE[useContext(ToneContext)]

/** One half of a slide, with its own background; everything inside reads its colours from it. The first half keeps clear of the close button when the halves are stacked. */
function Half({ tone, children }: { tone: Tone; children: React.ReactNode }): React.JSX.Element {
  return (
    <ToneContext.Provider value={tone}>
      <div className={`flex min-h-0 flex-col justify-center gap-4 px-6 py-5 first:pr-16 @xl:px-8 @xl:py-6 @xl:first:pr-8 @3xl:px-10 @3xl:first:pr-10 ${TONE[tone].bg}`}>{children}</div>
    </ToneContext.Provider>
  )
}

const reducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** False for the first frame, then true: the bars draw from empty to their length once the slide is on screen. It is the only movement on a slide. */
function useDrawn(): boolean {
  const [drawn, setDrawn] = useState<boolean>(reducedMotion)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true))

    return () => cancelAnimationFrame(frame)
  }, [])

  return drawn
}

/** A number that counts up to its value once its slide is on screen. */
function Count({ to, decimals = 0, prefix = "", suffix = "" }: { to: number; decimals?: number; prefix?: string; suffix?: string }): React.JSX.Element {
  const [value, setValue] = useState<number>(reducedMotion() ? to : 0)
  // Reduced motion starts at the value, so a later value still shows without an effect writing it.
  if (reducedMotion() && value !== to) {
    setValue(to)
  }

  useEffect(() => {
    if (reducedMotion()) {
      return
    }
    let frame = 0
    const start = performance.now() + 150
    const tick = (now: number): void => {
      const t = Math.min(1, Math.max(0, (now - start) / 900))
      setValue(to * (1 - (1 - t) ** 3))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [to])

  return (
    <span>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  )
}

/** One word of a sentence stressed with a highlighter mark, in the colour that shows on this half's background. */
function Hi({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <mark className={`rounded-sm px-1 [box-decoration-break:clone] ${useTone().mark}`}>{children}</mark>
}

/** A line of text with `word` stressed. If the word is not in the text the text is shown plain. */
function Stress({ text, word }: { text: string; word: string }): React.JSX.Element {
  const at = text.indexOf(word)
  if (at < 0) return <>{text}</>

  return (
    <>
      {text.slice(0, at)}
      <Hi>{word}</Hi>
      {text.slice(at + word.length)}
    </>
  )
}

/** The big number and what it says, the first thing on a slide with a figure. */
function Headline({ figure, children }: { figure: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <p className={`text-5xl font-semibold leading-none tracking-tight @xl:text-6xl @3xl:text-8xl ${useTone().figure}`}>{figure}</p>
      <p className="mt-3 max-w-[24ch] text-lg font-medium leading-snug text-balance @xl:text-xl @3xl:text-2xl">{children}</p>
    </div>
  )
}

interface Column {
  label: string
  /** What is written on top of the column. */
  value: string
  /** Its height as a fraction of the chart, 0 to 1. */
  share: number
  /** The accent column, or the baseline one in the quiet colour. */
  tone: "accent" | "base"
  /** A range: the column is solid up to this fraction and a dashed outline carries it on up to `share`. */
  solidTo?: number
}

/**
 * A column chart drawn to scale: the heights are the figures, on one thick baseline. Each number rides on top of its own column. A range is a
 * solid column with a dashed cut-line box on top for the part that is only known as a range. The columns grow when the slide opens.
 */
function Columns({ columns, heightClass = "h-32 @xl:h-36 @3xl:h-56" }: { columns: ReadonlyArray<Column>; heightClass?: string }): React.JSX.Element {
  const drawn = useDrawn()
  const t = useTone()
  const move = "transition-[height,bottom] duration-1000 ease-out motion-reduce:transition-none"
  const pct = (x: number): string => (drawn ? `${Math.max(1, x * 100)}%` : "0%")
  const cols = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }

  return (
    <div>
      {/* The room above the tallest column is for its number. */}
      <div className={`grid items-end gap-x-3 border-b-4 pt-9 @3xl:pt-14 ${t.line}`} style={cols}>
        {columns.map((c, i) => {
          const delay = `${200 + i * 150}ms`
          const solid = c.solidTo ?? c.share

          return (
            <div key={c.label} className="flex justify-center">
              <div className={`relative w-4/5 max-w-28 ${heightClass}`}>
                <div className={`absolute inset-x-0 bottom-0 rounded-t-xl ${move} ${c.tone === "accent" ? t.accent : t.base}`} style={{ height: pct(solid), transitionDelay: delay }} />
                {c.solidTo !== undefined ? (
                  <div className={`absolute inset-x-0 rounded-t-xl border-2 border-b-0 border-dashed ${move} ${t.dash}`} style={{ bottom: pct(c.solidTo), height: drawn ? `${(c.share - c.solidTo) * 100}%` : "0%", transitionDelay: delay }} />
                ) : null}
                <span
                  className={`absolute -inset-x-3 pb-2 text-center text-base font-semibold leading-none whitespace-nowrap @xl:text-xl @3xl:text-3xl ${move}`}
                  style={{ bottom: pct(c.share), transitionDelay: delay }}
                >
                  {c.value}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="grid gap-x-3" style={cols}>
        {columns.map((c) => (
          <p key={c.label} className="px-0.5 pt-2.5 text-center text-sm font-medium leading-snug @3xl:text-base">
            {c.label}
          </p>
        ))}
      </div>
    </div>
  )
}

/** The way a referral reaches you: you, one person inside, the job. The middle step is the one this tool helps with. */
function Path(): React.JSX.Element {
  const drawn = useDrawn()

  return (
    <div role="img" aria-label="you, then a person who works there, then the job" className="relative grid grid-cols-3 items-start text-center">
      <span aria-hidden="true" className="absolute left-[16.66%] right-[16.66%] top-[0.4375rem] h-px bg-current opacity-25" />
      <span aria-hidden="true" className="absolute left-[16.66%] top-[0.375rem] h-0.5 rounded-full bg-brand transition-[width] duration-1000 ease-out motion-reduce:transition-none" style={{ width: drawn ? "33.33%" : "0%", transitionDelay: "400ms" }} />
      {[
        { label: "you", dot: "bg-brand" },
        { label: "someone who works there", dot: "bg-foreground ring-2 ring-brand" },
        { label: "the job", dot: "bg-background" },
      ].map((s) => (
        <div key={s.label} className="relative flex flex-col items-center gap-2.5 px-1">
          <span className={`size-3.5 rounded-full ${s.dot}`} />
          <span className="text-sm leading-snug opacity-75">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

function Title(): React.JSX.Element {
  return (
    <>
      <Half tone="black">
        <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight @xl:text-4xl @3xl:text-6xl">
          your network
          <br />
          <span className="text-brand">is your net worth.</span>
        </h2>
        <p className={`text-base @3xl:text-xl ${TONE.black.muted}`}>
          for <Hi>international students</Hi> in the Netherlands.
        </p>
      </Half>
      <Half tone="black">
        <Path />
      </Half>
    </>
  )
}

function Hired(): React.JSX.Element {
  return (
    <>
      <Half tone="white">
        <Headline figure={<Count to={hiredMultiple()} decimals={1} suffix="×" />}>
          more likely to be <Hi>hired</Hi> when someone refers you.
        </Headline>
      </Half>
      <Half tone="orange">
        <Columns
          columns={[
            { label: "applied on their own", value: `1 in ${HIRED.coldOneIn}`, share: coldBarShare(), tone: "base" },
            { label: "referred", value: `1 in ${HIRED.referredOneIn}`, share: 1, tone: "accent" },
          ]}
        />
      </Half>
    </>
  )
}

function Screen(): React.JSX.Element {
  const lift = Math.round(firstScreenLift() * 100)

  return (
    <>
      <Half tone="white">
        <Headline figure={<Count to={lift} prefix="+" suffix="%" />}>
          more applications get <Hi>past the first check</Hi> when someone refers you.
        </Headline>
      </Half>
      <Half tone="black">
        <Columns
          columns={[
            { label: "any application", value: pctText(FIRST_SCREEN.all), share: FIRST_SCREEN.all, tone: "base" },
            { label: "referred", value: pctText(FIRST_SCREEN.referred), share: FIRST_SCREEN.referred, tone: "accent" },
          ]}
        />
      </Half>
    </>
  )
}

/** The Dutch tests: the same CV gets fewer replies with a foreign background. Drawn on a scale where the Dutch applicant is 100; the dashed box is the range. */
function Abroad(): React.JSX.Element {
  const behind = behindRange()
  const band = callbackBand()

  return (
    <>
      <Half tone="black">
        <Headline figure={`${behind.from}–${behind.to}%`}>
          fewer replies if you have a <Hi>foreign background</Hi>, with the same CV.
        </Headline>
      </Half>
      <Half tone="orange">
        <Columns
          columns={[
            { label: "Dutch applicant", value: "100", share: 1, tone: "base" },
            { label: "foreign background", value: `${band.from} to ${band.to}`, share: band.to / 100, solidTo: band.from / 100, tone: "accent" },
          ]}
        />
      </Half>
    </>
  )
}

function Minute(): React.JSX.Element {
  const last = MINUTE_STEPS.length - 1

  return (
    <>
      <Half tone="white">
        <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight @xl:text-4xl @3xl:text-6xl">
          it costs you
          <br />
          <span className="text-brand">one minute.</span>
        </h2>
      </Half>
      <Half tone="black">
        <ol className="relative flex flex-col gap-2.5 @3xl:gap-4">
          <span aria-hidden="true" className="absolute bottom-3.5 left-3.5 top-3.5 w-px -translate-x-1/2 bg-background/25 @3xl:left-4" />
          {MINUTE_STEPS.map((step, i) => (
            <li key={step} className="relative flex items-center gap-3 @3xl:gap-4">
              <span className={`z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums @3xl:size-8 @3xl:text-sm ${i === last ? "bg-brand text-foreground" : "bg-background text-foreground"}`}>{i + 1}</span>
              <span className="text-base font-medium leading-snug @3xl:text-lg">{i === 2 ? <Stress text={step} word="perfect message" /> : step}</span>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-1.5">
          <p className={`text-sm ${TONE.black.muted}`}>and you get</p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
            <p className="flex items-center justify-center rounded-xl border-[1.5px] border-background/40 px-3 py-2.5 text-center text-sm font-semibold leading-tight @3xl:text-base">job insights</p>
            <span className={`flex items-center text-sm ${TONE.black.muted}`}>or</span>
            <p className="flex items-center justify-center rounded-xl bg-brand px-3 py-2.5 text-center text-sm font-semibold leading-tight text-foreground @3xl:text-base">a referral</p>
          </div>
        </div>
      </Half>
    </>
  )
}

function Model(): React.JSX.Element {
  return (
    <>
      <Half tone="black">
        <h2 className="text-4xl font-semibold leading-[1.05] tracking-tight @xl:text-4xl @3xl:text-6xl">
          <span className={TONE.black.muted}>from a number</span>
          <br />
          <span className="text-brand">to a name.</span>
        </h2>
      </Half>
      <Half tone="black">
        <ul className="flex flex-col">
          {MENTAL_MODEL.map((m) => (
            <li key={m.title} className="flex flex-col gap-0.5 border-t-[1.5px] border-background/25 py-2.5 last:border-b-[1.5px] @3xl:py-4">
              <p className="text-base font-semibold leading-snug @3xl:text-lg">
                <Stress text={m.title} word={m.stress} />
              </p>
              <p className={`text-sm @3xl:text-base ${TONE.black.muted}`}>{m.line}</p>
            </li>
          ))}
        </ul>
      </Half>
    </>
  )
}

/**
 * The short deck behind "why does it even matter?", which is the whole panel (its box and close button belong to the panel around it). Every slide is
 * the same size, like a presentation: portrait on a narrow panel, 16:9 with two halves on a wide one. One slide at a time; arrow keys, the buttons,
 * the dots or a swipe move between them. Buttons and dots are at least 44px to tap. The wording of the messages lives in "What should I message?".
 */
export function WhyDeck(): React.JSX.Element {
  const [at, setAt] = useState<number>(0)
  const [touch, setTouch] = useState<{ x: number; y: number } | null>(null)
  const last = SLIDES.length - 1
  const go = (n: number): void => setAt(Math.min(last, Math.max(0, n)))
  const slide = SLIDES[at].id

  return (
    <div
      role="group"
      aria-roledescription="slide deck"
      aria-label="Why reaching out matters"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === " ") {
          e.preventDefault()
          go(at + 1)
        } else if (e.key === "ArrowLeft") {
          e.preventDefault()
          go(at - 1)
        }
      }}
      onTouchStart={(e) => setTouch({ x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (touch) {
          const dx = e.changedTouches[0].clientX - touch.x
          const dy = e.changedTouches[0].clientY - touch.y
          // A sideways swipe moves the slide; an up or down drag is the page scrolling and is left alone.
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at + (dx < 0 ? 1 : -1))
        }
        setTouch(null)
      }}
      className="bg-card outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
    >
      <div className="@container">
        <div key={slide} aria-live="polite" className="grid aspect-[4/5] w-full select-none grid-rows-[auto_1fr] overflow-hidden [touch-action:pan-y] @xl:aspect-video @xl:grid-cols-2 @xl:grid-rows-1">
          {slide === "title" ? <Title /> : slide === "hired" ? <Hired /> : slide === "screen" ? <Screen /> : slide === "abroad" ? <Abroad /> : slide === "minute" ? <Minute /> : <Model />}
        </div>
      </div>
      <div className="flex items-center justify-between border-t-[1.5px] px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center" role="tablist" aria-label="Slides">
          {SLIDES.map((s, i) => (
            <button key={s.id} type="button" role="tab" aria-selected={i === at} aria-label={`Slide ${i + 1}`} onClick={() => go(i)} className="group flex h-11 min-w-6 cursor-pointer items-center justify-center px-1 sm:min-w-8 sm:px-1.5">
              <span className={`h-2 rounded-full transition-all duration-300 ${i === at ? "w-7 bg-brand" : "w-2 bg-border group-hover:bg-muted-foreground"}`} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous slide" disabled={at === 0} onClick={() => go(at - 1)} className="flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:cursor-default disabled:opacity-30">
            <ChevronLeftIcon className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next slide" disabled={at === last} onClick={() => go(at + 1)} className="flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] bg-foreground text-background transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-30">
            <ChevronRightIcon className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
