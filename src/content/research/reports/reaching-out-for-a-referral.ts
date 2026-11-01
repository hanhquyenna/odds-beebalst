import { IF_IT_APPLIES, NOTE_LIMIT, SOURCES, STAGES, TONE } from "../../../lib/outreach-strategy"
import type { Block, Report } from "../types"

/**
 * The full playbook as a paper. The steps and the words to send are the same data the "What should I message?" map uses
 * (lib/outreach-strategy.ts), turned into paper blocks here so the two never drift apart. The opening and the evidence section are written by hand.
 */
const stageBlocks = (i: number): Block[] =>
  STAGES[i].blocks.flatMap((b): Block[] => {
    switch (b.type) {
      case "note":
        return [{ type: "p", text: b.text }]
      case "list":
        return [
          { type: "h3", text: b.title },
          { type: "list", items: [...b.items] },
        ]
      case "template":
        return [{ type: "message", title: b.title, text: b.text, note: [b.note, b.connectionNote ? `Fits the ${NOTE_LIMIT}-character connection note (${b.text.length} characters).` : ""].filter(Boolean).join(" ") || undefined }]
      case "script":
        return [{ type: "table", caption: b.title, head: ["Minute", "What you do"], rows: b.rows.map((r) => [r.at, r.line]) }]
      case "way":
        return [
          { type: "h3", text: b.title },
          { type: "p", text: `${b.when}${b.say ? ` ${b.say}` : ""}` },
          ...(b.template ? [{ type: "message", title: "Words to send", text: b.template } as Block] : []),
          ...(b.note ? [{ type: "p", text: b.note } as Block] : []),
        ]
    }
  })

const report: Report = {
  slug: "reaching-out-for-a-referral",
  order: 9,
  title: "Reaching out for a referral: a step-by-step playbook for international students",
  subtitle: "How to find a person, write the first message, run a 15-minute online coffee chat and ask for a referral, with the words to send and what to do when it stalls.",
  category: "Careers",
  minutes: 14,
  headline: { figure: "52%", line: "of referred applications passed the first screen, against 35% for all" },
  feeds: "Careers",
  art: "door",
  abstract:
    "Most applications go through a form and are read by a stranger. A referral puts a name on the application, and for an international student with no local network it is the hardest thing to get and the easiest to ask for badly. This report is the playbook behind the What should I message panel in odds. It sets out five steps: finding what you share with a person at the company, the first message, preparing questions, a 15-minute chat for insights, and a follow-up that asks for a referral, plus what to do when it goes wrong, gives the words to send at each step, and says what to do when someone does not answer, says no or rejects you. It is practice, not measurement. It draws on university career services, interview guides, Dutch business-culture guides and official sources on internship agreements and the orientation year. The one measured figure, from an applicant-tracking vendor, is an aggregate and does not show that a referral causes a better outcome.",
  findings: [
    "Referred applications passed the first screen 52% of the time against 35% for all applications, in a sample of 54 million applications; this is an aggregate and does not show that a referral causes it [1].",
    "A LinkedIn connection note fits about 200 characters on a free account, so the first message is short and leads with what you share [2].",
    "The first ask is one bounded request, a 15-minute online coffee chat for insights, with a timeframe and an easy way to say no [3, 4].",
    "The referral is a separate, conditional ask in the follow-up, only if the chat went well; a no still leaves you the insights and you apply anyway [7].",
    "If a message gets no reply, send one nudge after about a week and no third message [9].",
    "A referral can be harder to add after you have applied, so ask how the process works before you apply [8].",
  ],
  sections: [
    {
      heading: "Introduction",
      blocks: [
        { type: "p", text: "An international student arriving in the Dutch job market usually has a degree, some skills and no network. Applying through the form is the default and it works for some, but it puts the application in front of a stranger with a stack of others. Talking to a person on the team first changes that: you learn what the team needs, they learn who you are, and if it goes well they can put your name forward." },
        { type: "p", text: "This report is written to be used. Each step has the words to send, ready to copy and fill in. Sections 3 to 8 follow the order you would work in: find what you share, send the first message, prepare your questions, run the chat, follow up and ask for the referral, and handle what goes wrong. Section 9 has the lines that apply only to international students, and Section 10 explains why odds treats all of this as a numbers game." },
        { type: "p", text: "The mindset is insights first. The first message asks for a conversation and nothing else. If they accept, you prepare questions, run the chat and gain insights. Only afterwards, in your follow-up, do you ask for a referral. If the answer is yes, good. If it is no, you still have what you learned about the team, and you apply anyway. Nothing in the chat is a pitch." },
        { type: "p", text: "The example messages ask for a 15-minute online coffee chat, not for a job. That is deliberate. Career services advise asking for advice and introductions rather than asking a contact to get you hired [3, 5]." },
      ],
    },
    {
      heading: "What is measured and what is advice",
      blocks: [
        { type: "p", text: "Almost everything here is practice. It comes from career centres at UC Berkeley, Harvard Law School and Brown University, from guides by Indeed and CareerOneStop, from referral and follow-up guidance by Casebasix, Froghire and Resume Worded, and from Dutch business-culture guides [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13]. These are recommendations from people who advise job seekers. They are not experiments, and none of them was tested on international students in the Netherlands." },
        { type: "p", text: "One figure is measured. Ashby, a recruiting-software company, reports that referred applications passed the first screen 52% of the time against 35% for all applications, across 54 million applications from its global customers [1]. It is an aggregate, not proof that a referral causes the difference: people who get referrals may also be the stronger applicants." },
        { type: "p", text: "Sales blogs publish reply rates for outreach messages, and the figures contradict each other, so none is used here. The advice below is therefore about what to say and in what order, not about a rate you should expect." },
      ],
    },
    { heading: STAGES[0].title, blocks: [{ type: "p", text: STAGES[0].summary }, ...stageBlocks(0)] },
    { heading: STAGES[1].title, blocks: [{ type: "p", text: STAGES[1].summary }, ...stageBlocks(1)] },
    { heading: STAGES[2].title, blocks: [{ type: "p", text: STAGES[2].summary }, ...stageBlocks(2)] },
    { heading: STAGES[3].title, blocks: [{ type: "p", text: STAGES[3].summary }, ...stageBlocks(3)] },
    { heading: STAGES[4].title, blocks: [{ type: "p", text: `${STAGES[4].summary} A conditional ask is easy to answer and easy to decline [7]. Whether a referral can still be added after you apply depends on the employer [8].` }, ...stageBlocks(4)] },
    { heading: STAGES[5].title, blocks: [{ type: "p", text: `${STAGES[5].summary} Follow-up guidance is consistent on one nudge [9].` }, ...stageBlocks(5)] },
    {
      heading: "For international students",
      blocks: [
        { type: "p", text: "Say these only where they are true. The internship agreement and the orientation year are the two things an employer most often does not know how to handle [14, 15]." },
        ...IF_IT_APPLIES.flatMap((x): Block[] => [{ type: "message", title: x.when, text: x.say }]),
        { type: "h3", text: "Tone" },
        { type: "list", items: [...TONE] },
        { type: "p", text: "Dutch workplaces are direct and informal, and a short, plain message reads better than a polished one [12, 13]." },
      ],
    },
    {
      heading: "A numbers game, turned into a system",
      blocks: [
        { type: "p", text: "Contact three to five people per job. Most will not answer, a few will, and one is enough. That is not a measured rate; it is the shape of the idea, and the reason the playbook ends each step with what to do next rather than with a hope." },
        { type: "p", text: "odds turns the steps into a system: find a person, write the message, ask, log it. In odds you press Add on the person and move them along the stages (To contact, Contacted, Connected, Replied, Chat booked, Met, Referral asked, Referred, and No reply, Said no or Passed me on when it ends), so the count is kept for you and no one is written to twice. A referral you log counts in your chance of an interview for that job." },
      ],
    },
  ],
  references: [
    "Ashby (2026). Talent Trends 2026: recruiting operations benchmarks. Ashby. Referral screen pass rate 52% against 35% for all applications, 54 million applications from global customers.",
    ...SOURCES.slice(0, 1).map((x) => `UC Berkeley career center. ${x.label}. ${x.url}`),
    ...SOURCES.slice(1, 2).map((x) => `Harvard Law School. ${x.label}. ${x.url}`),
    ...SOURCES.slice(2, 3).map((x) => `Brown University career services. ${x.label}. ${x.url}`),
    ...SOURCES.slice(3, 4).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(4, 5).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(5, 6).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(6, 7).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(7, 8).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(8, 9).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(9, 10).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(10, 11).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(11, 12).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(12, 13).map((x) => `${x.label}. ${x.url}`),
    ...SOURCES.slice(13, 14).map((x) => `${x.label}. ${x.url}`),
  ],
}

export default report
