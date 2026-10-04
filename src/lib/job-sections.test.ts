import { describe, expect, test } from "bun:test"
import { parsePosting } from "@/lib/job-sections"

const keys = (text: string, employer = "Acme"): string[] => parsePosting(text, employer).sections.map((s) => s.key)

describe("parsePosting", () => {
  test("each section keeps the employer's own heading, and sections come out in one familiar order", () => {
    const text = [
      "About The Role\n\nAs a Technician you will do maintenance.",
      "What You’ll Do\n\n- Conduct inspections and diagnose problems.\n- Assist with installation of equipment.\n- Review work orders and estimate time.",
      "What You Bring\n\n- A technical diploma\n- Good English",
      "What We Offer\n\n- Flexible hours\n- Training budget",
      "How to apply\n\nSend your CV.",
    ].join("\n\n")
    const out = parsePosting(text, "CBRE")
    expect(out.sections.map((s) => s.title)).toEqual(["About The Role", "What You’ll Do", "What You Bring", "What We Offer", "How to apply"])
    expect(out.structured).toBe(true)
  })
  test("employers' own words for the same thing end up in the same place", () => {
    for (const h of ["Responsibilities", "Key Responsibilities", "Tricks of the trade", "Your assignment", "What you will do", "Je taken"]) {
      expect(keys(`${h}\n- one one one one\n- two two two two\n`)).toEqual(["duties"])
    }
    for (const h of ["Qualifications", "Your profile", "Your superpowers", "Who you are", "About you", "Requirements", "Nice to have"]) {
      expect(keys(`${h}\n- one one one one\n- two two two two\n`)).toEqual(["requirements"])
    }
    for (const h of ["What we offer", "We offer you", "Benefits", "Picnic perks", "Attractive package", "Wat bieden wij"]) {
      expect(keys(`${h}\n- one one one one\n- two two two two\n`, "Picnic")).toEqual(["offer"])
    }
  })
  test("sections come out in the standard order whatever order the posting wrote them", () => {
    const text = "What we offer\n- a\n- b\n\nQualifications\n- c\n- d\n\nResponsibilities\n- e\n- f\n\nJob Description\nThe role is great and you will love it a lot."
    expect(keys(text)).toEqual(["about", "duties", "requirements", "offer"])
  })
  test("the employer's own section about itself is kept apart from the role", () => {
    const text = "About Picnic\n\nPicnic is an online supermarket that delivers groceries to homes across several countries.\n\nAbout the role\n\nYou will analyse data."
    const out = parsePosting(text, "Picnic")
    expect(out.sections.map((s) => s.key)).toEqual(["about", "company"])
  })
  test("nothing is lost: repeated paragraphs and emoji stay in the text, page buttons are kept apart", () => {
    const para = "As a Business Analyst Working Student at Picnic you will be at the forefront of innovation, tackling complex challenges."
    const text = `${para}\n\nIn a nutshell\n\n${para}\n\n💪 Save job\nApply now\nWhat we offer\n- Lunch\n- Coffee`
    const parsed = parsePosting(text, "Picnic")
    const all = JSON.stringify(parsed.sections)
    expect(parsed.page).toContain("Apply now")
    expect(all.split("forefront").length - 1).toBe(2)
    expect(all).toContain("Save job")
    expect(all).toContain("💪")
    expect(all).toContain("Lunch")
  })
  test("lines broken in the middle of a sentence are joined", () => {
    const out = parsePosting("At Picnic, as a\nBusiness Analyst\n, you’ll be at the forefront of innovation.\n", "Picnic")
    expect(out.sections[0].blocks[0]).toEqual({ kind: "p", text: "At Picnic, as a Business Analyst, you’ll be at the forefront of innovation." })
  })
  test("a run of short lines without bullets becomes a list", () => {
    const out = parsePosting("What we offer\nFresh lunch, coffee, and snacks\nFree hotel nights\nTraining budget\nSocial events", "X")
    expect(out.sections[0].blocks[0]).toEqual({ kind: "ul", items: ["Fresh lunch, coffee, and snacks", "Free hotel nights", "Training budget", "Social events"] })
  })
  test("emoji at the start of a heading or line is removed", () => {
    expect(keys("💪 Stay healthy\n- gym\n- psychologist\n")).toEqual(["offer"])
  })
  test("facts stated as label and value are gathered at the top", () => {
    const out = parsePosting("Duration: 6 months\nType: Internship (non-thesis)\nHours per week: 38\nAbout the role\nYou will help the team with many things every day.", "X")
    expect(out.details).toEqual([
      { label: "Duration", value: "6 months" },
      { label: "Type", value: "Internship (non-thesis)" },
      { label: "Hours per week", value: "38" },
    ])
  })
  test("a posting with no headings is plain paragraphs, not structured", () => {
    const out = parsePosting("We are hiring an intern to help the team.\n\nYou will learn a lot and work with great people every day.", "X")
    expect(out.structured).toBe(false)
    expect(out.sections).toHaveLength(1)
    expect(out.sections[0].blocks).toHaveLength(2)
  })
  test("an unknown heading of the employer's own stays, under its own name", () => {
    const out = parsePosting("About the role\n\nYou will help.\n\nMake a difference\n\nWe care about the planet and our people a great deal.\n\nWhat we offer\n- a\n- b", "X")
    expect(out.sections.map((s) => s.title)).toEqual(["About the role", "What we offer", "Make a difference"])
  })
  test("a heading that is page clutter on one site but is the whole posting on another keeps its text", () => {
    const long = "You have talent. Ready to make impact. We know that making an impact starts with that first contact with like-minded people. ".repeat(6)
    const out = parsePosting(`Let’s talk talent\n${long}`, "Mploy")
    expect(JSON.stringify(out.sections)).toContain("like-minded")
    // Whatever the page added is kept too, apart from the text.
    expect(parsePosting("About the role\nYou will help the team every day with many things.\nSign up for our newsletter\nGet jobs by email", "X").page).toContain("Sign up for our newsletter")
  })
  test("the heading shown is the employer's own, unchanged, and nothing is added beside it", () => {
    const out = parsePosting("Tricks of the trade\n- one one one one\n- two two two two\n\nPicnic Perks:\n- a\n- b", "X")
    expect(out.sections.map((s) => s.title)).toEqual(["Tricks of the trade", "Picnic Perks"])
    expect(JSON.stringify(out)).not.toContain("posted as")
    expect(JSON.stringify(out)).not.toContain("What you'll do")
  })
  test("two headings of the same kind stay two sections, each with its own heading", () => {
    const out = parsePosting("Your tasks\n- one one one one\n- two two two two\n\nResponsibilities\n- three three three\n- four four four", "X")
    expect(out.sections.map((s) => s.title)).toEqual(["Your tasks", "Responsibilities"])
  })
  test("a heading with a suffix is still a heading", () => {
    const out = parsePosting("We are offering an internship in Amsterdam.\n\nAbout the team - GameDistribution\nWe produce, license and distribute games to entertain players across platforms.", "Azerion")
    expect(out.sections.map((s) => s.key)).toEqual(["about", "team"])
  })
  test("equal-opportunity and privacy text is kept, last", () => {
    const out = parsePosting("About the role\nYou will help.\n\nWhat we offer\n- a\n- b\n\nEqual Opportunity Statement\nWe are an equal opportunity employer and welcome everyone to apply.", "X")
    expect(out.sections.map((s) => s.key)).toEqual(["about", "offer", "legal"])
  })
  test("any 'About <name>' is the company, 'About the project' is not", () => {
    expect(keys("About JetBrains\nWe make developer tools used by many people every day.\n")).toEqual(["company"])
    expect(keys("About the project\nYou will work on a data platform used across the firm.\n")).toEqual(["about"])
  })
  test("never throws and never returns an empty section, whatever it is given", () => {
    for (const weird of ["", "\n\n\n", "-", "• ", "###", "About", "x".repeat(20000), "What we offer", "\u0000\u0001", "- a\n- b\n- c", "A:\nB:\nC:", "<script>alert(1)</script>"]) {
      const out = parsePosting(weird, "X")
      for (const sec of out.sections) expect(sec.title !== "" || sec.blocks.length > 0).toBe(true)
    }
  })
})

// Real postings, including the ones that once broke it (Mploy: a whole posting under a "clutter" heading; Azerion: a heading with a suffix).
// A new employer's format that breaks the sorting shows up here, and in scripts/audit-display.ts on the live data.
describe("real postings", () => {
  const corpus = JSON.parse(require("node:fs").readFileSync(new URL("./job-sections.fixtures.json", import.meta.url), "utf8")) as Array<{ id: string; employer: string; body: string }>
  const words = (t: string): string[] => t.toLowerCase().replace(/[’‘´`]/g, "'").match(/[a-z0-9À-ɏ']{3,}/g) ?? []
  const plain = (t: string): string => t.replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/\n{3,}/g, "\n\n")

  test("every posting sorts without an error, into non-empty sections", () => {
    for (const p of corpus) {
      const out = parsePosting(plain(p.body), p.employer)
      expect(out.sections.length).toBeGreaterThan(0)
      for (const s of out.sections) expect(s.title !== "" || s.blocks.length > 0).toBe(true)
    }
  })
  test("every word of the posting is still there", () => {
    for (const p of corpus) {
      const text = plain(p.body)
      const had = new Set(words(text))
      if (had.size < 40) continue
      const out = parsePosting(text, p.employer)
      const kept = new Set(words(JSON.stringify(out.sections) + JSON.stringify(out.details) + JSON.stringify(out.page)))
      const share = [...had].filter((w) => kept.has(w)).length / had.size
      expect(`${p.id} ${share >= 0.99}`).toBe(`${p.id} true`)
    }
  })
})

describe("messy text made readable, without changing a word", () => {
  const body = (text: string) => parsePosting(text, "X")
  const words = (t: string): string[] => t.toLowerCase().match(/[a-z0-9']{2,}/g) ?? []
  const same = (before: string): void => {
    const out = body(before)
    const after = JSON.stringify(out.sections) + JSON.stringify(out.details) + JSON.stringify(out.page)
    for (const w of new Set(words(before))) expect(after.toLowerCase()).toContain(w)
  }

  test("two headings in a row both stay, as bold headings", () => {
    const out = body("Your profile\nQualifications\n- A degree in finance or similar\n- Good English in speech and writing")
    expect(out.sections.map((s) => s.title)).toEqual(["Your profile", "Qualifications"])
    expect(out.sections[0].blocks).toEqual([])
  })
  test("a label over its value becomes a fact", () => {
    const out = body("Work Schedule\n\nStandard (Mon-Fri)\n\nEnvironmental Conditions\n\nOffice\n\nAbout the role\nYou will help the team in many ways every day.")
    expect(out.details).toEqual([
      { label: "Work Schedule", value: "Standard (Mon-Fri)" },
      { label: "Environmental Conditions", value: "Office" },
    ])
  })
  test("the website's footer is set apart, the employer's words are not", () => {
    const out = body("About the role\nYou will help the team with many things every single day.\nChallenge, change, impact!\nApply now\n11 days remaining\nSave\nEmployer information\nTU Delft\nInteresting for you\nStart the e-learning\nAbout AcademicTransfer\nFind jobs\nPost a job\nSave job")
    expect(JSON.stringify(out.sections)).toContain("Challenge, change, impact!")
    expect(JSON.stringify(out.sections)).not.toContain("Interesting for you")
    expect(out.page).toContain("Interesting for you")
    expect(out.page).toContain("Apply now")
  })
  test("a list written with semicolons becomes a list, with its lead-in kept", () => {
    const out = body("Responsibilities\nExamples of activities: You support the business analysis work; You help clarify and document requirements; You contribute to planning and coordination; You communicate progress and risks clearly.")
    const blocks = out.sections[0].blocks
    expect(blocks[0]).toEqual({ kind: "p", text: "Examples of activities:" })
    expect(blocks[1].kind).toBe("ul")
    expect((blocks[1] as { items: string[] }).items).toHaveLength(4)
    same("Examples of activities: You support the business analysis work; You help clarify and document requirements; You contribute to planning and coordination; You communicate progress and risks clearly.")
  })
  test("items separated by a dot become a list", () => {
    const out = body("What we offer\n€2,000 learning budget · Courses, certifications and conferences · 25 days of paid vacation per year · Extra day off on your birthday")
    expect(out.sections[0].blocks[0].kind).toBe("ul")
  })
  test("sentences run together are separated, but addresses are not", () => {
    const out = body("What you'll do\nMonitor remote activities.Assess investigational product accountability.Review the source documents.Write the visit reports.Contact Maartje.Vinken@rabobank.nl for questions.")
    const all = JSON.stringify(out.sections)
    expect(all).toContain("Maartje.Vinken@rabobank.nl")
    expect(all).not.toContain("activities.Assess")
  })
  test("a wall of text is broken into paragraphs at sentence ends, with every word kept", () => {
    const sentence = "The team works on a data platform that is used across the whole firm every day. "
    const wall = sentence.repeat(20).trim()
    const out = body(`About the role\n${wall}`)
    expect(out.sections[0].blocks.length).toBeGreaterThan(2)
    for (const b of out.sections[0].blocks) if (b.kind === "p") expect(b.text.length).toBeLessThan(700)
    same(wall)
  })
  test("abbreviations do not end a sentence", () => {
    const text = "We use tools, e.g. Excel and SQL, and i.e. the standard ones. " + "Filler sentence about the team and what it does every day of the week. ".repeat(12)
    const out = body(`About the role\n${text}`)
    const all = out.sections[0].blocks.map((b) => (b.kind === "p" ? b.text : b.items.join(" "))).join(" ")
    expect(all).toContain("e.g. Excel and SQL")
  })
  test("list items that lost their bullets stay separate lines, not one run-on paragraph", () => {
    const out = body("What you'll do\nSupport the FP&A team with forecasting, budgeting, and monthly management reporting\nWork with the QBA team on data analysis, automation, and process improvement using SQL and Python\nBuild and maintain dashboards and KPIs to help stakeholders monitor financial performance\nCollaborate with commercial, operations, and technical teams to provide data-driven financial insights")
    const b = out.sections[0].blocks[0]
    expect(b.kind).toBe("ul")
    expect((b as { items: string[] }).items).toHaveLength(4)
  })
  test("a heading that starts with a known phrase is recognised whatever follows it", () => {
    expect(body("✅ What you bring to the table\n- one one one one\n- two two two two").sections.map((s) => s.key)).toEqual(["requirements"])
    expect(body("What we offer you in return\n- one one one one\n- two two two two").sections.map((s) => s.key)).toEqual(["offer"])
  })
})
