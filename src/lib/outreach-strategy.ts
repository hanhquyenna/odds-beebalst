/**
 * The playbook for writing to someone at a company you applied to, stage by stage, with the words to send. This is practice, not
 * measurement: it comes from university career services (Berkeley, Harvard Law), Indeed's and CareerOneStop's interview guides, referral-ask
 * guidance, Dutch business-culture guides and the official sources on internship agreements and the orientation year.
 *
 * How the wording is built, from those sources: lead with what you share; say which job and why them; make one bounded ask (15 minutes,
 * online) with a timeframe; give an easy way to say no; say you will follow up, and do; never ask a contact to get you a job, ask for advice
 * and introductions; in a thank-you, name one thing they said and what you will do with it. The sales-blog "reply rate" figures for
 * outreach timing contradict each other, so none is used. The one measured figure is shown with its source and its limit in CAVEAT.
 */

/** The longest note LinkedIn lets a free account attach to a connection request (Berkeley career center). Check it on your own screen. */
export const NOTE_LIMIT = 200

/**
 * The whole plan on one picture, drawn as a mind map: the goal in the middle, four steps, the second one splitting in two, and what to
 * do when it stalls. Short and sharp; the long version is STAGES. Both first messages already ask for the 15-minute online coffee chat and
 * fit a LinkedIn connection note.
 */
export interface MapNode {
  step: string
  title: string
  caption: string
  example?: string
  /** Under the example: how to change its first line for the other ways in. */
  swap?: string
  /** Questions to bring, shown behind "see questions". */
  questions?: ReadonlyArray<string>
}

/** One thing that can go wrong and the one move for it, with the words where words help. */
export interface StallLeaf {
  title: string
  say: string
  message?: string
}

export const MIND_MAP: { goal: string; find: MapNode; yes: MapNode; no: MapNode; reply: MapNode; ask: MapNode; refYes: MapNode; refNo: MapNode; log: MapNode; stalls: ReadonlyArray<StallLeaf> } = {
  goal: "Get a 15-minute online coffee chat",
  find: { step: "1", title: "Find mutual things", caption: "A mutual connection, the same school, the same country." },
  yes: {
    step: "2",
    title: "Found one? Open with it",
    caption: "Say it in the first line, then ask for the 15-minute online coffee chat.",
    example: "Hi [first name], fellow [university] student here. I'm applying for [job title] at [company]. Could we have a 15-minute online coffee chat about the team? Happy to fit your schedule.",
    swap: "A mutual connection: \"[mutual] suggested I reach out.\" The same country: \"Also from [country].\"",
  },
  no: {
    step: "2",
    title: "Found none? Introduce yourself",
    caption: "Who you are, the job, then the 15-minute online coffee chat.",
    example: "Hi [first name], I'm a [programme] student at [university] applying for [job title] at [company]. Could we have a 15-minute online coffee chat about the team? No problem if you're busy.",
  },
  reply: {
    step: "3",
    title: "They replied? Ask for insights",
    caption: "Come with six questions. Ask, don't pitch.",
    questions: [
      "What does a typical week look like on the team?",
      "What does success look like at 30, 60 and 90 days?",
      "What makes someone stand out when you hire for this team?",
      "What do applicants often get wrong?",
      "How did you end up on this team?",
      "Who else would you suggest I talk to?",
    ],
  },
  ask: {
    step: "4",
    title: "Follow up. Ask for a referral",
    caption: "Thank them first. Then ask once, and make it easy to say no.",
    example: "Thanks for your time today, [first name]. I've decided to apply for [job title] ([link], job ID [ID]). If you feel comfortable after our chat, would you be willing to refer me? Totally understand if not, and thanks either way.",
  },
  refYes: { step: "", title: "Yes", caption: "Apply the same day with the job ID. Tell them it is in." },
  refNo: { step: "", title: "No, or silence", caption: "Still a win: you have the insights. Thank them once, apply anyway." },
  log: { step: "5", title: "Log it in odds", caption: "Press Add on them. Move them along: Contacted, Replied, Met, Referral asked." },
  stalls: [
    {
      title: "No reply",
      say: "One nudge after a week, then someone else.",
      message: "Hi [first name], a quick nudge in case my message got buried. I'd still value a 15-minute online chat about [team], if you have time. No worries if not. Thanks either way.",
    },
    {
      title: "They say no",
      say: "Thank them. Ask who else to talk to.",
      message: "Thanks for letting me know, [first name]. If someone on the team would be open to a short chat, I'd be glad of a name. Either way, thank you for replying.",
    },
    {
      title: "No time",
      say: "Offer three questions by message.",
      message: "Understood, [first name]. Could I send three short questions by message instead? Answer whenever it suits you, and thanks for considering it.",
    },
    {
      title: "Rejected",
      say: "Wait a day or two. Thank them. Stay in touch.",
      message: "Thanks again for your help, [first name]. I didn't get [job title], but your advice on [what they said] was useful. If another role on the team comes up, I'd love to hear. I'll keep following the team's work.",
    },
  ],
}

export type Block =
  /** One way in, and when to use it. */
  | { type: "way"; title: string; when: string; say?: string; template?: string; note?: string }
  | { type: "list"; title: string; items: ReadonlyArray<string> }
  | { type: "template"; title: string; text: string; note?: string; connectionNote?: boolean }
  | { type: "script"; title: string; rows: ReadonlyArray<{ at: string; line: string }> }
  | { type: "note"; text: string }

export interface Stage {
  title: string
  /** One line under the title. */
  summary: string
  blocks: ReadonlyArray<Block>
}

export const STAGES: ReadonlyArray<Stage> = [
  {
    title: "Find what you have in common",
    summary: "A mutual connection is best. Then same school, same country, same past. Otherwise go direct.",
    blocks: [
      { type: "note", text: "Check the job first. If odds says it also asks for something you do not have (a student, or Dutch, say), think about whether you can still apply. Otherwise you ask people for help with a job you cannot take." },
      { type: "note", text: "Two minutes on their profile first: what they do now, how long they have been there, where they studied, one post or project you can mention. Skip anyone who is a director or head." },
      {
        type: "way",
        title: "1. A mutual connection",
        when: "Best. You and the person both know someone, shown on their profile as a 2nd-degree link. Ask your contact for a short introduction instead of writing cold.",
        say: "Message your contact, and give them a blurb they can forward as it is.",
        template:
          "Hi [mutual first name], I'm applying for [job title] at [company] and saw you know [first name]. Would you be happy to introduce me? Here is a blurb you can forward: \"[your name] is a [programme] student at [university], applying to [team] at [company]. They'd value a 15-minute online coffee chat to hear about the team. CV: [link].\" No pressure if you'd rather not.",
      },
      {
        type: "way",
        title: "2. Same university or programme",
        when: "No mutual, but they studied where you study. On your school's LinkedIn page press \"See alumni\", then filter by company. Recent graduates answer most easily.",
        note: "Open the message with it, in the first line.",
      },
      {
        type: "way",
        title: "3. Same country or language",
        when: "They are from your country or speak your language and built a career at this company. They know what you are up against.",
        note: "One line is enough: \"Also from [country].\"",
      },
      {
        type: "way",
        title: "4. Same past employer, student association, course, event or interest",
        when: "A thing you share, or something they posted or built that you can name in one line.",
      },
      { type: "way", title: "5. Nothing in common", when: "Do not force one. Send the direct introduction in the next stage. It is a normal thing to do." },
      { type: "note", text: "Contact three to five people per job, one at a time or in parallel. Not all of them will answer, and that says nothing about you." },
    ],
  },
  {
    title: "Send the first message",
    summary: "One short note, matched to what you found. It asks for 15 minutes online, not for a job.",
    blocks: [
      { type: "note", text: "On LinkedIn, send a connection request with a note. A note fits about 200 characters on a free account, so it is the short version. When they accept, send the longer one." },
      {
        type: "template",
        title: "With a mutual connection (they agreed to introduce you)",
        text: "Hi [first name], [mutual] suggested I reach out. I'm a [programme] student at [university] applying to [team] at [company]. Could we have a 15-minute online coffee chat about the team?",
        connectionNote: true,
      },
      {
        type: "template",
        title: "Same university",
        text: "Hi [first name], fellow [university] student here (class of [year]). I'm applying for [job title] at [company]. Could we have a 15-minute online coffee chat about the team?",
        connectionNote: true,
      },
      {
        type: "template",
        title: "Same country",
        text: "Hi [first name], also from [country] and studying [programme] in [city]. I'm applying for [job title] at [company]. Could we have a 15-minute online coffee chat about the team?",
        connectionNote: true,
      },
      {
        type: "template",
        title: "Nothing in common: the direct introduction",
        text: "Hi [first name], I'm a [programme] student at [university] applying for [job title] at [company]. Could we have a 15-minute online coffee chat about the team? No problem if you're busy.",
        connectionNote: true,
      },
      {
        type: "template",
        title: "After they accept: the longer message",
        text: "Thanks for connecting, [first name]. I've applied for [job title] ([link]). I'd love to hear what the team works on and what you look for in someone starting out. Could we have a 15-minute online coffee chat in the next two weeks? Any slot that suits you works for me, and no worries if you can't.",
        note: "Name the exact job, say what you want to learn, give a timeframe, leave an easy way out. It is the whole message.",
      },
      {
        type: "template",
        title: "If you have their email instead",
        text: "Subject: [University] student applying to [job title]: 15 minutes?\n\nHi [first name],\n\nI'm a [programme] student at [university] and I've applied for [job title] at [company]. [One line on what you share, or what you admire in their work.] Could we have a 15-minute online coffee chat in the next two weeks? I'd like to hear what the team works on and what you look for in someone starting out. I know you're busy, so any slot that suits you is fine, and no worries if not.\n\nI'll follow up once next week in case this got buried.\n\nThanks,\n[Full name]\n[LinkedIn link]",
        note: "A short subject line, a bounded ask, and your full name. Say you will follow up once, and do.",
      },
    ],
  },
  {
    title: "Prepare while you wait",
    summary: "Twenty minutes: the job, the person, your 30-second story and six questions.",
    blocks: [
      {
        type: "list",
        title: "Before they reply",
        items: [
          "Read the job posting. Pick the three things it asks for most, and write one line of proof for each from your own work or study.",
          "Read their profile again: their path, how long they have been there, anything they wrote. Read the company's news from the last three months.",
          "Write your 30-second story: who you are, what you studied, one thing you did, why this team. Say it out loud once.",
          "Choose six questions from the list below, most important first. Add two spare ones, because some people talk easily and some need prompting.",
        ],
      },
      {
        type: "list",
        title: "The work and the team",
        items: ["What does a typical week look like on the team?", "What are you working on right now?", "Which skills do you use most that the job description does not mention?"],
      },
      {
        type: "list",
        title: "The role and the first months",
        items: ["What does success look like at 30, 60 and 90 days?", "What would you do in the first 90 days to make a strong start?"],
      },
      {
        type: "list",
        title: "Getting hired",
        items: ["What makes someone stand out when you hire for this team?", "What do applicants often get wrong?", "What happens after I apply, and how long does it usually take?"],
      },
      {
        type: "list",
        title: "Them",
        items: ["How did you end up on this team?", "What do you wish you had known at the start?"],
      },
      {
        type: "list",
        title: "Working from abroad",
        items: ["Does the team hire people from abroad?", "Is the company a recognised sponsor, and do you know how it handled the orientation year or an internship agreement for others?"],
      },
      {
        type: "list",
        title: "Do not ask",
        items: ["\"Are there any openings?\"", "Anything the careers page already answers", "Salary, in the first chat", "For a referral, before you have talked"],
      },
    ],
  },
  {
    title: "Run the 15 minutes",
    summary: "Online, on time, listen more than you talk, and end when you said you would.",
    blocks: [
      { type: "note", text: "Confirm the time and the video link the day before. Join exactly on time, camera on if they are comfortable with it. Take notes, and tell them you are taking notes." },
      {
        type: "script",
        title: "Minute by minute",
        rows: [
          { at: "0:00", line: "Thank them. Say what you want from the 15 minutes in one sentence." },
          { at: "1:00", line: "Your 30-second story. Stop at 30 seconds." },
          { at: "3:00", line: "Your questions. Follow up on what they say before moving on. Aim for nine minutes of them talking." },
          { at: "12:00", line: "\"Is there anything I should have asked?\"" },
          { at: "13:00", line: "\"I'm applying for [job title]. Is there anything you would tell me to emphasise?\"" },
          { at: "14:00", line: "\"Who else would you suggest I talk to?\" Then thank them. Stop at 15 unless they carry on." },
        ],
      },
      { type: "note", text: "Do not ask for the referral in the chat unless they bring it up. You ask in the message after, once you know it went well." },
    ],
  },
  {
    title: "Follow up, then ask for the referral",
    summary: "The chat was for insights. The referral is a separate, smaller ask in your follow-up, within 24 hours.",
    blocks: [
      { type: "note", text: "The mindset: you went for insights, and you have them. A referral is a bonus. If the answer is yes, good. If it is no, or you hear nothing, you still learned what the team wants, and you apply anyway." },
      {
        type: "template",
        title: "The thank-you that opens the follow-up",
        text: "Thanks for your time today, [first name]. The most useful thing was [one specific thing they said], and I'm going to [what you will do with it]. If anyone else comes to mind who'd be open to a chat, I'd be glad of an introduction.",
        note: "Be specific. One line from the conversation is worth more than three lines of thanks.",
      },
      {
        type: "template",
        title: "The referral ask, if the chat went well",
        text: "I've decided to apply for [job title] ([link], job ID [ID]). If you feel comfortable after our chat, would you be willing to refer me? Here is a short blurb you can paste: \"[your name], [programme] at [university]. [One proof point.] [One proof point.] CV: [link].\" Totally understand if not, and thanks either way.",
        note: "A conditional ask is easy to answer, and easy to decline. Ask how the process works before you apply if you can: some employers cannot add a referral after an application exists.",
      },
      {
        type: "list",
        title: "What to give them so it is easy",
        items: ["The job link and the job ID", "A three-line blurb they can paste", "Your CV, as a link", "A thank-you, whatever they decide"],
      },
      { type: "way", title: "If they say yes", when: "They agree to refer you.", say: "Thank them, apply the same day with the job ID, and tell them when it is submitted. Send a short update when you hear back." },
      {
        type: "way",
        title: "If they say no, or do not answer",
        when: "Many companies have rules, or they do not know you well enough yet. Silence after the ask is also an answer.",
        say: "Thank them once. Do not ask again. Put what you learned into your CV and your application, apply anyway, and use the insights in your next chat.",
        template: "Thanks for the honest answer, [first name], and for your time. Your advice on [what they said] was useful and I'm using it in my application. I'll let you know how it goes.",
      },
      {
        type: "template",
        title: "Later: an update, one or two weeks on",
        text: "Hi [first name], a quick update: I applied for [job title] and took your advice to [what you did]. Thanks again. I'll let you know how it goes.",
        note: "Share a result, an article, or an introduction. It keeps the contact for the next job too.",
      },
      { type: "note", text: "In odds, press Add on the person, and move them along through the stages, from To contact to Referred, or No reply, Said no and Passed me on when it ends. A referral you log counts in your chance for that job." },
    ],
  },
  {
    title: "If it does not go to plan",
    summary: "No reply, a no, no time, a rejection: one move for each, so you are never stuck.",
    blocks: [
      { type: "way", title: "Your connection request is not accepted", when: "Nothing after a week.", say: "Leave it. Do not send it twice. Write to another person at the same company." },
      {
        type: "way",
        title: "They do not reply to your message",
        when: "Five to seven days have passed.", say: "Send one nudge. After that, move on to the next person. Never a third message.",
        template: "Hi [first name], a quick nudge in case my message got buried. I'd still value a 15-minute online chat about [team], if you have time. No worries if not. Thanks either way.",
      },
      {
        type: "way",
        title: "They say no, or it is not their area",
        when: "A polite no is still an answer.",
        say: "Thank them, and ask who would be the right person. Do not argue or explain yourself.",
        template: "Thanks for letting me know, [first name]. If someone on the team would be open to a short chat, I'd be glad of a name. Either way, thank you for replying.",
      },
      {
        type: "way",
        title: "They are too busy for a call",
        when: "They answer, but cannot do 15 minutes.",
        say: "Offer three written questions, or a later date. A short written answer is still a win.",
        template: "Understood, [first name]. Could I send three short questions by message instead? Answer whenever it suits you, and thanks for considering it.",
      },
      { type: "way", title: "They ask you to just apply, or to send your CV", when: "It is a normal reply, and a good one.", say: "Send it, apply the same day, and ask who to flag your application to." },
      {
        type: "way",
        title: "You applied and you were rejected",
        when: "Wait a day or two before you write.",
        say: "Thank them and stay in touch. Give, do not ask: later, share an article or a result. Do not ask them to reconsider.",
        template: "Thanks again for your help, [first name]. I didn't get [job title], but your advice on [what they said] was useful. If another role on the team comes up, I'd love to hear. I'll keep following the team's work.",
      },
      { type: "way", title: "The job closes, or the posting disappears", when: "In odds the job shows as closed.", say: "Tell them what you learned and ask about other roles on the team. The conversation is still worth having." },
      { type: "way", title: "Their profile is out of date, or they left", when: "A bounced message, or a new company on their page.", say: "Skip them and pick someone else on the team." },
    ],
  },
]

/** The tone. Dutch workplaces are direct and informal. */
export const TONE: ReadonlyArray<string> = [
  "First name, from the first line",
  "Short and direct. Say what you want",
  "Name a timeframe, and leave an easy way to say no",
  "No flattery, no exaggeration. Modest reads better",
  "English is fine. Do not apologise for it",
  "Proofread, and sign emails with your full name",
]

export interface IfItApplies {
  when: string
  say: string
}

/** Lines for an international student, to add where they are true. */
export const IF_IT_APPLIES: ReadonlyArray<IfItApplies> = [
  {
    when: "You want an internship and you are a student",
    say: "My university, [university], will sign the internship agreement. A non-EU student needs it to work without a work permit during an internship, and I stay enrolled throughout.",
  },
  {
    when: "You finished your degree in the last 3 years",
    say: "I can start without a work permit, through the orientation year.",
  },
  {
    when: "You will need the company to sponsor you later",
    say: "Do not open with it. Ask near the end of the chat: \"Does the team hire from abroad, and is [company] a recognised sponsor?\" The job page in odds shows whether it is on the IND list.",
  },
]

export interface Source {
  label: string
  url: string
}

export const SOURCES: ReadonlyArray<Source> = [
  { label: "UC Berkeley career center: the 5-point message (the 200-character note, leading with what you share)", url: "https://career.berkeley.edu/prepare-for-success/networking/5-point-message/" },
  { label: "Harvard Law School career office: sample networking emails and thank-you notes", url: "https://hls.harvard.edu/bernard-koteen-office-of-public-interest-advising/opia-job-search-toolkit/sample-networking-emails-and-thank-you-notes/" },
  { label: "Brown University career services: asking for an informational interview", url: "https://masterscareers.brown.edu/blog/2026/04/16/networking-what-to-say-when-asking-for-an-informational-interview/" },
  { label: "Indeed: a complete guide to informational interviews", url: "https://www.indeed.com/career-advice/interviewing/informational-interview-guide" },
  { label: "CareerOneStop: thank-you notes", url: "https://www.careeronestop.org/JobSearch/Interview/thank-you-notes.aspx" },
  { label: "Casebasix: how to ask for a referral after a coffee chat", url: "https://www.casebasix.com/pages/ask-referral-after-coffee-chat" },
  { label: "Froghire: can an employee still refer you after you applied?", url: "https://www.froghire.ai/blog/referral-after-applying-can-employee-still-refer-you" },
  { label: "Casebasix: following up on a networking message with no response", url: "https://www.casebasix.com/pages/follow-up-networking-no-response" },
  { label: "Resume Worded: how to respond to a rejection email", url: "https://resumeworded.com/networking-email-templates/misc/how-to-respond-to-a-rejection-email" },
  { label: "Evaboot: how to find alumni on LinkedIn", url: "https://evaboot.com/blog/how-to-find-alumni-on-linkedin" },
  { label: "Global Business Culture: the Netherlands", url: "https://www.globalbusinessculture.com/countries/resources/country-profiles/netherlands-business-culture/" },
  { label: "Leiden International Centre: Dutch business culture", url: "https://www.leideninternationalcentre.nl/get-advice/blogs/dutch-business-culture-your-guide-before-your-first-day-in-your-new-office" },
  { label: "Nuffic: standard internship agreement for non-EU/EEA students", url: "https://www.nuffic.nl/sites/default/files/2020-08/standard-internship-agreement-for-non-eu-eea-students.pdf" },
  { label: "government.nl: orientation year for highly educated persons", url: "https://www.government.nl/topics/immigration-to-the-netherlands/options-for-entrepreneurs-and-employees-from-abroad/orientation-year-highly-educated-persons" },
]

/** The honest line under the panel. */
export const CAVEAT =
  "This is advice from career services, interview guides and Dutch business guides, not a measured result. The one measured figure: referred applications passed the first screen 52% of the time against 35% for all (Ashby 2026, 54 million applications), and that is an aggregate, not proof a referral causes it."

/** The line on the left and right of the map: the idea behind the plan. */
export const SIDE = {
  left: { big: "A numbers game", small: "Three to five people per job. Most will not answer. A few will, and one is enough." },
  right: { big: "Turned into a system", small: "Find, write, ask, log. odds keeps the count, so nothing is lost and nothing is sent twice." },
}
