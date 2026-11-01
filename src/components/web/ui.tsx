import type { ButtonHTMLAttributes } from "react"
import { cn } from "cn"

/** The buttons, cards and pills the signed-in app is drawn with: flat colours, one orange, white cards on sand. */
const BASE = "inline-flex h-[42px] shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-[18px] text-sm font-extrabold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50"
const TONES = {
  primary: "bg-brand text-foreground hover:bg-[#E56E1E]",
  outline: "border-[1.5px] border-line bg-card text-foreground hover:border-foreground/40",
  dark: "bg-foreground text-background hover:bg-foreground/85",
} as const

export function WebButton({ tone = "outline", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof TONES }): React.JSX.Element {
  return <button type="button" {...props} className={cn(BASE, TONES[tone], className)} />
}

export function WebCard({ className, children, ...props }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" }): React.JSX.Element {
  return (
    <section {...props} className={cn("rounded-[18px] border-[1.5px] border-line bg-card p-5", className)}>
      {children}
    </section>
  )
}

/** A small rounded tag: a stage, a status, a fact. */
export function Pill({ className, children }: { className?: string; children: React.ReactNode }): React.JSX.Element {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold", className)}>{children}</span>
}

/** The same text field everywhere in the app. */
export const WEB_INPUT = "h-11 w-full rounded-[10px] border-[1.5px] border-line bg-card px-3.5 text-[0.95rem] text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none"
