import type { useData } from "@/lib/data"
import type { Application, Posting } from "@/lib/types"

/** Fired by moveJob to ask for an offer to be confirmed; OfferGate answers it. */
export const OFFER_EVENT = "odds:confirm-offer"

export interface Pending {
  post: Posting
  fit: string
}

/** Asks for the offer to be confirmed, then celebrates it and offers to share it. */
export function askAboutOffer(post: Posting, fit: string): void {
  window.dispatchEvent(new CustomEvent<Pending>(OFFER_EVENT, { detail: { post, fit } }))
}

/** The steps a job goes through, left to right. "Saved" is a job you kept but have not applied to. */
export type Step = "saved" | Application["stage"]

/**
 * Every status a job can have, in the order of a search. The board groups the three ways a job ends (turned down, never answered, you pulled out) in one column;
 * here they are separate, because "no reply" and "turned down" are different outcomes and both count as an application that did not reach an interview.
 */
export const STEPS: ReadonlyArray<{ step: Step; title: string }> = [
  { step: "saved", title: "Saved" },
  { step: "applied", title: "Applied" },
  { step: "interview", title: "Interview" },
  { step: "offer", title: "Offer" },
  { step: "rejected", title: "Rejected" },
  { step: "no_reply", title: "No reply" },
  { step: "withdrawn", title: "Withdrew" },
]

/** The steps where the search for this job has ended without an offer. */
export const ENDED: ReadonlySet<Step> = new Set<Step>(["rejected", "no_reply", "withdrawn"])

type Data = ReturnType<typeof useData>

/** The step a job is at: its application's stage, or Saved when there is none. */
export function stepOf(data: Data, post: Posting): Step {
  const app = data.applications.find((a) => a.posting_id === post.id)

  return app ? (app.stage === "hired" ? "offer" : app.stage) : "saved"
}

/**
 * Moves a job to a step, from the board or the table. Moving a saved job to any
 * step after Saved logs an application; moving it back to Saved takes the
 * application away.
 */
export async function moveJob(data: Data, post: Posting, to: Step, fit: string, confirmed = false): Promise<void> {
  const app = data.applications.find((a) => a.posting_id === post.id)
  if ((app ? (app.stage === "hired" ? "offer" : app.stage) : "saved") === to) {
    return
  }
  if (to === "offer" && !confirmed) {
    askAboutOffer(post, fit)

    return
  }
  if (to === "saved") {
    if (app) {
      await data.removeApplication(app.id)
    }
    data.setSaved(post.id, true)

    return
  }
  if (app) {
    await data.changeStage(app.id, to)

    return
  }
  await data.logApplication(post, fit, to)
}
