import { useState } from "react"
import { XIcon } from "@/components/icons"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { Profile, Row } from "@/lib/types"

/** Draft edits stay inside setup until the person confirms the profile. */
export function ProfileReview({ profile, onChange }: { profile: Profile; onChange: (next: Profile) => void }): React.JSX.Element {
  const [editingSkill, setEditingSkill] = useState<number | null>(null)
  const collections: Array<{ key: "positions" | "education" | "skills"; title: string; noun: string; fields: Array<[string, string]> }> = [
    { key: "positions", title: "Experience", noun: "role", fields: [["Title", "Job title"], ["Company Name", "Company"], ["Location", "Location"], ["Started On", "Started"], ["Finished On", "Finished"], ["Description", "What you did"]] },
    { key: "education", title: "Education", noun: "degree", fields: [["School Name", "School"], ["Degree Name", "Degree"], ["Field Of Study", "Field of study"], ["Start Date", "Started"], ["End Date", "Finished"]] },
    { key: "skills", title: "Skills", noun: "skill", fields: [["Name", "Skill"]] },
  ]
  return <div className="flex flex-col gap-4">
    <label className="flex flex-col gap-1.5 text-sm font-semibold">Full name<Input value={profile.name} onChange={(e) => onChange({ ...profile, name: e.target.value })} /></label>
    <label className="flex flex-col gap-1.5 text-sm font-semibold">Headline<Input value={profile.headline} onChange={(e) => onChange({ ...profile, headline: e.target.value })} /></label>
    {collections.map(({ key, title, noun, fields }) => {
      const rows = profile[key]
      const put = (next: Row[]): void => onChange({ ...profile, [key]: next })
      if (key === "skills") return <section key={key} aria-label="Review Skills" className="rounded-xl border p-4"><h3 className="mb-3 text-base font-bold">Skills</h3><div className="flex flex-wrap gap-1.5">{rows.map((row, index) => <span key={index} className="inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1">{editingSkill === index ? <input autoFocus aria-label={`Skills ${index + 1}: Skill`} value={row.Name ?? ""} placeholder="New skill" onBlur={() => setEditingSkill(null)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingSkill(null) }} onChange={(e) => put(rows.map((r, n) => n === index ? { ...r, Name: e.target.value } : r))} style={{ width: `${Math.max(7, (row.Name ?? "").length + 1)}ch` }} className="min-w-0 max-w-full bg-transparent outline-none" /> : <button type="button" aria-label={`Edit skill ${row.Name || index + 1}`} onClick={() => setEditingSkill(index)} className="cursor-pointer text-left text-xs font-medium">{row.Name || "New skill"}</button>}<button type="button" aria-label={`Remove ${row.Name || "skill"}`} onClick={() => put(rows.filter((_, n) => n !== index))} className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-secondary"><XIcon className="size-3" aria-hidden="true" /></button></span>)}</div><Button variant="outline" size="sm" className="mt-3" onClick={() => { setEditingSkill(rows.length); put([...rows, { Name: "" }]) }}>Add skill</Button></section>
      return <section key={key} aria-label={`Review ${title}`} className="rounded-xl border p-4">
        <h3 className="mb-3 text-base font-bold">{title}</h3>
        {rows.length === 0 ? <p className="mb-3 text-sm">No {title.toLowerCase()} added yet.</p> : null}
        <div className="flex flex-col gap-2">{rows.map((row, index) => <details key={`${key}-${index}`} className="rounded-lg border open:border-brand/50">
          <summary className="cursor-pointer px-3 py-3 text-sm font-semibold">{row.Title || row["School Name"] || row.Name || `New ${noun}`}<span className="mt-1 block pl-4 text-xs font-medium">{[row["Company Name"], row["Degree Name"], key === "positions" ? [row["Started On"], row["Finished On"] || "Present"].filter(Boolean).join(" – ") : ""].filter(Boolean).join(" · ")}</span></summary>
          <div className="flex flex-col gap-3 border-t p-3">{fields.map(([column, label]) => <label key={column} className="flex flex-col gap-1 text-xs font-semibold">{label}<Input aria-label={`${title} ${index + 1}: ${label}`} value={row[column] ?? ""} onChange={(e) => put(rows.map((r, n) => n === index ? { ...r, [column]: e.target.value } : r))} /></label>)}<Button variant="ghost" size="sm" className="w-fit" onClick={() => put(rows.filter((_, n) => n !== index))}>Remove {noun}</Button></div>
        </details>)}</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => put([...rows, Object.fromEntries(fields.map(([column]) => [column, ""]))])}>Add {noun}</Button>
      </section>
    })}
  </div>
}
