import { describe, expect, test } from "bun:test"
import { assessLesson, fieldPattern, playbookFor, sanitizeLesson, siteIdentity, structuralField, type Evidence } from "../../supabase/functions/_shared/site-playbook"
const now = Date.parse("2026-10-16T12:00:00Z")
const evidence = (n = 3): Evidence => ({ lesson: {kind:"opener",button:"Apply"}, successes:n, failures:0, source_runs:Array.from({length:n},(_,i)=>`run-${i}`),last_success:new Date(now).toISOString() })
describe("site playbook privacy and promotion", () => {
  test("closed vocabulary strips arbitrary personal properties and rejects personal labels", () => {
    expect(sanitizeLesson({kind:"opener",button:"Apply",name:"Private Person",email:"private@example.com",value:"+31612345678",answer:"Secret"})).toEqual({kind:"opener",button:"Apply"})
    expect(sanitizeLesson({kind:"opener",button:"Apply for Private Person"})).toBeNull()
    expect(sanitizeLesson({kind:"mapping",field:"private@example.com",method:"typing",autofill_key:"email"})).toBeNull()
    expect(sanitizeLesson({kind:"opener",button:"Submit"})).toBeNull()
    expect(structuralField("Your email private@example.com")).toBeNull()
    expect(structuralField("First name *")).toBe("first_name")
  })
  test("requires three independent successful runs, not repeated evidence from one", () => {
    expect(assessLesson(evidence(2),now).active).toBe(false)
    expect(assessLesson(evidence(),now).active).toBe(true)
    expect(assessLesson({...evidence(),source_runs:["same","same","same"]},now).active).toBe(false)
  })
  test("five successes permit safe click recipes; failure suppresses them and three retires", () => {
    expect(playbookFor([{lessons:{apply:evidence(5)}}],now).recipes).toHaveLength(1)
    expect(playbookFor([{lessons:{apply:{...evidence(5),failures:1,last_failure:new Date(now).toISOString()}}}],now).recipes).toHaveLength(0)
    expect(assessLesson({...evidence(20),failures:3},now).retired).toBe(true)
  })
  test("a recipe with a long clean record comes back a day after one old failure, not after two weeks", () => {
    const day = 86_400_000
    const proven = (failedAgo: number) => ({ ...evidence(30), failures: 1, last_failure: new Date(now - failedAgo).toISOString() })
    expect(playbookFor([{ lessons: { apply: proven(3 * day) } }], now).recipes).toHaveLength(1)
    expect(playbookFor([{ lessons: { apply: proven(day / 2) } }], now).recipes).toHaveLength(0)
    expect(playbookFor([{ lessons: { apply: { ...evidence(6), failures: 1, last_failure: new Date(now - 3 * day).toISOString() } } }], now).recipes).toHaveLength(0)
  })
  test("age decays confidence; host and ATS copies never double-count evidence", () => {
    expect(assessLesson({...evidence(5),last_success:"2025-01-01"},now).active).toBe(false)
    expect(playbookFor([{lessons:{a:evidence(5)}},{lessons:{b:evidence(5)}}],now).recipes).toHaveLength(1)
    expect(siteIdentity("https://jobs.eu.lever.co/acme/id?email=private@example.com")).toEqual({host:"jobs.eu.lever.co",ats:"lever"})
  })
  test("field mappings keep only a plain label pattern and position, never a value or file name", () => {
    expect(sanitizeLesson({kind:"mapping",field:"cv",method:"upload",autofill_key:"cv",label:"attach",nth:0,value:"Private_CV.pdf"})).toEqual({kind:"mapping",field:"cv",method:"upload",autofill_key:"cv",label:"attach",nth:0})
    expect(fieldPattern("Resume/CV ✱ PRIVATE_CV.PDF")).toBeNull()
    expect(fieldPattern("Email private@example.com")).toBeNull()
    expect(fieldPattern("Preferred First Name *")).toBe("preferred first name")
    expect(sanitizeLesson({kind:"mapping",field:"email",method:"typing",autofill_key:"email",label:"Email *"})).toBeNull()
    expect(sanitizeLesson({kind:"mapping",field:"email",method:"upload",autofill_key:"email",label:"email"})).toBeNull()
    expect(sanitizeLesson({kind:"mapping",field:"email",method:"typing",autofill_key:"email",label:"email",nth:9})).toBeNull()
    expect(sanitizeLesson({kind:"opener",button:"APPLY FOR THIS JOB"})).toEqual({kind:"opener",button:"Apply for this job"})
  })
  test("labelled mappings become recipes after three independent runs; a recent failure stops them", () => {
    const mapping = (n: number, extra: Partial<Evidence> = {}): Evidence => ({ ...evidence(n), lesson: {kind:"mapping",field:"cv",method:"upload",autofill_key:"cv",label:"attach",nth:0}, ...extra })
    expect(playbookFor([{lessons:{m:mapping(2)}}],now).recipes).toHaveLength(0)
    expect(playbookFor([{lessons:{m:mapping(3)}}],now).recipes).toHaveLength(1)
    expect(playbookFor([{lessons:{m:mapping(6,{failures:1,last_failure:new Date(now).toISOString()})}}],now).recipes).toHaveLength(0)
    // An unlabelled mapping says nothing about where the field is: never replayed.
    expect(playbookFor([{lessons:{m:{...evidence(6),lesson:{kind:"mapping",field:"email",method:"typing",autofill_key:"email"}}}}],now).recipes).toHaveLength(0)
  })
})
