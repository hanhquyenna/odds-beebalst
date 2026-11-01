import { describe, expect, test } from "bun:test"
import { CAVEAT, IF_IT_APPLIES, MIND_MAP, NOTE_LIMIT, SIDE, SOURCES, STAGES, TONE, type Block } from "@/lib/outreach-strategy"

const templates = (): Array<Extract<Block, { type: "template" }>> => STAGES.flatMap((s) => s.blocks).filter((b): b is Extract<Block, { type: "template" }> => b.type === "template")
const allText = (): string =>
  [
    ...STAGES.flatMap((s) => [s.title, s.summary, ...s.blocks.flatMap((b) => (b.type === "note" ? [b.text] : b.type === "list" ? [b.title, ...b.items] : b.type === "script" ? [b.title, ...b.rows.flatMap((r) => [r.at, r.line])] : b.type === "template" ? [b.title, b.text, b.note ?? ""] : [b.title, b.when, b.say ?? "", b.template ?? "", b.note ?? ""]))]),
    ...TONE,
    MIND_MAP.goal,
    ...[MIND_MAP.find, MIND_MAP.yes, MIND_MAP.no, MIND_MAP.reply, MIND_MAP.log].flatMap((n) => [n.title, n.caption, n.example ?? "", n.swap ?? "", ...(n.questions ?? [])]),
    ...MIND_MAP.stalls.flatMap((l) => [l.title, l.say, l.message ?? ""]),
    ...IF_IT_APPLIES.flatMap((x) => [x.when, x.say]),
    SIDE.left.big, SIDE.left.small, SIDE.right.big, SIDE.right.small,
    CAVEAT,
  ].join(" ")

describe("the stages", () => {
  test("six stages, in the order a person goes through them, the last for when it does not go to plan", () => {
    expect(STAGES.map((s) => s.title)).toEqual([
      "Find what you have in common",
      "Send the first message",
      "Prepare while you wait",
      "Run the 15 minutes",
      "Follow up, then ask for the referral",
      "If it does not go to plan",
    ])
  })
  test("every stage has a summary and something to read", () => {
    for (const s of STAGES) {
      expect(s.summary.length).toBeGreaterThan(10)
      expect(s.blocks.length).toBeGreaterThan(0)
    }
  })
})

describe("finding the angle", () => {
  const first = STAGES[0].blocks.filter((b): b is Extract<Block, { type: "way" }> => b.type === "way")
  test("the ways in are ranked, mutual connection first and nothing in common last", () => {
    expect(first[0].title).toContain("mutual connection")
    expect(first[first.length - 1].title).toContain("Nothing in common")
  })
  test("a mutual connection gets a blurb the contact can forward as it is", () => {
    expect(first[0].template).toContain("forward")
    expect(first[0].template).toContain("[mutual first name]")
  })
})

describe("the messages", () => {
  test("every connection note fits what LinkedIn allows a free account", () => {
    const notes = templates().filter((t) => t.connectionNote)
    expect(notes.length).toBeGreaterThanOrEqual(4)
    for (const t of notes) expect(t.text.length).toBeLessThanOrEqual(NOTE_LIMIT)
  })
  test("there is a first message for a mutual, the same school, the same country and nothing in common", () => {
    const titles = STAGES[1].blocks.filter((b): b is Extract<Block, { type: "template" }> => b.type === "template").map((t) => t.title)
    expect(titles.some((t) => /mutual/i.test(t))).toBe(true)
    expect(titles.some((t) => /university/i.test(t))).toBe(true)
    expect(titles.some((t) => /country/i.test(t))).toBe(true)
    expect(titles.some((t) => /nothing in common/i.test(t))).toBe(true)
  })
  test("no first message asks for a job or a referral", () => {
    for (const t of STAGES[1].blocks.filter((b): b is Extract<Block, { type: "template" }> => b.type === "template")) {
      expect(t.text.toLowerCase()).not.toMatch(/refer me|any opening|hire me|give me a job/)
    }
  })
  test("every message asks for 15 minutes where it is a first message", () => {
    for (const t of STAGES[1].blocks.filter((b): b is Extract<Block, { type: "template" }> => b.type === "template")) {
      expect(t.text).toMatch(/15[- ]minute/)
    }
  })
  test("the referral is asked in one place only, the stage after the chat", () => {
    const asking = STAGES.map((s, i) => ({ i, n: s.blocks.filter((b) => b.type === "template" && /willing to refer me|refer me/i.test(b.text)).length })).filter((x) => x.n > 0)
    expect(asking).toEqual([{ i: 4, n: 1 }])
  })
  test("the follow-up is one nudge, and then stop", () => {
    const text = STAGES[5].blocks.map((b) => (b.type === "way" ? (b.say ?? "") : "")).join(" ")
    expect(text.toLowerCase()).toContain("never a third")
  })
  test("every blank in a message is a [bracket] to fill in, never a stray placeholder", () => {
    for (const t of templates()) expect(t.text).not.toMatch(/\{\{|\}\}|TODO|XXX|lorem/i)
    for (const x of IF_IT_APPLIES) expect(x.say).not.toMatch(/\{\{|\}\}|TODO|XXX/)
  })
  test("brackets are balanced in every message", () => {
    for (const t of [...templates().map((x) => x.text), ...IF_IT_APPLIES.map((x) => x.say)]) {
      expect((t.match(/\[/g) ?? []).length).toBe((t.match(/\]/g) ?? []).length)
    }
  })
})

describe("the chat and the questions", () => {
  const script = STAGES[3].blocks.find((b): b is Extract<Block, { type: "script" }> => b.type === "script")!
  test("the script runs in time order and ends by 15 minutes", () => {
    const mins = script.rows.map((r) => Number(r.at.split(":")[0]) * 60 + Number(r.at.split(":")[1]))
    expect(mins).toEqual([...mins].sort((a, b) => a - b))
    expect(mins[mins.length - 1]).toBeLessThan(15 * 60)
    expect(script.rows[0].at).toBe("0:00")
  })
  test("the question bank covers the work, the first months, getting hired, them and working from abroad", () => {
    const lists = STAGES[2].blocks.filter((b): b is Extract<Block, { type: "list" }> => b.type === "list").map((l) => l.title)
    for (const topic of ["The work and the team", "The role and the first months", "Getting hired", "Them", "Working from abroad", "Do not ask"]) expect(lists).toContain(topic)
  })
  test("it asks what success looks like at 30, 60 and 90 days", () => {
    expect(allText()).toContain("30, 60 and 90 days")
  })
  test("it tells people not to ask for openings or for the referral too early", () => {
    expect(allText()).toContain("Are there any openings?")
    expect(allText()).toContain("For a referral, before you have talked")
  })
})

describe("for an international student", () => {
  test("it covers the internship agreement, the orientation year and sponsorship, each only where it applies", () => {
    const when = IF_IT_APPLIES.map((x) => x.when.toLowerCase())
    expect(when.some((w) => /internship/.test(w))).toBe(true)
    expect(when.some((w) => /last 3 years/.test(w))).toBe(true)
    expect(when.some((w) => /sponsor/.test(w))).toBe(true)
  })
  test("sponsorship is never the opening line", () => {
    const sponsor = IF_IT_APPLIES.find((x) => /sponsor/i.test(x.when))!
    expect(sponsor.say.toLowerCase()).toContain("do not open with it")
  })
})

describe("what it says about itself", () => {
  test("no em dashes anywhere in what people read", () => {
    expect(allText()).not.toContain("—")
  })
  test("the sources are real links, and the measured figure comes with its source and its limit", () => {
    expect(SOURCES.length).toBeGreaterThanOrEqual(8)
    for (const s of SOURCES) expect(s.url).toMatch(/^https:\/\//)
    expect(new Set(SOURCES.map((s) => s.url)).size).toBe(SOURCES.length)
    expect(CAVEAT).toContain("52%")
    expect(CAVEAT).toContain("35%")
    expect(CAVEAT).toContain("Ashby")
    expect(CAVEAT.toLowerCase()).toContain("not proof")
  })
  test("it states no number it cannot source", () => {
    const text = allText().replace(/\b(15|30|60|90|200|52|35|54|24|3|6|2|12|0|1|9|10|13|14)\b/g, "")
    // Digits left over would be a figure with no place in the writing.
    expect(text).not.toMatch(/\b\d{2,}%/)
  })
})

describe("the mind map", () => {
  test("it runs in the owner's order: find mutual things, then open with it or introduce yourself, then insights, then log it", () => {
    expect(MIND_MAP.find.title).toBe("Find mutual things")
    expect(MIND_MAP.yes.title).toContain("Open with it")
    expect(MIND_MAP.no.title).toContain("Introduce yourself")
    expect(MIND_MAP.reply.title).toContain("insights")
    expect(MIND_MAP.log.title).toContain("Log it in odds")
    expect([MIND_MAP.find, MIND_MAP.yes, MIND_MAP.no, MIND_MAP.reply, MIND_MAP.ask, MIND_MAP.log].map((n) => n.step)).toEqual(["1", "2", "2", "3", "4", "5"])
  })
  test("both ways in ask for the 15-minute coffee chat and nothing bigger", () => {
    for (const n of [MIND_MAP.yes, MIND_MAP.no]) {
      expect(n.example).toMatch(/15-minute online coffee chat/)
      expect(n.example!.toLowerCase()).not.toMatch(/refer|opening|hire me|job for me/)
    }
  })
  test("both examples fit a LinkedIn connection note", () => {
    for (const n of [MIND_MAP.yes, MIND_MAP.no]) expect(n.example!.length).toBeLessThanOrEqual(NOTE_LIMIT)
  })
  test("the examples balance their brackets and carry the job and the company", () => {
    for (const n of [MIND_MAP.yes, MIND_MAP.no]) {
      expect((n.example!.match(/\[/g) ?? []).length).toBe((n.example!.match(/\]/g) ?? []).length)
      expect(n.example).toContain("[job title]")
      expect(n.example).toContain("[company]")
    }
  })
  test("the mutual branch says how to change its first line for a mutual connection and for the same country", () => {
    expect(MIND_MAP.yes.swap).toContain("[mutual]")
    expect(MIND_MAP.yes.swap).toContain("[country]")
  })
  test("the words are short", () => {
    for (const n of [MIND_MAP.find, MIND_MAP.yes, MIND_MAP.no, MIND_MAP.reply, MIND_MAP.ask, MIND_MAP.refYes, MIND_MAP.refNo, MIND_MAP.log]) {
      expect(n.title.split(/\s+/).length).toBeLessThanOrEqual(7)
      expect(n.caption.split(/\s+/).length).toBeLessThanOrEqual(16)
    }
  })
  test("the goal in the middle is the coffee chat", () => {
    expect(MIND_MAP.goal).toBe("Get a 15-minute online coffee chat")
  })
  test("six questions to bring, the last asking who else to talk to", () => {
    expect(MIND_MAP.reply.questions).toHaveLength(6)
    expect(MIND_MAP.reply.questions![5]).toContain("Who else")
    for (const q of MIND_MAP.reply.questions!) expect(q.endsWith("?")).toBe(true)
  })
})

describe("the ask is one thing: a 15-minute online coffee chat", () => {
  test("no message offers a choice of a coffee or a call", () => {
    const text = allText().toLowerCase()
    expect(text).not.toMatch(/coffee or a call|call or coffee|a call or a coffee|a coffee or a call|coffee in \[city\]/)
  })
  test("every first message that asks for time asks for the same thing, online", () => {
    const first = [MIND_MAP.yes.example!, MIND_MAP.no.example!, ...STAGES[1].blocks.filter((b): b is Extract<Block, { type: "template" }> => b.type === "template").map((t) => t.text)]
    for (const t of first) expect(t).toMatch(/15-minute online coffee chat/)
  })
  test("every first message leaves an easy way out or a way to fit their schedule where it is not a connection note", () => {
    const longer = STAGES[1].blocks.filter((b): b is Extract<Block, { type: "template" }> => b.type === "template" && !b.connectionNote)
    expect(longer.length).toBeGreaterThanOrEqual(2)
    for (const t of longer) expect(t.text.toLowerCase()).toMatch(/no worries|no problem|suits you|fit your schedule/)
  })
  test("the referral ask is conditional and easy to decline", () => {
    const ask = STAGES[4].blocks.find((b): b is Extract<Block, { type: "template" }> => b.type === "template" && /refer me/.test(b.text))!
    expect(ask.text).toContain("If you feel comfortable")
    expect(ask.text.toLowerCase()).toContain("totally understand if not")
    expect(ask.text).toContain("job ID")
  })
  test("the email version has a short subject line, a bounded ask, a promise to follow up once, and a full name", () => {
    const email = STAGES[1].blocks.find((b): b is Extract<Block, { type: "template" }> => b.type === "template" && b.title.includes("email"))!
    const subject = email.text.split("\n")[0]
    expect(subject.startsWith("Subject:")).toBe(true)
    expect(subject.length).toBeLessThanOrEqual(80)
    expect(email.text).toContain("next two weeks")
    expect(email.text).toContain("follow up once")
    expect(email.text).toContain("[Full name]")
  })
})

describe("the two sides of the map", () => {
  test("they say it is a numbers game, turned into a system, with no number that has no source", () => {
    expect(SIDE.left.big).toBe("A numbers game")
    expect(SIDE.right.big).toBe("Turned into a system")
    expect(SIDE.left.small + SIDE.right.small).not.toMatch(/\d{2,}%|\b\d+x\b/)
  })
})

describe("when it stalls: the map", () => {
  const stalls = MIND_MAP.stalls
  test("it covers no reply, a no, no time and a rejection", () => {
    expect(stalls.map((l) => l.title)).toEqual(["No reply", "They say no", "No time", "Rejected"])
  })
  test("each has one short move, and a message to send", () => {
    for (const l of stalls) {
      expect(l.say.split(/\s+/).length).toBeLessThanOrEqual(12)
      expect(l.message).toBeTruthy()
      expect((l.message!.match(/\[/g) ?? []).length).toBe((l.message!.match(/\]/g) ?? []).length)
    }
  })
  test("no reply means one nudge, then someone else", () => {
    expect(stalls[0].say).toBe("One nudge after a week, then someone else.")
  })
  test("after a no, the move is to thank and ask who else, never to argue", () => {
    expect(stalls[1].say.toLowerCase()).toContain("thank")
    expect(stalls[1].message!.toLowerCase()).toContain("a name")
  })
  test("after a rejection, wait, thank, and stay in touch, without asking them to reconsider", () => {
    expect(stalls[3].say.toLowerCase()).toContain("wait")
    expect(stalls[3].message!.toLowerCase()).not.toMatch(/reconsider|please hire|change your mind/)
  })
})

describe("when it stalls: the playbook", () => {
  const stage = STAGES[5]
  const titles = stage.blocks.map((b) => (b.type === "way" ? b.title : ""))
  test("it has a move for every way it can go wrong", () => {
    for (const must of ["connection request", "do not reply", "say no", "too busy", "send your CV", "rejected", "closes", "out of date"]) {
      expect(titles.some((t) => t.toLowerCase().includes(must.toLowerCase()))).toBe(true)
    }
  })
  test("every case says when it happens and what to do, and none ends with a dead end", () => {
    for (const b of stage.blocks) {
      if (b.type !== "way") continue
      expect(b.when.length).toBeGreaterThan(5)
      expect(b.say!.length).toBeGreaterThan(10)
    }
  })
  test("a request that is not accepted is never sent twice", () => {
    const b = stage.blocks.find((x) => x.type === "way" && x.title.includes("connection request"))!
    expect(b.type === "way" && b.say).toContain("Do not send it twice")
  })
  test("a person with no referral still applies", () => {
    const b = STAGES[4].blocks.find((x) => x.type === "way" && x.title.includes("no, or do not answer"))!
    expect(b.type === "way" && b.say).toContain("apply anyway")
  })
  test("the first stage tells people to check the job first, so they do not write for a job they cannot take", () => {
    const first = STAGES[0].blocks.find((b) => b.type === "note" && b.text.includes("Check the job first"))
    expect(first).toBeTruthy()
  })
})

describe("the mindset: insights first, the referral is a bonus", () => {
  const stage = STAGES[4]
  test("the follow-up says plainly that a no still leaves the insights", () => {
    const note = stage.blocks.find((b) => b.type === "note")
    expect(note && note.type === "note" && note.text.toLowerCase()).toContain("you still learned")
    const no = stage.blocks.find((b) => b.type === "way" && /no, or do not answer/.test(b.title))
    expect(no).toBeTruthy()
  })
  test("the chat itself never asks for the referral", () => {
    const script = STAGES[3].blocks.find((b) => b.type === "script")
    expect(JSON.stringify(script)).not.toMatch(/refer me|willing to refer/i)
  })
})

describe("the map after the chat", () => {
  test("the referral is asked once, conditionally, and both answers end in a win", () => {
    expect(MIND_MAP.ask.example).toMatch(/If you feel comfortable/)
    expect(MIND_MAP.ask.example).toMatch(/Totally understand if not/)
    expect(MIND_MAP.refNo.caption.toLowerCase()).toContain("insights")
    expect(MIND_MAP.refYes.caption.toLowerCase()).toContain("apply")
  })
  test("the first messages still never ask for a referral", () => {
    for (const n of [MIND_MAP.yes, MIND_MAP.no]) expect(n.example!.toLowerCase()).not.toMatch(/refer/)
  })
})
