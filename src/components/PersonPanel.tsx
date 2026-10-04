import { useEffect } from "react"
import { createPortal } from "react-dom"
import { ExternalLinkIcon, XIcon } from "@/components/icons"
import { PersonAvatar } from "@/components/PersonAvatar"
import { buttonVariants } from "@/components/ui/button"
import type { PersonPosition } from "@/lib/suggest"

/** What the panel shows about someone: the same few facts whether they came from the search or from your list. */
export interface PanelPerson {
  name: string
  /** Their position now. */
  headline?: string
  company?: string
  place?: string
  photo?: string
  about?: string
  positions?: PersonPosition[]
  /** Their LinkedIn page. */
  url: string
  /** Facts we hold about them, shown as a Details card. Empty values are left out. */
  facts?: Array<{ label: string; value: string }>
}

function Card({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="rounded-xl border-[1.5px] bg-card p-5">
      <h2 className="mb-3 font-heading text-lg font-medium tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

/**
 * A person's profile as we read it from LinkedIn, in a panel from the right like the job panel, and laid out like your own profile
 * in Settings: a banner, their picture, name and position, then About and Experience. `action` sits beside Connect (Add, for a search result).
 */
export function PersonPanel({ person, action, editor, onClose }: { person: PanelPerson; action?: React.ReactNode; /** Fields to change what you hold about them, shown as an Edit card (your list only). */ editor?: React.ReactNode; onClose: () => void }): React.JSX.Element {

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)

    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  const line = [person.headline, person.company && person.headline ? `at ${person.company}` : person.company].filter(Boolean).join(" ")
  const facts = (person.facts ?? []).filter((f) => f.value.trim() !== "")

  return createPortal(
    <div className="fixed inset-0 z-40 text-foreground">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-[oklch(0.2_0.03_265_/_0.5)] animate-in fade-in duration-200" />
      <aside role="dialog" aria-modal="true" aria-label={`${person.name}'s profile`} className="absolute inset-y-0 right-0 flex w-full max-w-[40rem] flex-col overflow-y-auto bg-background shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b-[1.5px] bg-background px-4 py-3 sm:px-6">
          <span className="text-sm font-medium text-muted-foreground">Profile</span>
          <button type="button" aria-label="Close" onClick={onClose} className="flex size-9 cursor-pointer items-center justify-center rounded-full border-[1.5px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
            <XIcon className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-6">
          <section className="overflow-hidden rounded-xl border-[1.5px] bg-card">
            <div className="h-24 bg-[oklch(0.17_0.004_60)] sm:h-28" style={{ backgroundImage: "radial-gradient(60% 120% at 85% 0%, oklch(0.7 0.18 52 / 0.6), transparent 70%)" }} />
            <div className="px-5 pb-6">
              <div className="-mt-12 flex items-end gap-4">
                <PersonAvatar name={person.name} photo={person.photo} size="lg" />
              </div>
              <h1 className="mt-4 font-heading text-2xl font-medium tracking-tight">{person.name}</h1>
              {line ? <p className="mt-1 text-base">{line}</p> : null}
              {person.place ? <p className="mt-1 text-sm text-muted-foreground">{person.place}</p> : null}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <a href={person.url} target="_blank" rel="noreferrer" className={`${buttonVariants({ variant: "default", size: "sm" })} cursor-pointer`}>
                  Connect
                  <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                </a>
                {action}
              </div>
            </div>
          </section>

          {editor ? <Card title="Edit">{editor}</Card> : null}

          {person.about ? (
            <Card title="About">
              <p className="whitespace-pre-line text-sm leading-relaxed">{person.about}</p>
            </Card>
          ) : null}

          {person.positions && person.positions.length > 0 ? (
            <Card title="Experience">
              <ul className="flex flex-col gap-3">
                {person.positions.map((x) => (
                  <li key={`${x.title}|${x.company}`}>
                    <p className="font-medium">{x.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {x.company}
                      {x.since ? `${x.company ? " · " : ""}since ${x.since}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {facts.length > 0 ? (
            <Card title="Details">
              <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
                {facts.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="min-w-0 break-words">{/^https?:\/\//i.test(f.value) ? <a href={f.value} target="_blank" rel="noreferrer" className="underline underline-offset-4">{f.value}</a> : f.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </div>
      </aside>
    </div>,
    document.body,
  )
}
