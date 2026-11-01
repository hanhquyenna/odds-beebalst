import { describe, expect, test } from "bun:test"
import { computeShares, derive, standing } from "@/lib/engine"
import type { Reference } from "@/lib/jobs"
import { toFormState, toProfile } from "@/lib/journey"
import { DEFAULT_PROFILE, type Posting, type Profile } from "@/lib/types"

const ref = { bands: {}, transitions: {}, ageFactors: {}, tax: null } as unknown as Reference
const post = (enrollment: Posting["enrollment"], over: Partial<Posting> = {}): Posting =>
  ({
    id: "p1", employer: "acme", employer_display: "Acme", ats: "greenhouse", source: "ats_board", title: "Finance Intern", region: "Amsterdam, NL", cat: "finance_business", cbs_group: "0812",
    url: "https://example.com/1", ind_sponsor: true, ind_sponsor_name: "Acme", years_min: null, dutch_required: false, visa_mention: false, junior_title: false, degree_asked: null,
    skills: ["excel"], pay_posted: null, applicants: null, applicants_text: null, valid_through: null, seniority: "Internship", posted_at: null, days_open: 3, freshness_state: "fresh",
    fetched_at: null, title_clean: null, level_jev: "internship", level_conf: 1, usable: 1, industry: null, workplace: null, job_type: null, dutch_jev: null, family: null, enrollment, ...over,
  }) as unknown as Posting
const edu = (start: string, end: string) => ({ "School Name": "Erasmus University", "Degree Name": "MSc Finance", "Start Date": start, "End Date": end })
const profile = (education: Profile["education"], over: Partial<Profile> = {}): Profile => ({ ...DEFAULT_PROFILE, onboarded: true, cv: "Finance student. Excel.", skills: [{ Name: "Excel" }], education, ...over })
const year = new Date().getFullYear()
const shares = computeShares([post("open")])
const gate = (p: Profile, j: Posting) => standing(j, p, ref, shares).gates.find((g) => g.name === "Student")

describe("studying, worked out from the profile", () => {
  test("an education that ends in the future means studying", () => {
    expect(derive(profile([edu(`Sep ${year - 1}`, `Aug ${year + 1}`)])).studying).toBe(true)
  })
  test("an education that has ended means not studying, and says how long ago", () => {
    const d = derive(profile([edu(`Sep ${year - 3}`, `Jun ${year - 1}`)]))
    expect(d.studying).toBe(false)
    expect(d.graduatedMonthsAgo).toBeGreaterThan(9)
  })
  test("a start date with no end date means still studying", () => {
    expect(derive(profile([{ "School Name": "TU Delft", "Degree Name": "BSc", "Start Date": `Sep ${year - 1}` }])).studying).toBe(true)
  })
  test("an education with no dates at all is unknown too, never a no", () => {
    expect(derive(profile([{ "School Name": "Erasmus University", "Degree Name": "MSc Finance" }])).studying).toBeNull()
  })
  test("no education at all is unknown, not a no", () => {
    expect(derive(profile([])).studying).toBeNull()
  })
  test("a master's after a bachelor's: studying while the later one runs", () => {
    expect(derive(profile([edu(`Sep ${year - 5}`, `Jun ${year - 2}`), edu(`Sep ${year - 1}`, `Aug ${year + 1}`)])).studying).toBe(true)
  })
  test("the person's own answer beats the dates, both ways", () => {
    expect(derive(profile([edu(`Sep ${year - 3}`, `Jun ${year - 1}`)], { studying: true })).studying).toBe(true)
    expect(derive(profile([edu(`Sep ${year - 1}`, `Aug ${year + 1}`)], { studying: false })).studying).toBe(false)
    expect(derive(profile([], { studying: true })).studying).toBe(true)
  })
  test("unreadable dates never throw and never invent a graduation", () => {
    const d = derive(profile([{ "School Name": "X", "Degree Name": "BSc", "Start Date": "soon", "End Date": "later" }]))
    expect(d.studying).toBeNull()
    expect(d.graduatedMonthsAgo).toBeNull()
  })
})

describe("the Student gate", () => {
  const studentNow = profile([edu(`Sep ${year - 1}`, `Aug ${year + 1}`)])
  const graduated = profile([edu(`Sep ${year - 3}`, `Jun ${year - 1}`)])
  const unknown = profile([])

  test("a job that needs a student: a student passes, a graduate fails, someone who has not said is not ruled out", () => {
    expect(gate(studentNow, post("required"))?.status).toBe("pass")
    expect(gate(graduated, post("required"))?.status).toBe("fail")
    expect(gate(unknown, post("required"))?.status).toBe("unknown")
  })
  test("nothing is a hard gate: a graduate still gets a chance on a job that needs a student, and the unmet ask is counted", () => {
    expect(standing(post("required"), graduated, ref, shares).rate).not.toBeNull()
    expect(standing(post("required"), graduated, ref, shares).failing).toBeGreaterThan(0)
    expect(standing(post("required"), studentNow, ref, shares).rate).not.toBeNull()
  })
  test("someone who has not said is not blocked", () => {
    expect(standing(post("required"), unknown, ref, shares).failing).toBe(0)
  })
  test("a job open to students and recent graduates: a recent graduate passes, an older one fails", () => {
    const recent = profile([edu(`Sep ${year - 2}`, `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Math.max(0, new Date().getMonth() - 2)]} ${year}`)])
    expect(gate(recent, post("recent"))?.status).toBe("pass")
    expect(gate(graduated, post("recent"))?.status).toBe("fail")
    expect(gate(studentNow, post("recent"))?.status).toBe("pass")
  })
  test("a job open to everyone has no Student gate at all", () => {
    for (const p of [studentNow, graduated, unknown]) {
      expect(gate(p, post("open"))).toBeUndefined()
      expect(gate(p, post(null))).toBeUndefined()
      expect(gate(p, post(undefined))).toBeUndefined()
    }
  })
  test("saying you are studying switches a graduate's gate, and saying you are not switches a student's", () => {
    expect(gate({ ...graduated, studying: true }, post("required"))?.status).toBe("pass")
    expect(gate({ ...studentNow, studying: false }, post("required"))?.status).toBe("fail")
  })
  test("the reason says what the posting asks and what the profile says", () => {
    expect(gate(graduated, post("required"))?.why).toContain("asks for a current student")
    expect(gate(graduated, post("required"))?.why).toContain("not studying")
    expect(gate(unknown, post("required"))?.why).toContain("say whether you are studying")
  })
})

describe("the sign-up answer", () => {
  test("yes, no and not said become true, false and null, and come back the same", () => {
    for (const [answer, want] of [["yes", true], ["no", false], ["", null]] as const) {
      const p = toProfile({ ...toFormState(null), permit: "orientation_year", birth: "2000", abroad: "0", studying: answer }, DEFAULT_PROFILE)
      expect(p.studying).toBe(want)
      expect(toFormState({ ...p, onboarded: true }).studying).toBe(answer)
    }
  })
})
