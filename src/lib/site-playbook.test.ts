import { describe, expect, test } from "bun:test"
import { assessLesson, playbookFor, sanitizeLesson, siteIdentity, structuralField, type Evidence } from "../../supabase/functions/_shared/site-playbook"
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
  test("age decays confidence; host and ATS copies never double-count evidence", () => {
    expect(assessLesson({...evidence(5),last_success:"2025-01-01"},now).active).toBe(false)
    expect(playbookFor([{lessons:{a:evidence(5)}},{lessons:{b:evidence(5)}}],now).recipes).toHaveLength(1)
    expect(siteIdentity("https://jobs.eu.lever.co/acme/id?email=private@example.com")).toEqual({host:"jobs.eu.lever.co",ats:"lever"})
  })
})
